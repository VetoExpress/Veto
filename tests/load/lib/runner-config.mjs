import { isIP } from 'node:net'

export const PROFILES = [
  'smoke',
  'load',
  'stress',
  'soak',
  'spike',
  'files-burst',
  'conference-500',
  'files-500'
]
export const K6_VERSION = '2.3.0'
export const MAX_FILE_BYTES = 20 * 1024 * 1024

// Starting points for experiments, not a service SLA. Profiles never supply a target.
export const DEFAULT_CONFIG = Object.freeze({
  environment: 'local',
  scenario: 'mixed',
  profile: 'smoke',
  vus: 2,
  durationSeconds: 60,
  rampSeconds: 5,
  rampSteps: 1,
  startDelaySeconds: 10,
  onlineWindowSeconds: 0,
  actionIntervalSeconds: 5,
  filesPerVu: 1,
  uploadConcurrency: 1,
  fileSizesBytes: Object.freeze([64 * 1024]),
  visibility: 'committee',
  fileType: '工作文件',
  readyTimeoutSeconds: 30,
  visibilityTimeoutSeconds: 30,
  requestTimeoutSeconds: 30,
  reconnectAfterSeconds: 20,
  thresholds: Object.freeze({
    httpP95Ms: 2000,
    uploadP95Ms: 10000,
    visibleP95Ms: 10000,
    errorRate: 0.01
  }),
  observerEvery: 0
})

const configKeys = new Set([
  ...Object.keys(DEFAULT_CONFIG),
  'target',
  'displayWsUrl',
  'wsAllowedHosts',
  'revision'
])
const thresholdKeys = new Set(Object.keys(DEFAULT_CONFIG.thresholds))
const seatKeys = new Set([
  'inviteCode',
  'password',
  'seatId',
  'conferenceId',
  'committeeId',
  'targetCommitteeId',
  'expectedCapabilities'
])
const cliOptions = {
  profile: 'profile',
  scenario: 'scenario',
  target: 'target',
  environment: 'environment',
  vus: 'vus',
  duration: 'durationSeconds',
  ramp: 'rampSeconds',
  'start-delay': 'startDelaySeconds',
  'online-window': 'onlineWindowSeconds',
  'action-interval': 'actionIntervalSeconds',
  'files-per-vu': 'filesPerVu',
  'upload-concurrency': 'uploadConcurrency',
  'file-sizes': 'fileSizesBytes',
  visibility: 'visibility',
  'file-type': 'fileType',
  'ready-timeout': 'readyTimeoutSeconds',
  'visibility-timeout': 'visibilityTimeoutSeconds',
  'request-timeout': 'requestTimeoutSeconds',
  'reconnect-after': 'reconnectAfterSeconds',
  'display-ws-url': 'displayWsUrl',
  'ws-allowed-hosts': 'wsAllowedHosts',
  'observer-every': 'observerEvery',
  revision: 'revision'
}
const numericKeys = new Set(['vus', 'filesPerVu', 'uploadConcurrency', 'observerEvery'])

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function knownKeys(value, allowed, label) {
  object(value, label)
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains an unknown key`)
  }
}

function text(value, label, maxLength = 1024) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be a non-empty string without control characters`)
  }
  return value
}

function number(value, label, { max, min = 0, zero = false, integer = false }) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    (!zero && value === 0) ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? 'an integer' : 'finite'} in ${zero ? '[' : '('}${min}, ${max}]`
    )
  }
}

function oneOf(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`${label} must be one of ${choices.join(', ')}`)
}

export function isLocalHostname(hostname) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  return host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'))
}

function parseUrl(value, label, protocols) {
  text(value, label, 4096)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute URL`)
  }
  if (
    !protocols.includes(url.protocol) ||
    url.username ||
    url.password ||
    value.includes('@') ||
    url.hash ||
    value.includes('#') ||
    /[\s\\]/u.test(value)
  ) {
    throw new Error(`${label} has an unsupported protocol, credentials, fragment, or whitespace`)
  }
  return url
}

export function normalizeTarget(value, environment) {
  const url = parseUrl(value, 'target', ['http:', 'https:'])
  if (url.search || value.includes('?')) throw new Error('target must not contain a query')
  if (url.protocol === 'http:' && !isLocalHostname(url.hostname)) {
    throw new Error('remote target requires HTTPS')
  }
  if (environment === 'cloudflare' && isLocalHostname(url.hostname)) {
    throw new Error('cloudflare environment requires a non-local target')
  }
  const path = url.pathname.replace(/\/+$/, '')
  if (path && !path.endsWith('/v1')) throw new Error('target base path must end in /v1')
  url.pathname = path || '/v1'
  return url.href
}

function normalizeHost(value) {
  text(value, 'wsAllowedHosts entry', 300)
  if (!/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(value)) {
    throw new Error('wsAllowedHosts entries must be bare hosts with optional ports')
  }
  const url = parseUrl(`https://${value}`, 'wsAllowedHosts entry', ['https:'])
  return url.host
}

export function mergeConfig(...layers) {
  const merged = {}
  for (const layer of layers) {
    knownKeys(layer, configKeys, 'config')
    if (Object.hasOwn(layer, 'thresholds')) {
      knownKeys(layer.thresholds, thresholdKeys, 'thresholds')
    }
    Object.assign(merged, layer, {
      thresholds: { ...merged.thresholds, ...layer.thresholds }
    })
  }
  return merged
}

export function normalizeConfig(...layers) {
  const config = mergeConfig(DEFAULT_CONFIG, ...layers)
  oneOf(config.environment, ['local', 'cloudflare'], 'environment')
  oneOf(config.scenario, ['browse', 'mixed', 'files', 'reconnect', 'display'], 'scenario')
  oneOf(config.visibility, ['committee', 'conference'], 'visibility')
  text(config.profile, 'profile', 80)
  text(config.fileType, 'fileType', 60)
  if (config.revision !== undefined) text(config.revision, 'revision', 200)
  config.target = normalizeTarget(config.target, config.environment)
  number(config.vus, 'vus', { integer: true, max: 10000 })
  number(config.durationSeconds, 'durationSeconds', { max: 7 * 86400 })
  number(config.onlineWindowSeconds, 'onlineWindowSeconds', {
    zero: true,
    max: config.durationSeconds
  })
  if (config.onlineWindowSeconds && ['display', 'reconnect'].includes(config.scenario)) {
    throw new Error(
      'online windows require browse, mixed or files; injected reconnects cannot remain continuously online'
    )
  }
  if (
    ['conference-500', 'files-500'].includes(config.profile) &&
    (config.vus < 500 || !config.onlineWindowSeconds)
  ) {
    throw new Error('500-seat acceptance requires at least 500 seats and a nonzero online window')
  }
  for (const key of ['rampSeconds', 'startDelaySeconds']) {
    // The workload duration is measured per VU after ramping, not the total wall time.
    number(config[key], key, { zero: true, max: 7 * 86400 })
  }
  number(config.rampSteps, 'rampSteps', { integer: true, max: Math.min(config.vus, 100) })
  number(config.actionIntervalSeconds, 'actionIntervalSeconds', { max: 86400 })
  number(config.filesPerVu, 'filesPerVu', { integer: true, max: 10000 })
  number(config.uploadConcurrency, 'uploadConcurrency', { integer: true, max: 100 })
  number(config.observerEvery, 'observerEvery', { integer: true, zero: true, max: 10000 })
  if (['files', 'mixed'].includes(config.scenario) && config.observerEvery === 1) {
    throw new Error('file workloads require at least one business seat; observerEvery cannot be 1')
  }
  for (const key of ['readyTimeoutSeconds', 'visibilityTimeoutSeconds', 'requestTimeoutSeconds']) {
    number(config[key], key, { max: 3600 })
  }
  number(config.reconnectAfterSeconds, 'reconnectAfterSeconds', { max: 7 * 86400 })
  if (config.scenario === 'reconnect' && config.reconnectAfterSeconds >= config.durationSeconds) {
    throw new Error('reconnectAfterSeconds must be before the end of a reconnect run')
  }
  if (
    !Array.isArray(config.fileSizesBytes) ||
    !config.fileSizesBytes.length ||
    config.fileSizesBytes.length > 16
  ) {
    throw new Error('fileSizesBytes must contain between 1 and 16 byte sizes')
  }
  config.fileSizesBytes = config.fileSizesBytes.map((size) => {
    number(size, 'fileSizesBytes entry (20 MiB maximum)', { integer: true, max: MAX_FILE_BYTES })
    return size
  })
  for (const key of ['httpP95Ms', 'uploadP95Ms', 'visibleP95Ms']) {
    number(config.thresholds[key], `thresholds.${key}`, { max: Number.MAX_SAFE_INTEGER })
  }
  number(config.thresholds.errorRate, 'thresholds.errorRate', { zero: true, max: 1 })
  if (config.wsAllowedHosts !== undefined && !Array.isArray(config.wsAllowedHosts)) {
    throw new Error('wsAllowedHosts must be an array')
  }
  if ((config.wsAllowedHosts?.length ?? 0) > 100) throw new Error('too many wsAllowedHosts')
  config.wsAllowedHosts = [
    ...new Set([new URL(config.target).host, ...(config.wsAllowedHosts ?? []).map(normalizeHost)])
  ]
  if (config.displayWsUrl !== undefined) {
    const url = parseUrl(config.displayWsUrl, 'displayWsUrl', ['ws:', 'wss:'])
    if (url.protocol === 'ws:' && !isLocalHostname(url.hostname)) {
      throw new Error('remote displayWsUrl requires WSS')
    }
    if (!config.wsAllowedHosts.includes(url.host)) {
      throw new Error('displayWsUrl host must be in wsAllowedHosts')
    }
    config.displayWsUrl = url.href
  }
  if (config.scenario === 'display' && !config.displayWsUrl) {
    throw new Error('display scenario requires an explicit displayWsUrl')
  }
  return config
}

export function normalizeInviteCode(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) {
    throw new Error('inviteCode must be a non-empty string')
  }
  // Matches CloudJoinClient; kept in Node code because the client imports Vite env.
  const code = value.trim().toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code))
    throw new Error('inviteCode must have 12 valid 4-4-4 characters')
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}

export function validateCredentials(value, config) {
  knownKeys(value, new Set(['seats']), 'credentials')
  if (!Array.isArray(value.seats)) throw new Error('credentials.seats must be an array')
  if (value.seats.length < config.vus)
    throw new Error('credentials require at least vus distinct seats; seat reuse is forbidden')
  const invites = new Set()
  const seatIds = new Set()
  const seats = value.seats.map((seat, index) => {
    const label = `credentials.seats[${index}]`
    knownKeys(seat, seatKeys, label)
    const inviteCode = normalizeInviteCode(seat.inviteCode)
    if (typeof seat.password !== 'string' || !seat.password.trim()) {
      throw new Error(`${label}.password must be non-empty`)
    }
    if (invites.has(inviteCode)) throw new Error(`${label} duplicates an inviteCode`)
    invites.add(inviteCode)
    for (const key of ['seatId', 'conferenceId', 'committeeId', 'targetCommitteeId']) {
      if (seat[key] !== undefined) text(seat[key], `${label}.${key}`, 300)
    }
    if (seat.seatId !== undefined) {
      const id = seat.seatId.trim()
      if (seatIds.has(id)) throw new Error(`${label} duplicates a seatId`)
      seatIds.add(id)
    }
    if (seat.expectedCapabilities !== undefined) {
      if (!Array.isArray(seat.expectedCapabilities))
        throw new Error(`${label}.expectedCapabilities must be an array`)
      for (const capability of seat.expectedCapabilities) {
        text(capability, `${label}.expectedCapabilities entry`, 100)
      }
    }
    return { ...seat, inviteCode }
  })
  if (config.onlineWindowSeconds) {
    const participants = seats.slice(0, config.vus)
    const conference = participants[0].conferenceId
    if (
      !conference ||
      participants.some((seat) => seat.conferenceId !== conference || !seat.seatId)
    ) {
      throw new Error('online windows require distinct seatIds in one explicit conferenceId')
    }
  }
  return { seats }
}

function cliNumber(value, label) {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    throw new Error(`${label} must be a decimal number`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite`)
  return parsed
}

export function parseDuration(value, label = 'duration') {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s|m|h|d)?$/.exec(value)
  if (!match) throw new Error(`${label} must be seconds or a number followed by ms, s, m, h, or d`)
  return cliNumber(match[1], label) * { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? 's']
}

export function parseArgs(args) {
  const result = { overrides: {}, dryRun: false, help: false }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(args[index])
    if (!match) throw new Error('arguments must use named --options; use --help')
    const [, name, inline] = match
    if (seen.has(name)) throw new Error(`duplicate --${name}`)
    seen.add(name)
    if (name === 'help' || name === 'dry-run') {
      if (inline !== undefined) throw new Error(`--${name} does not take a value`)
      result[name === 'help' ? 'help' : 'dryRun'] = true
      continue
    }
    const key = cliOptions[name]
    if (!key && !['config', 'credentials', 'k6', 'results'].includes(name)) {
      throw new Error('unknown option; use --help')
    }
    const value = inline ?? args[++index]
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`)
    if (!key) {
      result[name] = text(value, `--${name}`, 4096)
    } else if (key.endsWith('Seconds')) {
      result.overrides[key] = parseDuration(value, name)
    } else if (numericKeys.has(key)) {
      result.overrides[key] = cliNumber(value, name)
    } else if (key === 'fileSizesBytes') {
      result.overrides[key] = value.split(',').map((item) => cliNumber(item, name))
    } else if (key === 'wsAllowedHosts') {
      result.overrides[key] = value.split(',')
    } else {
      result.overrides[key] = value
    }
  }
  if (result.overrides.profile !== undefined) {
    oneOf(result.overrides.profile, PROFILES, 'CLI profile')
  }
  return result
}

export function parseK6Version(output) {
  const match = /^k6(?:\.exe)? v(\d+\.\d+\.\d+)(?=\s|$)/m.exec(output)
  if (match?.[1] !== K6_VERSION) throw new Error(`k6 v${K6_VERSION} is required`)
  return match[1]
}

export function childEnvironment(parent, { config, credentialsPath, resultsPath, runId }) {
  // Only runtime essentials survive; no inherited k6 options, proxies, tokens,
  // NODE_OPTIONS, raw metric sinks, dashboard exports, or debug configuration.
  const allowed = new Set([
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'SYSTEMDRIVE',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR'
  ])
  const env = Object.fromEntries(
    Object.entries(parent).filter(
      ([key, value]) => allowed.has(key.toUpperCase()) && typeof value === 'string'
    )
  )
  return {
    ...env,
    K6_NEW_MACHINE_READABLE_SUMMARY: 'false',
    K6_WEB_DASHBOARD: 'false',
    K6_NO_USAGE_REPORT: 'true',
    K6_NO_COLOR: 'true',
    VETO_LOAD_CONFIG: JSON.stringify(config),
    VETO_LOAD_CREDENTIALS: credentialsPath?.replaceAll('\\', '/') ?? '',
    VETO_LOAD_RESULTS: resultsPath.replaceAll('\\', '/'),
    VETO_LOAD_RUN_ID: runId
  }
}

export function createDiagnostics(credentials = { seats: [] }) {
  const secrets = new Set()
  for (const seat of credentials.seats) {
    for (const value of [seat.inviteCode, normalizeInviteCode(seat.inviteCode), seat.password]) {
      if (typeof value !== 'string' || !value) continue
      for (const variant of [
        value,
        value.replace(/[\s-]/g, ''),
        encodeURIComponent(value),
        JSON.stringify(value).slice(1, -1)
      ]) {
        secrets.add(variant.toLowerCase())
      }
    }
  }
  const events = []
  const counts = new Map()
  let internalErrors = 0
  let suppressedLines = 0
  let droppedEvents = 0
  const safeLabel = (value) => {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_.-]{0,79}$/.test(value)) return null
    const lower = value.toLowerCase()
    return [...secrets].some((secret) => lower.includes(secret)) ? 'redacted' : value
  }
  const consume = (line) => {
    let record
    try {
      record = JSON.parse(line)
    } catch {
      suppressedLines += 1
      return
    }
    if (!record || typeof record !== 'object') {
      suppressedLines += 1
      return
    }
    if (record.source !== 'console' || typeof record.msg !== 'string') {
      if (['error', 'fatal', 'panic'].includes(record.level)) internalErrors += 1
      suppressedLines += 1
      return
    }
    let payload
    try {
      payload = JSON.parse(record.msg)
    } catch {
      suppressedLines += 1
      return
    }
    if (!payload || typeof payload !== 'object') {
      suppressedLines += 1
      return
    }
    const operation = safeLabel(payload.operation)
    const kind = safeLabel(payload.kind)
    const status = payload.status ?? 0
    if (
      !operation ||
      !kind ||
      !Number.isInteger(status) ||
      status < 0 ||
      status > 65535 ||
      ![
        'operation_failed',
        'reconnecting',
        'another_reviewer_won',
        'verify_server_records'
      ].includes(payload.impact)
    ) {
      suppressedLines += 1
      return
    }
    const event = { operation, kind, status, impact: payload.impact }
    const key = `${operation}:${kind}:${status}`
    if (counts.has(key) || counts.size < 200) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    } else {
      droppedEvents += 1
    }
    if (events.length < 2000) events.push(event)
    else droppedEvents += 1
  }
  return {
    consume,
    events,
    summary: () => ({
      classifications: Object.fromEntries(counts),
      internalErrors,
      suppressedLines,
      droppedEvents
    })
  }
}
