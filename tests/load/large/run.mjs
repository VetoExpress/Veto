import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { Gate, aggregate, parseTiming, distribution } from './metrics.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const { values } = parseArgs({
  options: {
    seats: { type: 'string', default: '10000' },
    ramp: { type: 'string', default: '240' },
    window: { type: 'string', default: '120' },
    concurrency: { type: 'string', default: '128' },
    label: { type: 'string', default: 'baseline' },
    environment: { type: 'string', default: 'local' },
    deployment: { type: 'string' },
    'api-dir': { type: 'string', default: path.resolve(directory, '../../../../veto-api') },
    target: { type: 'string', default: 'http://127.0.0.1:8797/v1' },
    credentials: {
      type: 'string',
      default: path.resolve(directory, '../fixtures/local.seats.json')
    }
  }
})
const number = (key, min, max) => {
  const value = Number(values[key])
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid --${key}`)
  return value
}
const count = number('seats', 2, 10000)
const ramp = number('ramp', 0, 1800)
const windowSeconds = number('window', 10, 1800)
const concurrency = number('concurrency', 1, 512)
const target = new URL(values.target)
const cloud = values.environment === 'cloudflare'
if (
  !['local', 'cloudflare'].includes(values.environment) ||
  target.pathname !== '/v1' ||
  target.username ||
  target.password ||
  target.search ||
  target.hash
)
  throw new Error('Invalid environment or /v1 target')
if (cloud) {
  if (
    !process.argv.includes('--target') ||
    !process.argv.includes('--credentials') ||
    target.protocol !== 'https:' ||
    !values.deployment
  )
    throw new Error('Cloud run needs explicit HTTPS target, credentials and verified deployment ID')
} else if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname))
  throw new Error('Local target must be loopback HTTP')
if (!/^[a-z0-9-]{1,40}$/.test(values.label)) throw new Error('Invalid --label')
const require = createRequire(path.resolve(values['api-dir'], 'package.json'))
const { Pool } = require('undici')
const WebSocket = require('ws')
const fixture = JSON.parse(await readFile(values.credentials, 'utf8')).seats.slice(0, count)
if (fixture.length !== count || new Set(fixture.map((seat) => seat.seatId)).size !== count)
  throw new Error('Need unique independent seat credentials')
const resultDir = path.resolve(
  directory,
  '../results',
  `${new Date().toISOString().replaceAll(':', '-')}-${values.label}`
)
await mkdir(resultDir, { recursive: true })
const output = createWriteStream(path.join(resultDir, 'requests.jsonl'))
let outputError
output.on('error', (error) => {
  outputError = error
})
const pool = new Pool(target.origin, {
  connections: concurrency,
  pipelining: 1,
  headersTimeout: 30000,
  bodyTimeout: 30000
})
const gate = new Gate(concurrency)
const samples = []
const states = fixture.map((seat, index) => ({
  seat,
  index,
  ready: false,
  auth: false,
  socket: null,
  pending: new Set(),
  refreshing: false,
  lastPong: 0,
  windowFailed: false,
  readyMs: null
}))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
const runId = `large-${randomUUID()}`
const loop = monitorEventLoopDelay({ resolution: 20 })
loop.enable()
let phase = 'ramp'
let finished = false
let windowStart = Infinity
let windowEnd = Infinity
let notifications = 0
let wsErrors = 0
let wsCloses = 0
let wsFailures = 0
let drainedSamples = 0
let previousCpu = process.cpuUsage()
const health = []
const elapsedStart = performance.now()

async function request(state, operation, route, options = {}) {
  const issued = performance.now()
  const issuedPhase = phase
  let release, dispatched
  let status = 0,
    code = '',
    ttfbMs = null,
    bodyMs = null,
    data = null,
    server = {},
    bytes = 0
  let ok = false
  const deadline = AbortSignal.timeout(30000)
  try {
    release = await gate.enter(deadline)
    dispatched = performance.now()
    const response = await pool.request({
      path: `${target.pathname}${route}`,
      method: options.method ?? 'GET',
      headers: {
        ...(state?.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...options.headers,
        ...(options.json ? { 'content-type': 'application/json' } : {})
      },
      body: options.json ? JSON.stringify(options.json) : options.body,
      signal: deadline
    })
    ttfbMs = performance.now() - dispatched
    status = response.statusCode
    server = parseTiming(response.headers['server-timing'])
    const chunks = []
    const hash = options.hash ? createHash('sha256') : null
    for await (const chunk of response.body) {
      bytes += chunk.length
      if (hash) hash.update(chunk)
      else if (bytes <= 4 * 1024 * 1024) chunks.push(chunk)
      else throw new Error('RESPONSE_TOO_LARGE')
    }
    bodyMs = performance.now() - dispatched - ttfbMs
    ok = status >= 200 && status < 300
    if (hash) {
      if (!ok) code = `HTTP_${status}`
      else if (hash.digest('hex') !== options.hash) {
        ok = false
        code = 'HASH_MISMATCH'
      }
    } else {
      try {
        data = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        if (ok) {
          ok = false
          code = 'INVALID_JSON'
        }
      }
      if (!ok) code ||= data?.error?.code || `HTTP_${status}`
    }
    if (ok && options.validate && !options.validate(data)) {
      ok = false
      code = 'INVALID_IDENTITY_OR_RESULT'
    }
  } catch (error) {
    code = typeof error.code === 'string' ? error.code : error.name || 'TRANSPORT_ERROR'
  } finally {
    release?.()
  }
  const sample = {
    seat: state?.index,
    conference: state?.seat.conferenceId,
    phase: issuedPhase,
    operation,
    status,
    code,
    ok,
    queueMs: (dispatched ?? performance.now()) - issued,
    ttfbMs,
    bodyMs,
    totalMs: performance.now() - issued,
    server,
    bytes
  }
  samples.push(sample)
  if (ok) return data
  return null
}

const refreshPaths = {
  files: ['/veto/files', 'files'],
  news: ['/veto/news', 'news'],
  situations: ['/veto/situations', 'situations'],
  timeline: ['/veto/timeline', 'timeline'],
  directives: ['/veto/directives/mine', 'directives']
}
async function refresh(state) {
  if (state.refreshing || finished) return
  state.refreshing = true
  try {
    const topics = [...state.pending]
    state.pending.clear()
    for (const topic of topics) {
      const spec = refreshPaths[topic]
      if (spec && !finished) await request(state, `refresh.${spec[1]}`, spec[0])
    }
  } finally {
    state.refreshing = false
    if (state.pending.size && !finished) scheduleRefresh(state)
  }
}
function scheduleRefresh(state) {
  if (state.refreshTimer || state.refreshing || finished) return
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null
    refresh(state).catch(() => {
      wsErrors++
    })
  }, 250)
}

async function connect(state) {
  const auth = await request(state, 'seat.authenticate', '/veto/join/authenticate', {
    method: 'POST',
    json: { inviteCode: state.seat.inviteCode, password: state.seat.password },
    validate: (data) =>
      data?.identity?.seatId === state.seat.seatId &&
      data?.identity?.conferenceId === state.seat.conferenceId &&
      typeof data.token === 'string'
  })
  if (!auth) return
  state.auth = true
  state.token = auth.token
  const url = new URL(auth.wsUrl)
  if (url.host !== target.host || url.protocol !== (cloud ? 'wss:' : 'ws:'))
    throw new Error('UNTRUSTED_WS_URL')
  const started = performance.now()
  await new Promise((resolve) => {
    const socket = new WebSocket(url, ['veto', `token.${auth.token}`, 'live.v1'], {
      handshakeTimeout: 30000,
      perMessageDeflate: false
    })
    state.socket = socket
    const timer = setTimeout(() => {
      wsFailures++
      socket.terminate()
      resolve()
    }, 30000)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    socket.on('message', (buffer) => {
      const raw = buffer.toString()
      if (raw === 'pong') {
        state.lastPong = performance.now()
        return
      }
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        wsErrors++
        return
      }
      if (message.type === 'ready') {
        state.ready = true
        state.lastPong = performance.now()
        state.readyMs = performance.now() - started
        state.nextPing = performance.now() + (state.index % 20000)
        done()
      } else if (message.type === 'invalidate' && Array.isArray(message.topics)) {
        notifications++
        for (const topic of message.topics) state.pending.add(topic)
        scheduleRefresh(state)
      } else if (message.kind?.startsWith('file.')) {
        notifications++
        state.pending.add('files')
        scheduleRefresh(state)
      }
    })
    socket.on('error', () => {
      wsErrors++
      done()
    })
    socket.on('unexpected-response', (_request, response) => {
      wsFailures++
      response.resume()
      socket.terminate()
      done()
    })
    socket.on('close', () => {
      if (!finished) wsCloses++
      if (performance.now() >= windowStart && performance.now() < windowEnd)
        state.windowFailed = true
      state.ready = false
      done()
    })
  })
  if (state.ready) await request(state, 'committee.initial', '/veto/committee/current')
}

const heartbeat = setInterval(() => {
  const now = performance.now()
  for (const state of states)
    if (state.ready) {
      if (now - state.lastPong > 45000) {
        state.windowFailed = true
        state.socket.terminate()
      } else if (now >= state.nextPing && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send('ping')
        state.nextPing = now + 20000
      }
    }
}, 500)
const monitor = setInterval(() => {
  const cpu = process.cpuUsage(previousCpu)
  previousCpu = process.cpuUsage()
  health.push({
    seconds: Math.round((performance.now() - elapsedStart) / 1000),
    phase,
    authenticated: states.filter((state) => state.auth).length,
    ready: states.filter((state) => state.ready).length,
    httpActive: gate.active,
    httpQueued: gate.waiting.length,
    poolPending: pool.stats.pending,
    rss: process.memoryUsage().rss,
    heap: process.memoryUsage().heapUsed,
    systemFreeBytes: os.freemem(),
    clientCpuPercentOfOneCore: (cpu.user + cpu.system) / 100000,
    loopP95Ms: loop.percentile(95) / 1e6,
    loopMaxMs: loop.max / 1e6
  })
  loop.reset()
  for (; drainedSamples < samples.length; drainedSamples++)
    output.write(`${JSON.stringify(samples[drainedSamples])}\n`)
  const last = health.at(-1)
  writeFile(
    path.join(resultDir, 'checkpoint.json'),
    JSON.stringify({
      phase,
      requiredSeats: count,
      conferences: new Set(fixture.map((seat) => seat.conferenceId)).size,
      authenticated: last.authenticated,
      ready: last.ready,
      health,
      commonWindowStarted: windowStart !== Infinity,
      commonWindowCompleted: false
    })
  ).catch((error) => console.error(`Checkpoint failed: ${error.code}`))
  console.log(JSON.stringify(last))
}, 10000)

let fatal
try {
  console.log(`[large] Results: ${resultDir}`)
  const start = performance.now()
  const connecting = states.map(async (state) => {
    await sleep(start + (state.index / count) * ramp * 1000 - performance.now())
    await connect(state)
  })
  await Promise.all(connecting)
  // A shared, fixed window; failed seats stay failed and are never replaced or retried.
  windowStart = performance.now()
  windowEnd = windowStart + windowSeconds * 1000
  phase = 'online'
  for (const state of states) if (!state.ready) state.windowFailed = true
  console.log(
    `[large] Common online window started: ${states.filter((state) => state.ready).length}/${count} ready`
  )
  const buffers = [Buffer.alloc(65536, 17), Buffer.alloc(1048576, 31)]
  const hashes = buffers.map((buffer) => createHash('sha256').update(buffer).digest('hex'))
  const conferences = [...Map.groupBy(states, (state) => state.seat.conferenceId).values()]
  const writers = conferences.flatMap((group) => group.filter((state) => state.auth).slice(0, 5))
  let verifiedFiles = 0
  const jobs = states.map(async (state) => {
    if (!state.auth) return
    await sleep(((state.index % 30000) / count) * Math.min(30000, windowSeconds * 400))
    let sequence = 0
    while (performance.now() < windowEnd) {
      const route = ['/veto/files', '/veto/news', '/veto/situations'][sequence++ % 3]
      await request(state, `browse.${route.split('/').at(-1)}`, route)
      await sleep(Math.min(30000, Math.max(0, windowEnd - performance.now())))
    }
  })
  const writes = writers.map(async (state, index) => {
    await sleep(Math.min(20000, windowSeconds * 200) + index * 100)
    if (performance.now() >= windowEnd) return
    const buffer = buffers[index % buffers.length]
    const title = `${runId}-${index}`
    const uploaded = await request(state, 'file.upload', '/veto/files', {
      method: 'POST',
      body: buffer,
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': `${title}.bin`,
        'x-file-title': title,
        'x-file-type': runId,
        'x-file-size': String(buffer.length),
        'x-file-visibility': 'conference'
      },
      validate: (data) => typeof data?.file?.id === 'string' && data.file.size === buffer.length
    })
    if (uploaded) {
      const approved = await request(
        state,
        'file.approve',
        `/veto/files/${uploaded.file.id}/approve`,
        { method: 'POST', json: { note: 'Load test', visibility: 'conference' } }
      )
      if (approved) {
        const before = samples.length
        await request(state, 'file.download', `/veto/files/${uploaded.file.id}/download`, {
          hash: hashes[index % buffers.length]
        })
        if (
          samples
            .slice(before)
            .some(
              (sample) =>
                sample.operation === 'file.download' && sample.seat === state.index && sample.ok
            )
        )
          verifiedFiles++
      }
    }
    if (state.seat.expectedCapabilities.includes('publish_situation'))
      await request(state, 'situation.publish', '/veto/situations', {
        method: 'POST',
        json: { content: title, contentTime: Date.now() }
      })
    else
      await request(state, 'news.submit', '/veto/news', {
        method: 'POST',
        json: { source: 'Load test', title, content: title, contentTime: Date.now() },
        headers: { 'idempotency-key': title }
      })
  })
  await sleep(windowEnd - performance.now())
  const finalReady = states.filter((state) => state.ready).length
  const commonSeats = states.filter(
    (state) => state.ready && !state.windowFailed && performance.now() - state.lastPong <= 45000
  ).length
  phase = 'drain'
  finished = true
  await Promise.allSettled([...jobs, ...writes])
  // Wait for the one in-flight refresh per seat; no new refreshes can be scheduled.
  const drainDeadline = performance.now() + 60000
  while ((gate.active || gate.waiting.length) && performance.now() < drainDeadline) await sleep(100)
  const summary = {
    runId,
    label: values.label,
    environment: values.environment,
    cloudflareVerified: cloud,
    deployment: values.deployment ?? null,
    target: target.href,
    requiredSeats: count,
    conferences: conferences.length,
    rampSeconds: ramp,
    commonWindowSeconds: windowSeconds,
    concurrency,
    authenticated: states.filter((state) => state.auth).length,
    finalReady,
    commonSeats,
    wsErrors,
    wsCloses,
    wsFailures,
    notifications,
    plannedFiles: writers.length,
    verifiedFiles,
    wsReadyMs: distribution(
      states.flatMap((state) => (state.readyMs === null ? [] : [state.readyMs]))
    ),
    operations: aggregate(samples),
    health,
    passed:
      commonSeats === count &&
      samples.every((sample) => sample.ok) &&
      verifiedFiles === writers.length &&
      distribution(samples.filter((sample) => sample.ok).map((sample) => sample.totalMs)).p95 < 2000
  }
  await writeFile(path.join(resultDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(
    `[large] COMPLETE common=${commonSeats}/${count} files=${verifiedFiles}/${writers.length} requests=${samples.length} failed=${samples.filter((sample) => !sample.ok).length}`
  )
  process.exitCode = summary.passed ? 0 : 99
} catch (error) {
  fatal = error
  await writeFile(
    path.join(resultDir, 'fatal.json'),
    JSON.stringify({ name: error.name, message: error.message })
  )
  process.exitCode = 1
} finally {
  finished = true
  clearInterval(heartbeat)
  clearInterval(monitor)
  loop.disable()
  for (const state of states) {
    clearTimeout(state.refreshTimer)
    state.socket?.terminate()
  }
  await pool.destroy()
  for (; drainedSamples < samples.length; drainedSamples++)
    output.write(`${JSON.stringify(samples[drainedSamples])}\n`)
  output.end()
  await once(output, 'finish')
  if (outputError) throw outputError
  if (fatal) console.error(`[large] Failed: ${fatal.name}: ${fatal.message}`)
}
