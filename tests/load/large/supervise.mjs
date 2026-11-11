import { spawn } from 'node:child_process'
import { openSync, closeSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const label = args[args.indexOf('--label') + 1]
if (!args.includes('--label') || !/^[a-z0-9-]{1,40}$/.test(label))
  throw new Error('Explicit safe --label required')
const log = path.resolve(directory, '../results', `${label}-process.log`)
const statusPath = path.resolve(directory, '../results', `${label}-process.json`)
const fd = openSync(log, 'w')
const child = spawn(process.execPath, [path.join(directory, 'run.mjs'), ...args], {
  stdio: ['ignore', fd, fd],
  windowsHide: true
})
const status = {
  supervisorPid: process.pid,
  childPid: child.pid,
  started: new Date().toISOString(),
  args
}
writeFileSync(statusPath, JSON.stringify(status, null, 2))
child.on('error', (error) => {
  writeFileSync(
    statusPath,
    JSON.stringify({ ...status, error: error.code, ended: new Date().toISOString() }, null, 2)
  )
})
child.on('exit', (code, signal) => {
  closeSync(fd)
  writeFileSync(
    statusPath,
    JSON.stringify({ ...status, code, signal, ended: new Date().toISOString() }, null, 2)
  )
})
