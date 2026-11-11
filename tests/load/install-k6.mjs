import { createHash } from 'node:crypto'
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = '2.3.0'
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '.tools')
const os = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform]
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
if (!os || !arch || (os === 'windows' && arch !== 'amd64')) {
  throw new Error(
    'Unsupported platform; install the pinned official k6 v2.3.0 binary and use --k6.'
  )
}
const folder = `k6-v${version}-${os}-${arch}`
const archive = `${folder}.${os === 'linux' ? 'tar.gz' : 'zip'}`
const base = `https://github.com/grafana/k6/releases/download/v${version}`
async function fetchBytes(name) {
  const response = await fetch(`${base}/${name}`)
  if (!response.ok) throw new Error(`Official k6 download failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
await mkdir(directory, { recursive: true })
const [bytes, checksumBytes] = await Promise.all([
  fetchBytes(archive),
  fetchBytes(`k6-v${version}-checksums.txt`)
])
const expected = checksumBytes
  .toString('utf8')
  .split(/\r?\n/)
  .find((line) => line.trim().endsWith(archive))
  ?.trim()
  .split(/\s+/)[0]
if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected.toLowerCase()) {
  throw new Error('Official k6 archive SHA-256 verification failed.')
}
const archivePath = resolve(directory, archive)
await writeFile(archivePath, bytes)
const command = os === 'windows' ? 'powershell.exe' : 'tar'
const args =
  os === 'windows'
    ? [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${directory.replaceAll("'", "''")}' -Force`
      ]
    : ['-xf', archivePath, '-C', directory]
await new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`k6 extraction failed (${code})`))
  )
})
// macOS archives are zip files; bsdtar (system tar) extracts both zip and tar.gz.
const binary = os === 'windows' ? 'k6.exe' : 'k6'
await copyFile(resolve(directory, folder, binary), resolve(directory, binary))
// copyFile preserves contents, not execute permission.
if (os !== 'windows') {
  const { chmod } = await import('node:fs/promises')
  await chmod(resolve(directory, binary), 0o755)
}
await writeFile(
  resolve(directory, 'version.json'),
  JSON.stringify({ version, archive, sha256: expected }, null, 2)
)
if (!(await readFile(resolve(directory, binary))).length) throw new Error('Empty k6 binary.')
console.log(`Installed official k6 v${version}; archive SHA-256 verified.`)
