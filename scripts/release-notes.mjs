import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tag = process.argv[2]
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  console.error('Usage: node scripts/release-notes.mjs v<major>.<minor>.<patch> [output-file]')
  process.exit(1)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const sections = changelog.split(/^## /m)
const section = sections.find((value) => value.startsWith(`${tag} - `))
const notes = section?.slice(section.indexOf('\n') + 1).trim()
if (!notes) {
  console.error(`No release notes found in CHANGELOG.md for ${tag}`)
  process.exit(1)
}

if (process.argv[3]) {
  fs.writeFileSync(process.argv[3], `${notes}\n`, 'utf8')
} else {
  process.stdout.write(`${notes}\n`)
}
