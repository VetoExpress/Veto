import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const stateDir = path.resolve(directory, '../results/cloud-setup')
const manifest = JSON.parse(await readFile(path.join(stateDir, 'manifest.json'), 'utf8'))
if (manifest.conferenceIds.length !== 4 || !manifest.baseUrl.startsWith('https://api.miaoyww.top/'))
  throw new Error('Unexpected setup manifest')
async function api(route, options = {}) {
  const response = await fetch(`${manifest.baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${manifest.organizerToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(60000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`${route}: ${response.status}`)
  return response.json()
}
const results = []
for (const id of manifest.conferenceIds) {
  const { conference } = await api(`/conferences/${id}`)
  if (!conference.name.includes(manifest.runId.slice(0, 8)))
    throw new Error('Test conference marker mismatch')
  const { files } = await api(`/conferences/${id}/files`)
  let withdrawn = 0
  for (const file of files.filter((item) => item.status === 'published')) {
    await api(`/conferences/${id}/files/${file.id}/withdraw`, {
      method: 'POST',
      body: { reason: 'Cloudflare load test completed' }
    })
    withdrawn++
  }
  const closed = await api(`/conferences/${id}/close`, {
    method: 'POST',
    headers: { 'If-Match': `"${conference.version}"` }
  })
  await api(`/conferences/${id}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${closed.conference.version}"` }
  })
  results.push({
    conferenceId: id,
    publishedObjectsDeleted: withdrawn,
    closed: true,
    deleted: true
  })
  console.log(`[cloud-cleanup] Closed test conference ${results.length}/4`)
}
await api('/auth/logout', { method: 'POST' })
await writeFile(
  path.join(stateDir, 'cleanup.json'),
  JSON.stringify(
    { completed: new Date().toISOString(), results, organizerSessionRevoked: true },
    null,
    2
  )
)
