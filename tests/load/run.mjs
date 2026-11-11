import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { hostname, platform, release } from 'node:os'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  childEnvironment,
  createDiagnostics,
  K6_VERSION,
  normalizeConfig,
  parseArgs,
  parseK6Version,
  PROFILES,
  validateCredentials
} from './lib/runner-config.mjs'

const loadDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = resolve(loadDirectory, '../..')

const help = `Veto load runner — k6 v${K6_VERSION}

Usage:
  node tests/load/run.mjs --profile smoke --scenario mixed \\
    --target http://localhost:8787/v1 --credentials /absolute/seats.json

Options:
  --help                         Show this help
  --profile NAME                 ${PROFILES.join(' | ')} (default smoke)
  --scenario NAME                browse | mixed | files | reconnect | display
  --environment NAME             local | cloudflare (default local)
  --target URL                   Required HTTP API base; /v1 appended at root
  --credentials PATH             Required except for display; one seat per VU
  --config PATH                  JSON override; known normalized config keys only
  --vus NUMBER                   Concurrent users
  --duration TIME                Seconds, or ms/s/m/h/d (e.g. 90s, 10m)
  --ramp TIME                    Ramp duration
  --start-delay TIME             Coordinated upload start
  --online-window TIME           Required common continuously-online interval
  --action-interval TIME         Delay between business actions
  --files-per-vu NUMBER          Files per business user
  --upload-concurrency NUMBER    Concurrent uploads per VU (1–100)
  --file-sizes BYTES,...          Positive byte sizes, each at most 20 MiB
  --visibility NAME              committee | conference
  --file-type TEXT               File type label (default 工作文件)
  --ready-timeout TIME           Ready timeout
  --visibility-timeout TIME      Visibility timeout
  --request-timeout TIME         Request timeout
  --reconnect-after TIME         Reconnect time within the run
  --display-ws-url URL           Explicit ws/wss URL required for display
  --ws-allowed-hosts HOST,...     Additional allowed WS hosts (include port)
  --observer-every NUMBER        Every Nth VU observes only; 0 means no observers
  --open-loop-seed NUMBER       Deterministic 0–499ms phase offset during the ramp
  --revision TEXT                Optional tested build revision label
  --results PATH                 Report parent (default tests/load/results)
  --dry-run                      Validate config/credentials/k6; send no traffic
  --k6 EXECUTABLE                Override .tools/k6[.exe], then PATH fallback

Precedence: built-in defaults < profile JSON < --config JSON < CLI.
For stepped ramps, use --config override.json containing {"rampSteps":5}.
The step count is 1–min(vus, 100), default 1. File size lists allow at most 16 entries.
Paths supplied by CLI are relative to the caller's current directory.
Profiles contain experimental thresholds, not an SLA. No target is inferred.
Cloudflare runs still require real cloud metrics and deployment verification.
Only sanitized operation/kind/status/impact events are saved to events.log.
k6 internal error text and raw stdout/stderr are suppressed.
Reports and independent metadata are saved in a unique directory per run.
`

async function jsonFile(path, label) {
  let content
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    throw new Error(`${label} could not be read (${error.code ?? 'read error'})`)
  }
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''))
  } catch {
    // JSON.parse error text can include the secret-bearing source.
    throw new Error(`${label} must contain valid JSON`)
  }
}

async function executable(override) {
  if (override) {
    return isAbsolute(override) || /[/\\]/.test(override) ? resolve(override) : override
  }
  const bundled = resolve(loadDirectory, '.tools', process.platform === 'win32' ? 'k6.exe' : 'k6')
  try {
    await access(bundled)
    return bundled
  } catch {
    return 'k6'
  }
}

function capture(command, args, env, cwd, timeout = 10000) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let tooLarge = false
    const timer = setTimeout(() => child.kill(), timeout)
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        if (output.length + chunk.length > 65536) {
          tooLarge = true
          child.kill()
        } else {
          output += chunk.toString()
        }
      })
    }
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(
        new Error(
          `Unable to start ${args[0] === 'version' ? 'k6' : 'git'} (${error.code ?? 'spawn error'})`
        )
      )
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 || tooLarge)
        reject(new Error(`${args[0] === 'version' ? 'k6 version' : 'git revision'} command failed`))
      else resolveResult(output)
    })
  })
}

async function gitRevision(env) {
  try {
    const output = (await capture('git', ['rev-parse', 'HEAD'], env, repositoryDirectory)).trim()
    return /^[a-f0-9]{40,64}$/i.test(output) ? output : null
  } catch {
    return null
  }
}

function runK6(command, args, env, diagnostics) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: loadDirectory,
      env,
      shell: false,
      windowsHide: true,
      // Never persist raw k6 logs. Only selected structured diagnostics survive.
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let pending = ''
    let skippingLine = false
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      // Bound partial lines as well as retained events to protect the runner's memory.
      for (const part of chunk.split(/(?<=\n)/)) {
        if (!skippingLine) {
          if (pending.length + part.length > 65536) {
            pending = ''
            skippingLine = true
          } else {
            pending += part
          }
        }
        if (part.endsWith('\n')) {
          if (!skippingLine && pending.trim()) diagnostics.consume(pending)
          pending = ''
          skippingLine = false
        }
      }
    })
    let interruptedBy = null
    let spawnError = null
    let signalError = null
    const forward = (signal) => {
      interruptedBy ??= signal
      try {
        if (!child.kill(signal)) signalError = 'signal delivery failed'
      } catch (error) {
        signalError = error.code ?? 'signal delivery failed'
      }
    }
    const onInterrupt = () => forward('SIGINT')
    const onTerminate = () => forward('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    child.once('error', (error) => {
      spawnError = error.code ?? 'spawn error'
    })
    child.once('close', (code, signal) => {
      if (!skippingLine && pending.trim()) diagnostics.consume(pending)
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
      resolveResult({
        exitCode:
          interruptedBy === 'SIGINT'
            ? 130
            : interruptedBy === 'SIGTERM'
              ? 143
              : spawnError
                ? 1
                : (code ?? 1),
        k6ExitCode: code,
        signal,
        interruptedBy,
        spawnError,
        signalError
      })
    })
  })
}

export async function main(args = process.argv.slice(2)) {
  const cli = parseArgs(args)
  if (cli.help) {
    console.log(help)
    return 0
  }
  const profile = cli.overrides.profile ?? 'smoke'
  const profileConfig = await jsonFile(
    resolve(loadDirectory, 'config', `${profile}.json`),
    'profile'
  )
  const overrides = cli.config ? await jsonFile(resolve(cli.config), 'override config') : {}
  const config = normalizeConfig(profileConfig, overrides, cli.overrides)
  const credentialsPath = cli.credentials ? resolve(cli.credentials) : undefined
  if (!credentialsPath && config.scenario !== 'display') {
    throw new Error('an explicit --credentials file is required')
  }
  const credentials = credentialsPath
    ? validateCredentials(await jsonFile(credentialsPath, 'credentials'), config)
    : { seats: [] }
  const diagnostics = createDiagnostics(credentials)
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
  const resultsPath = resolve(cli.results ?? resolve(loadDirectory, 'results'), runId)
  const env = childEnvironment(process.env, { config, credentialsPath, resultsPath, runId })
  const command = await executable(cli.k6)
  // Never read inherited k6 config, output sinks, or dashboard settings.
  const k6Version = parseK6Version(await capture(command, ['version'], env, loadDirectory))
  const revision = await gitRevision(env)
  if (cli.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          config,
          k6Version,
          gitRevision: revision,
          credentialsValidated: Boolean(credentialsPath),
          cloudflareVerified: false,
          cloudflareVerification:
            'No traffic sent. A Cloudflare verdict requires a real cloud run and correlated cloud metrics.'
        },
        null,
        2
      )
    )
    return 0
  }
  try {
    await access(resolve(loadDirectory, 'main.ts'))
  } catch {
    throw new Error('tests/load/main.ts is required to run k6')
  }
  await mkdir(resultsPath, { recursive: true })
  const isolatedConfigPath = resolve(resultsPath, 'k6-options.json')
  await writeFile(isolatedConfigPath, '{}\n', { flag: 'wx', mode: 0o600 })
  const metadataPath = resolve(resultsPath, 'metadata.json')
  const metadata = {
    runId,
    environment: config.environment,
    target: config.target,
    config,
    k6Version,
    gitRevision: revision,
    node: process.version,
    os: { platform: platform(), release: release(), arch: process.arch, hostname: hostname() },
    started: new Date().toISOString(),
    ended: null,
    exitCode: null,
    cloudflareVerified: false,
    cloudflareVerification:
      'Runner results alone do not verify Cloudflare. Acceptance requires a successful real cloud run, deployment identity, and correlated Workers/Durable Objects/R2 and error/latency metrics.'
  }
  const saveMetadata = () =>
    writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 })
  await saveMetadata()
  console.log(
    `[load] Starting ${runId}: ${config.environment}/${config.scenario}, ${config.vus} VUs, ${config.durationSeconds}s`
  )
  console.log(`[load] Reports: ${resultsPath}`)
  try {
    Object.assign(
      metadata,
      await runK6(
        command,
        [
          'run',
          '--config',
          isolatedConfigPath.replaceAll('\\', '/'),
          '--address',
          '',
          '--out',
          `json=${resolve(resultsPath, 'samples.json').replaceAll('\\', '/')}`,
          '--log-format=json',
          '--log-output=stderr',
          '--quiet',
          'main.ts'
        ],
        env,
        diagnostics
      )
    )
  } catch {
    metadata.exitCode = 1
    metadata.spawnError = 'runner failed to launch k6'
  } finally {
    metadata.ended = new Date().toISOString()
    metadata.diagnostics = diagnostics.summary()
    metadata.result = metadata.spawnError
      ? 'spawn_failed'
      : metadata.interruptedBy || metadata.signal
        ? 'interrupted'
        : metadata.exitCode === 0
          ? 'completed'
          : metadata.exitCode === 99
            ? 'thresholds_failed'
            : 'k6_failed'
    await writeFile(
      resolve(resultsPath, 'events.log'),
      diagnostics.events.map((event) => JSON.stringify(event)).join('\n') + '\n',
      { mode: 0o600 }
    )
    await saveMetadata()
  }
  console.log(`[load] Finished with exit code ${metadata.exitCode}; metadata saved.`)
  if (metadata.spawnError) console.error(`[load] k6 could not run (${metadata.spawnError}).`)
  if (metadata.signalError)
    console.error(`[load] Unable to forward stop signal (${metadata.signalError}).`)
  return metadata.exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`[load] ${error.message}`)
      process.exitCode = 1
    })
}
