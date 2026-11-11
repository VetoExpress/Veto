import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, symlink, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const pluginRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@inlang/plugin-icu1'))))

async function fixture(t, withPlugin) {
  const root = await mkdtemp(join(tmpdir(), 'veto-i18n-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    assert.ok(root.includes('veto-i18n-'))
    await rm(root, { recursive: true, force: true })
  })
  const target = join(root, 'packages/i18n')
  for (const directory of ['scripts', 'project.inlang', 'catalogs/common']) {
    await mkdir(join(target, directory), { recursive: true })
  }
  for (const name of ['@inlang/paraglide-js', '@formatjs/icu-messageformat-parser']) {
    let dependency = dirname(fileURLToPath(import.meta.resolve(name)))
    while (
      JSON.parse(await readFile(join(dependency, 'package.json'), 'utf8').catch(() => '{}'))
        .name !== name
    ) {
      assert.notEqual(dependency, dirname(dependency), `Package root not found: ${name}`)
      dependency = dirname(dependency)
    }
    const link = join(target, 'node_modules', name)
    await mkdir(dirname(link), { recursive: true })
    await symlink(dependency, link, 'junction')
  }
  await writeFile(join(target, 'package.json'), '{"type":"module"}')
  await copyFile(join(packageRoot, 'scripts/compile.mjs'), join(target, 'scripts/compile.mjs'))
  await copyFile(
    join(packageRoot, 'project.inlang/settings.json'),
    join(target, 'project.inlang/settings.json')
  )
  for (const [locale, text] of [
    ['zh-CN', '你好，{name}'],
    ['en-US', 'Hello, {name}']
  ]) {
    await writeFile(
      join(target, `catalogs/common/${locale}.json`),
      JSON.stringify({ common_greeting: text })
    )
  }
  if (withPlugin) {
    await mkdir(join(root, 'node_modules/@inlang'), { recursive: true })
    await symlink(pluginRoot, join(root, 'node_modules/@inlang/plugin-icu1'), 'junction')
  }
  const result = spawnSync(process.execPath, [join(target, 'scripts/compile.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000
  })
  assert.ifError(result.error)
  return { target, result, output: result.stdout + result.stderr }
}

test('compilation emits typed, executable translations with the installed ICU plugin', async (t) => {
  const { target, result, output } = await fixture(t, true)
  assert.equal(result.status, 0, output)
  const declarations = await readFile(join(target, 'src/generated/messages/_index.d.ts'), 'utf8')
  assert.match(declarations, /export (?:declare )?const common_greeting\b/)
  const messages = await import(
    pathToFileURL(join(target, 'src/generated/messages/_index.js')).href
  )
  assert.equal(messages.common_greeting({ name: 'Veto' }, { locale: 'en-US' }), 'Hello, Veto')
  assert.equal(messages.common_greeting({ name: 'Veto' }, { locale: 'zh-CN' }), '你好，Veto')
})

test('a missing ICU plugin fails compilation instead of reporting empty declarations as success', async (t) => {
  const { result, output } = await fixture(t, false)
  assert.notEqual(result.status, 0, output)
  assert.match(output, /Missing generated translations/)
  assert.doesNotMatch(output, /Validated and compiled/)
})
