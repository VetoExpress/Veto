import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { conferenceInput, organizerSeed, seatFixtures } from '../local/seed.mjs'
import { verifyLocalBusiness } from '../local/smoke.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const apiDir = path.resolve(dir, '../../../../veto-api')
const stateDir = path.resolve(dir, '../results/cloud-setup')
const fixturePath = path.resolve(dir, '../fixtures/cloud.seats.json')
const baseUrl = process.argv[2]
if (
  !baseUrl ||
  !/^https:\/\/(api\.miaoyww\.top|veto-usage\.miaoyww\.workers\.dev)\/v1$/.test(baseUrl)
)
  throw new Error('Explicit deployed Veto HTTPS target required')
await mkdir(stateDir, { recursive: true })
const manifestPath = path.join(stateDir, 'manifest.json')
let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (manifest && manifest.baseUrl !== baseUrl) throw new Error('Existing manifest target mismatch')
const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 })

async function api(route, options = {}) {
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
    signal: AbortSignal.timeout(60000),
    redirect: 'error'
  })
  if (response.status !== status) {
    let code = 'NON_JSON_ERROR'
    try {
      code = (await response.json()).error?.code ?? `HTTP_${response.status}`
    } catch {}
    throw new Error(`${method} ${route}: expected ${status}, got ${response.status} ${code}`)
  }
  return binary ? response.arrayBuffer() : response.json()
}

if (!manifest) {
  const seed = organizerSeed()
  manifest = {
    baseUrl,
    runId: randomUUID(),
    organizer: { email: seed.email, password: seed.password },
    conferenceIds: [],
    seats: [],
    claimed: [],
    createdAt: new Date().toISOString()
  }
  await save()
  const sqlPath = path.join(stateDir, 'organizer.sql')
  await writeFile(sqlPath, seed.sql, { mode: 0o600 })
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(apiDir, 'node_modules/wrangler/wrangler-dist/cli.js'),
        'd1',
        'execute',
        'DB',
        '--remote',
        '--file',
        sqlPath,
        '--yes'
      ],
      { cwd: apiDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', async (code) => {
      await writeFile(path.join(stateDir, 'seed-command.log'), output)
      code === 0
        ? resolve()
        : reject(new Error(`Organizer seed failed (${code}); inspect local command log`))
    })
  })
  manifest.seeded = true
  await save()
}
if (!manifest.seeded)
  throw new Error('Prior organizer seed incomplete; inspect manifest before continuing')
const login = await api('/auth/login', { method: 'POST', body: manifest.organizer })
if (!login.token) throw new Error('No organizer token')
manifest.organizerToken = login.token
await save()
for (let group = manifest.conferenceIds.length; group < 4; group++) {
  const input = conferenceInput(500)
  input.name = `CF pressure 2000 ${manifest.runId.slice(0, 8)} ${group + 1}`
  input.organizer = 'Veto isolated Cloudflare load test'
  input.endsAt = new Date(Date.now() + 3600000).toISOString()
  let { conference } = await api('/conferences', {
    method: 'POST',
    token: login.token,
    headers: { 'Idempotency-Key': `${manifest.runId}-${group}` },
    body: input,
    status: 201
  })
  const runtime = await api(`/conferences/${conference.id}/runtime`, {
    method: 'PUT',
    token: login.token,
    headers: { 'If-Match': `"${conference.version}"` },
    body: { timeline: { name: 'Cloud load timeline', initialSimTime: Date.now(), ratio: 1 } }
  })
  conference = runtime.conference
  const active = await api(`/conferences/${conference.id}/activate`, {
    method: 'POST',
    token: login.token,
    headers: { 'If-Match': `"${conference.version}"` }
  })
  manifest.conferenceIds.push(conference.id)
  manifest.seats.push(...seatFixtures(active.conference))
  await save()
  console.log(`[cloud-setup] Created ${group + 1}/4 conferences`)
}
const claimed = new Set(manifest.claimed)
let next = 0
const sessions = []
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < manifest.seats.length) {
      const index = next++
      const seat = manifest.seats[index]
      if (claimed.has(seat.seatId)) continue
      let session
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const preview = await api('/veto/join/validate', {
            method: 'POST',
            body: { inviteCode: seat.inviteCode }
          })
          session =
            preview.seatState === 'claimed'
              ? await api('/veto/join/authenticate', {
                  method: 'POST',
                  body: { inviteCode: seat.inviteCode, password: seat.password }
                })
              : await api('/veto/join/claim', {
                  method: 'POST',
                  status: 201,
                  body: {
                    inviteCode: seat.inviteCode,
                    password: seat.password,
                    displayName: `CF Load ${index + 1}`
                  }
                })
          break
        } catch (error) {
          if (attempt === 2) throw error
          console.warn(
            `[cloud-setup] Seat ${index}: setup transport/state check retry ${attempt + 1}`
          )
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      if (
        session.identity?.seatId !== seat.seatId ||
        session.identity?.conferenceId !== seat.conferenceId
      )
        throw new Error('Claim identity mismatch')
      sessions[index] = session
      claimed.add(seat.seatId)
      if (claimed.size % 100 === 0) {
        console.log(`[cloud-setup] Claimed ${claimed.size}/2000`)
        manifest.claimed = [...claimed]
        await save()
      }
    }
  })
)
manifest.claimed = [...claimed]
await save()
const representative = [
  manifest.seats[0],
  manifest.seats.find(
    (seat) =>
      seat.conferenceId === manifest.seats[0].conferenceId &&
      seat.expectedCapabilities.includes('publish_situation')
  )
]
const probes = []
for (const seat of representative)
  probes.push(
    await api('/veto/join/authenticate', {
      method: 'POST',
      body: { inviteCode: seat.inviteCode, password: seat.password }
    })
  )
const checks = await verifyLocalBusiness(api, baseUrl, probes)
const groups = manifest.conferenceIds.map((id) =>
  manifest.seats.filter((seat) => seat.conferenceId === id)
)
const seats = Array.from({ length: 500 }, (_, index) => groups.map((group) => group[index])).flat()
await writeFile(fixturePath, JSON.stringify({ seats }, null, 2), { mode: 0o600 })
await writeFile(
  path.join(stateDir, 'ready.json'),
  JSON.stringify(
    { baseUrl, seats: seats.length, conferences: manifest.conferenceIds, checks, fixturePath },
    null,
    2
  )
)
console.log(`[cloud-setup] READY ${seats.length} seats, real HTTPS/WSS/R2 business checks passed`)
