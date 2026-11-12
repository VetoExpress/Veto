import { readFile, readdir, mkdir, writeFile, open, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, relative, dirname } from 'node:path'
import { compile } from '@inlang/paraglide-js'
import { parse } from '@formatjs/icu-messageformat-parser'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const catalogRoot = resolve(packageRoot, 'i18n', 'catalogs')
const catalogsModule = resolve(packageRoot, 'src/lib/i18n/catalogs.ts')
const lockPath = resolve(packageRoot, '.compile-lock')
let lock
for (let attempt = 0; !lock; attempt += 1) {
  try {
    lock = await open(lockPath, 'wx')
    await lock.writeFile(String(process.pid))
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (attempt > 120) throw new Error('Timed out waiting for i18n compilation')
    const owner = Number(await readFile(lockPath, 'utf8').catch(() => '0'))
    if (owner) {
      try {
        process.kill(owner, 0)
      } catch (ownerError) {
        if (ownerError.code === 'ESRCH') await unlink(lockPath).catch(() => {})
      }
    }
    await new Promise((resume) => setTimeout(resume, 250))
  }
}
try {
  const languages = ['zh-CN', 'en-US']
  const catalogs = Object.fromEntries(languages.map((locale) => [locale, {}]))
  const scopes = (await readdir(catalogRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const imports = []
  const bindings = Object.fromEntries(languages.map((locale) => [locale, []]))

  function variables(elements, found = new Set()) {
    for (const element of elements) {
      if (element.type >= 1 && element.type <= 6) found.add(element.value)
      if (element.options) {
        for (const option of Object.values(element.options)) variables(option.value, found)
      }
      if (element.children) variables(element.children, found)
    }
    return [...found].sort()
  }

  for (const scope of scopes) {
    const pair = {}
    for (const locale of languages) {
      const path = resolve(catalogRoot, scope, `${locale}.json`)
      pair[locale] = JSON.parse(await readFile(path, 'utf8'))
      const binding = `${scope.replaceAll('-', '_')}_${locale.replaceAll('-', '_')}`
      imports.push(
        `import ${binding} from '${relative(dirname(catalogsModule), path).replaceAll('\\', '/')}'`
      )
      bindings[locale].push(binding)
    }
    const sourceKeys = Object.keys(pair['zh-CN']).sort()
    if (JSON.stringify(sourceKeys) !== JSON.stringify(Object.keys(pair['en-US']).sort())) {
      throw new Error(`Locale keys differ in catalog: ${scope}`)
    }
    for (const key of sourceKeys) {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`Invalid message key: ${key}`)
      const expected = variables(parse(pair['zh-CN'][key]))
      for (const locale of languages) {
        const message = pair[locale][key]
        if (typeof message !== 'string' || !message.trim()) {
          throw new Error(`Empty message: ${scope}/${locale}/${key}`)
        }
        if (Object.hasOwn(catalogs[locale], key)) throw new Error(`Duplicate message key: ${key}`)
        if (JSON.stringify(variables(parse(message))) !== JSON.stringify(expected)) {
          throw new Error(`Message arguments differ: ${scope}/${locale}/${key}`)
        }
        catalogs[locale][key] = message
      }
    }
  }

  await mkdir(resolve(packageRoot, 'i18n', 'messages'), { recursive: true })
  for (const locale of languages) {
    await writeFile(
      resolve(packageRoot, 'i18n', 'messages', `${locale}.json`),
      JSON.stringify(catalogs[locale], null, 2) + '\n'
    )
  }
  await mkdir(resolve(packageRoot, 'src'), { recursive: true })
  await writeFile(
    catalogsModule,
    `${imports.join('\n')}\n\nexport const messages = {\n${languages.map((locale) => `  '${locale}': { ${bindings[locale].map((binding) => `...${binding}`).join(', ')} }`).join(',\n')}\n} as const\n`
  )
  const generated = resolve(packageRoot, 'src/lib/i18n/generated')
  await compile({
    project: resolve(packageRoot, 'project.inlang'),
    outdir: generated,
    emitTsDeclarations: true,
    strategy: ['baseLocale']
  })
  const declarationsPath = resolve(generated, 'messages', '_index.d.ts')
  const declarations = await readFile(declarationsPath, 'utf8').catch(() => '')
  const missing = sourceMessageKeys(catalogs['zh-CN']).filter(
    (key) => !new RegExp(`\\bexport const ${key}\\b`).test(declarations)
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing generated translations after Paraglide compilation: ${missing.join(', ')}`
    )
  }
  await writeFile(
    resolve(generated, 'messages.d.ts'),
    'export * from "./messages/_index.js";\nexport * as m from "./messages/_index.js";\n'
  )
  console.log(
    `Validated and compiled ${Object.keys(catalogs['zh-CN']).length} messages in ${languages.length} languages.`
  )
} finally {
  await lock.close()
  await unlink(lockPath)
}

function sourceMessageKeys(catalog) {
  return Object.keys(catalog)
}
