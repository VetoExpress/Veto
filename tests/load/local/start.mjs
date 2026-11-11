import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, mkdir, open, readFile, writeFile, unlink } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import { organizerSeed, conferenceInput, seatFixtures } from './seed.mjs'
import { verifyLocalBusiness } from './smoke.mjs'

const localDir = path.dirname(fileURLToPath(import.meta.url))
const stateDir = path.join(localDir, '.state')
const fixturePath = path.resolve(localDir, '../fixtures/local.seats.json')
const configPath = path.join(stateDir, 'wrangler.json')
const lockPath = path.join(stateDir, 'start.lock')
const children = new Set()
let stopping = false
let lock
let shutdownPromise

const help = `Usage: node tests/load/local/start.mjs [options]

  --seats N       Independent claimed seats (default 2; 2..10000, minimum 2).
                  Alternating MPC/IPC seats; each committee has at most 500.
  --conferences N Number of independent conferences (default 1).
  --claim-concurrency N Concurrent setup claims (default 8).
  --reuse         Reuse the existing isolated credentials, without creating seats.
  --port PORT     Loopback HTTP port (default 8787).
  --api-dir PATH  Read-only veto-api checkout with installed Wrangler.
                  Default: ../veto-api relative to the Veto repository.
  --dry-run       Print local plan without writes or starting any process.
  --help, -h      Show help.

Uses only real workerd, D1, R2 and Durable Object local bindings. All state and
Wrangler build/log output stay under tests/load/local/.state. Never deploys or
uses remote bindings. No backend .dev.vars or external service secrets are loaded.
After migrations, HTTP setup, claims and smoke checks, writes:
  tests/load/fixtures/local.seats.json
The process stays alive until Ctrl+C (or q + Enter); use another terminal for k6.
`

function integer(value, name, min, max) {
  if (!/^\d+$/.test(value ?? '') || Number(value) < min || Number(value) > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}`)
  }
  return Number(value)
}

function localEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(CLOUDFLARE_|CF_|SES_|AWS_|WRANGLER_|INGEST_KEY$|NODE_OPTIONS$|HTTPS?_PROXY$|ALL_PROXY$)/i.test(
          key
        )
    )
  )
  return {
    ...env,
    CI: 'true',
    NO_COLOR: '1',
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_LOG_PATH: path.join(stateDir, 'logs'),
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false'
  }
}

async function ensurePortFree(port) {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', (error) =>
      reject(new Error(`Port ${port} is unavailable; choose --port`, { cause: error }))
    )
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}

function wrangler(wranglerCli, args, label, persistent = false) {
  if (stopping) throw new Error('Local startup interrupted')
  const logPath = path.join(stateDir, `${label}.log`)
  const log = createWriteStream(logPath, { flags: 'a' })
  // Use the installed CLI entry directly: its public bin wrapper spawns an extra
  // Node process. Keep the owned process tree small and explicit for shutdown.
  const child = spawn(
    process.execPath,
    ['--no-warnings', wranglerCli, ...args, '--config', configPath],
    { cwd: stateDir, env: localEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
  )
  children.add(child)
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      children.delete(child)
      log.end()
      if (code === 0 || stopping) resolve()
      else reject(new Error(`${label} exited (${code ?? signal}); inspect ${logPath}`))
    })
  })
  // Register a handler immediately while readiness/HTTP initialization is ongoing.
  finished.catch(() => {})
  if (!persistent) child.stdin.end()
  return { child, finished, logPath }
}

function shutdown() {
  if (shutdownPromise) return shutdownPromise
  stopping = true
  shutdownPromise = (async () => {
    process.stdin.pause()
    await Promise.all(
      [...children].map(
        (child) =>
          new Promise((resolve) => {
            child.once('close', resolve)
            child.stdin.end()
            if (process.platform === 'win32') {
              // Windows kill() only terminates the parent. Target this owned child
              // tree so workerd/esbuild cannot survive the launcher.
              const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true
              })
              killer.once('error', (error) => {
                console.error(`[local] Process-tree shutdown failed: ${error.message}`)
                child.kill()
              })
              killer.once('exit', (code) => {
                if (code && child.exitCode === null) {
                  console.error(`[local] taskkill exited ${code}; terminating owned child`)
                  child.kill()
                }
              })
            } else {
              child.kill('SIGTERM')
            }
          })
      )
    )
    if (lock) {
      await lock.close()
      await unlink(lockPath)
      lock = undefined
    }
  })()
  return shutdownPromise
}

async function main() {
  const { values } = parseArgs({
    options: {
      seats: { type: 'string', default: '2' },
      conferences: { type: 'string', default: '1' },
      'claim-concurrency': { type: 'string', default: '8' },
      reuse: { type: 'boolean', default: false },
      port: { type: 'string', default: '8787' },
      'api-dir': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    strict: true
  })
  if (values.help) {
    console.log(help)
    return
  }
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket !== 'function') {
    throw new Error('Node >=22 with built-in fetch and WebSocket is required')
  }
  const count = Math.max(2, integer(values.seats, '--seats', 1, 10000))
  const conferenceCount = integer(values.conferences, '--conferences', 1, Math.floor(count / 2))
  const claimConcurrency = integer(values['claim-concurrency'], '--claim-concurrency', 1, 32)
  const port = integer(values.port, '--port', 1024, 65535)
  const apiDir = path.resolve(values['api-dir'] ?? path.resolve(localDir, '../../../../veto-api'))
  const wranglerCli = path.join(apiDir, 'node_modules/wrangler/wrangler-dist/cli.js')
  for (const file of ['AGENTS.md', 'CONTEXT.md', 'src/index.ts', 'migrations/0001_initial.sql']) {
    await access(path.join(apiDir, file))
  }
  await access(wranglerCli)
  const backendConfig = JSON.parse(await readFile(path.join(apiDir, 'wrangler.jsonc'), 'utf8'))
  const baseUrl = `http://127.0.0.1:${port}/v1`
  const plan = {
    baseUrl,
    apiDir,
    seats: count,
    conferences: conferenceCount,
    stateDir,
    fixturePath,
    commands: [
      ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir],
      [
        'd1',
        'execute',
        'DB',
        '--local',
        '--persist-to',
        stateDir,
        '--file',
        path.join(stateDir, 'organizer.sql')
      ],
      [
        'dev',
        '--local',
        '--persist-to',
        stateDir,
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--local-protocol',
        'http'
      ]
    ]
  }
  if (values['dry-run']) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }
  await ensurePortFree(port)
  await mkdir(stateDir, { recursive: true })
  try {
    lock = await open(lockPath, 'wx')
    await lock.writeFile(JSON.stringify({ pid: process.pid, port }))
  } catch (error) {
    throw new Error(
      `Cannot acquire ${lockPath}. Another local startup may be running; inspect its PID before removing a stale lock.`,
      { cause: error }
    )
  }
  const slash = (value) => value.replaceAll('\\', '/')
  // A separate config avoids backend writes and production identifiers/secrets.
  // Binding names/classes match the actual Worker; local workerd supplies them.
  const config = {
    name: 'veto-load-local',
    main: slash(path.join(apiDir, backendConfig.main)),
    compatibility_date: backendConfig.compatibility_date,
    compatibility_flags: backendConfig.compatibility_flags,
    alias: Object.fromEntries(
      Object.entries(backendConfig.alias ?? {}).map(([key, value]) => [
        key,
        slash(path.resolve(apiDir, value))
      ])
    ),
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'veto-load-local',
        database_id: '00000000-0000-4000-8000-000000000001',
        migrations_dir: slash(path.join(apiDir, 'migrations'))
      }
    ],
    r2_buckets: [{ binding: 'FILES', bucket_name: 'veto-load-local-files' }],
    durable_objects: backendConfig.durable_objects,
    migrations: backendConfig.migrations,
    analytics_engine_datasets: [{ binding: 'ANALYTICS', dataset: 'veto_load_local' }],
    vars: { ALLOWED_ORIGINS: `http://127.0.0.1:${port},veto://app`, LOAD_DIAGNOSTICS: '1' },
    observability: { enabled: true, head_sampling_rate: 0.01 }
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`[local] Applying backend migrations to ${stateDir}`)
  await wrangler(wranglerCli, plan.commands[0], 'migrations').finished
  const organizer = organizerSeed()
  await writeFile(path.join(stateDir, 'organizer.sql'), organizer.sql, { mode: 0o600 })
  await wrangler(wranglerCli, plan.commands[1], 'organizer-seed').finished
  const worker = wrangler(wranglerCli, plan.commands[2], 'worker', true)
  console.log(`[local] Starting real Worker at ${baseUrl}; log: ${worker.logPath}`)
  let healthy = false
  const deadline = Date.now() + 90000
  while (Date.now() < deadline && !stopping) {
    if (worker.child.exitCode !== null) throw new Error(`Worker exited; inspect ${worker.logPath}`)
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) })
      healthy = response.ok && (await response.json()).ok
      if (healthy) break
    } catch {
      // Connection refusal during workerd startup is expected; the deadline is bounded.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!healthy) throw new Error(`Worker was not healthy in 90 seconds; inspect ${worker.logPath}`)

  async function api(route, options = {}) {
    if (stopping) throw new Error('Local startup interrupted')
    const { method = 'GET', token, headers = {}, body, status = 200, binary = false } = options
    const raw = Buffer.isBuffer(body)
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    })
    if (response.status !== status) {
      const text = (await response.text()).slice(0, 1600)
      throw new Error(`${method} ${route}: expected ${status}, got ${response.status}: ${text}`)
    }
    if (binary) return response.arrayBuffer()
    try {
      return await response.json()
    } catch {
      throw new Error(`${method} ${route}: response ${response.status} had no valid JSON`)
    }
  }

  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '127.0.0.1' },
    body: { email: organizer.email, password: organizer.password }
  })
  if (!login.token) throw new Error('Organizer login returned no token')
  let seats = []
  const conferenceIds = []
  if (values.reuse) {
    seats = JSON.parse(await readFile(fixturePath, 'utf8')).seats
    if (seats.length !== count) throw new Error('Reused fixture seat count does not match --seats')
    conferenceIds.push(...new Set(seats.map((seat) => seat.conferenceId)))
    if (conferenceIds.length !== conferenceCount)
      throw new Error('Reused conference count mismatch')
  } else
    for (let group = 0; group < conferenceCount; group++) {
      const groupCount =
        Math.floor(count / conferenceCount) + (group < count % conferenceCount ? 1 : 0)
      const created = await api('/conferences', {
        method: 'POST',
        token: login.token,
        headers: { 'Idempotency-Key': randomUUID() },
        body: conferenceInput(groupCount),
        status: 201
      })
      let conference = created.conference
      const runtime = await api(`/conferences/${conference.id}/runtime`, {
        method: 'PUT',
        token: login.token,
        headers: { 'If-Match': `"${conference.version}"` },
        body: { timeline: { name: 'Local load timeline', initialSimTime: Date.now(), ratio: 1 } }
      })
      conference = runtime.conference
      const active = await api(`/conferences/${conference.id}/activate`, {
        method: 'POST',
        token: login.token,
        headers: { 'If-Match': `"${conference.version}"` }
      })
      if (active.conference.lifecycle !== 'active') throw new Error('Conference did not activate')
      seats.push(...seatFixtures(active.conference))
      conferenceIds.push(conference.id)
      console.log(`[local] Created conference ${group + 1}/${conferenceCount}: ${groupCount} seats`)
    }
  // Spread adjacent fixture entries over conferences for a balanced connection ramp.
  const grouped = conferenceIds.map((id) => seats.filter((seat) => seat.conferenceId === id))
  seats = Array.from({ length: Math.max(...grouped.map((group) => group.length)) }, (_, index) =>
    grouped.flatMap((group) => (group[index] ? [group[index]] : []))
  ).flat()
  const sessions = []
  console.log(
    `[local] ${values.reuse ? 'Reusing' : 'Claiming'} ${seats.length} independent seats through HTTP`
  )
  let nextClaim = 0
  let completedClaims = 0
  await Promise.all(
    Array.from({ length: values.reuse ? 0 : claimConcurrency }, async () => {
      while (nextClaim < seats.length) {
        const index = nextClaim++
        const seat = seats[index]
        const session = await api('/veto/join/claim', {
          method: 'POST',
          body: {
            inviteCode: seat.inviteCode,
            password: seat.password,
            displayName: `Load ${index + 1}`
          },
          status: 201
        })
        if (
          session.identity?.seatId !== seat.seatId ||
          session.identity?.conferenceId !== seat.conferenceId ||
          session.identity?.committeeId !== seat.committeeId ||
          !seat.expectedCapabilities.every((capability) =>
            session.capabilities.includes(capability)
          )
        ) {
          throw new Error(`Claim identity/capabilities mismatch for fixture index ${index}`)
        }
        sessions[index] = session
        completedClaims++
        if (completedClaims % 500 === 0)
          console.log(`[local] Claimed ${completedClaims}/${seats.length}`)
      }
    })
  )
  // Reauthenticate one representative of each type, checking real password verification
  // before the WS/business probe. Authentication replaces that seat's previous token.
  const probes = [
    0,
    seats.findIndex((seat) => seat.expectedCapabilities.includes('publish_situation'))
  ]
  const probeSessions = []
  for (const index of probes) {
    sessions[index] = await api('/veto/join/authenticate', {
      method: 'POST',
      body: { inviteCode: seats[index].inviteCode, password: seats[index].password }
    })
    probeSessions.push(sessions[index])
  }
  // Business smoke requires both types from the same conference.
  const firstConference = seats[0].conferenceId
  const ipcIndex = seats.findIndex(
    (seat) =>
      seat.conferenceId === firstConference &&
      seat.expectedCapabilities.includes('publish_situation')
  )
  if (ipcIndex !== probes[1])
    probeSessions[1] = await api('/veto/join/authenticate', {
      method: 'POST',
      body: { inviteCode: seats[ipcIndex].inviteCode, password: seats[ipcIndex].password }
    })
  const verification = await verifyLocalBusiness(api, baseUrl, probeSessions)
  // Publish credentials only after all binding and application checks have passed.
  await mkdir(path.dirname(fixturePath), { recursive: true })
  await writeFile(fixturePath, `${JSON.stringify({ seats }, null, 2)}\n`, { mode: 0o600 })
  await writeFile(
    path.join(stateDir, 'ready.json'),
    `${JSON.stringify(
      {
        baseUrl,
        pid: process.pid,
        workerPid: worker.child.pid,
        conferenceIds,
        seats: seats.length,
        fixturePath,
        ...verification
      },
      null,
      2
    )}\n`
  )
  console.log(`[local] READY ${baseUrl}`)
  console.log(`[local] ${seats.length} seats: ${fixturePath}`)
  console.log(`[local] Verified: ${verification.checks.join('; ')}`)
  console.log('[local] Keep this process running for k6. Ctrl+C stops the local Worker.')
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (data) => {
    if (data.includes('\u0003') || data.trim().toLowerCase() === 'q') {
      shutdown().catch((error) => {
        console.error(`[local] Shutdown failed: ${error.message}`)
        process.exitCode = 1
      })
    }
  })
  await worker.finished
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown().catch((error) => {
      console.error(`[local] Shutdown failed: ${error.message}`)
      process.exitCode = 1
    })
  })
}

try {
  await main()
} catch (error) {
  console.error(`[local] ${error.name}: ${error.message}`)
  if (error.cause?.message) console.error(`[local] Cause: ${error.cause.message}`)
  process.exitCode = 1
} finally {
  await shutdown()
}
