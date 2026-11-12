import { readFile, writeFile } from 'node:fs/promises'
import { businessFlow } from '../large/business.mjs'
const count = Number(process.argv[2] ?? '10000')
if (![2000, 10000].includes(count)) throw new Error('Explicit 2000 or 10000 seat fixture required')
const directory = new URL(
  `../results/cloud-setup${count === 2000 ? '' : `-${count}`}/`,
  import.meta.url
)
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'))
const group = manifest.seats.filter((seat) => seat.conferenceId === manifest.seats[0].conferenceId)
const seats = [
  group.find((seat) => seat.expectedCapabilities.includes('draft_news')),
  group.find((seat) => seat.expectedCapabilities.includes('publish_situation'))
]
seats.push(group.find((seat) => !seats.includes(seat)))
const states = seats.map((seat, index) => ({ seat, index }))
const calls = []
async function request(state, operation, route, options = {}) {
  const started = performance.now()
  const response = await fetch(`${manifest.baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.json ? JSON.stringify(options.json) : undefined,
    signal: AbortSignal.timeout(30000),
    redirect: 'error'
  })
  let data
  try {
    data = await response.json()
  } catch {}
  const ok = response.ok && (!options.validate || options.validate(data))
  calls.push({
    operation,
    status: response.status,
    ok,
    errorClass: response.headers.get('x-veto-error-class'),
    elapsedMs: performance.now() - started
  })
  return ok ? data : null
}
for (const state of states) {
  const data = await request(state, 'auth', '/veto/join/authenticate', {
    method: 'POST',
    json: { inviteCode: state.seat.inviteCode, password: state.seat.password }
  })
  if (!data?.token) throw new Error('Smoke authentication failed')
  state.token = data.token
}
const results = []
for (const kind of ['news', 'directive', 'situation'])
  results.push(
    await businessFlow({
      kind,
      request,
      author: states[kind === 'situation' ? 1 : 0],
      reviewer: states[kind === 'situation' ? 0 : 1],
      reader: states[2],
      title: `smoke-${Date.now()}-${kind}`
    })
  )
await writeFile(
  new URL('business-smoke.json', directory),
  JSON.stringify({ results, calls }, null, 2)
)
console.log(JSON.stringify(results))
process.exitCode = results.every((result) => result.ok) ? 0 : 1
