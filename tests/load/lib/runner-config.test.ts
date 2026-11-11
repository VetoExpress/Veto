import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  childEnvironment,
  createDiagnostics,
  DEFAULT_CONFIG,
  MAX_FILE_BYTES,
  mergeConfig,
  normalizeConfig,
  normalizeInviteCode,
  parseArgs,
  parseDuration,
  parseK6Version,
  PROFILES,
  validateCredentials
} from './runner-config.mjs'
import { main } from '../run.mjs'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  // The k6 entrypoint belongs to a separate task; runner tests need no real k6.
  access: vi.fn().mockResolvedValue(undefined)
}))

const target = 'http://localhost:8787/v1'
const config = () => normalizeConfig({ target })
const seats = () => ({
  seats: [
    { inviteCode: 'abcd efgh jkmn', password: ' secret one ', seatId: 'seat-1' },
    { inviteCode: 'PQRS-TUVW-XYZ2', password: 'secret-two', seatId: 'seat-2' }
  ]
})
const tempDirectories: string[] = []

it('keeps conference acceptance at 500 or more seats with a real common online window', async () => {
  for (const profile of ['conference-500', 'files-500']) {
    const value = JSON.parse(
      await readFile(new URL(`../config/${profile}.json`, import.meta.url), 'utf8')
    )
    const acceptance = normalizeConfig(value, { target })
    expect(acceptance.vus).toBeGreaterThanOrEqual(500)
    expect(acceptance.onlineWindowSeconds).toBeGreaterThanOrEqual(600)
    expect(() => normalizeConfig(value, { target, vus: 499 })).toThrow('at least 500')
    expect(() => normalizeConfig(value, { target, onlineWindowSeconds: 0 })).toThrow('nonzero')
    expect(() => normalizeConfig(value, { target, durationSeconds: 1 })).toThrow(
      'onlineWindowSeconds'
    )
  }
  for (const profile of ['conference-1000', 'files-1000']) {
    const value = JSON.parse(
      await readFile(new URL(`../config/${profile}.json`, import.meta.url), 'utf8')
    )
    const acceptance = normalizeConfig(value, { target })
    expect(acceptance.vus).toBeGreaterThanOrEqual(1000)
    expect(acceptance.onlineWindowSeconds).toBeGreaterThanOrEqual(600)
    expect(() => normalizeConfig(value, { target, vus: 999 })).toThrow('at least 1000')
    expect(() => normalizeConfig(value, { target, onlineWindowSeconds: 0 })).toThrow('nonzero')
  }
  for (const profile of ['conference-2000', 'files-2000']) {
    const value = JSON.parse(
      await readFile(new URL(`../config/${profile}.json`, import.meta.url), 'utf8')
    )
    const acceptance = normalizeConfig(value, { target })
    expect(acceptance.vus).toBeGreaterThanOrEqual(2000)
    expect(acceptance.onlineWindowSeconds).toBeGreaterThanOrEqual(600)
    expect(() => normalizeConfig(value, { target, vus: 1999 })).toThrow('at least 2000')
    expect(() => normalizeConfig(value, { target, onlineWindowSeconds: 0 })).toThrow('nonzero')
  }
  expect(parseArgs(['--online-window', '30m']).overrides.onlineWindowSeconds).toBe(1800)
  expect(() => normalizeConfig({ target, onlineWindowSeconds: 5, scenario: 'reconnect' })).toThrow(
    'continuously online'
  )
})

it('requires enough independent seats from one conference to prove simultaneous attendance', () => {
  const windowConfig = normalizeConfig({ target, onlineWindowSeconds: 5 })
  expect(() => validateCredentials(seats(), windowConfig)).toThrow('conferenceId')
  const sameConference = seats()
  const assigned = {
    seats: sameConference.seats.map((seat) => ({ ...seat, conferenceId: 'meeting-1' }))
  }
  expect(validateCredentials(assigned, windowConfig).seats).toHaveLength(2)
  assigned.seats[1].conferenceId = 'meeting-2'
  expect(() => validateCredentials(assigned, windowConfig)).toThrow('one explicit conferenceId')
  expect(() => validateCredentials(sameConference, { ...windowConfig, vus: 500 })).toThrow(
    'at least vus'
  )
})

it('accepts a deterministic ramp micro-stagger for diagnosis', () => {
  expect(normalizeConfig({ target, openLoopSeed: 1776 }).openLoopSeed).toBe(1776)
  expect(parseArgs(['--open-loop-seed', '1776']).overrides.openLoopSeed).toBe(1776)
  expect(() => normalizeConfig({ target, openLoopSeed: 1.5 })).toThrow('openLoopSeed')
})

it('refuses a file workload with no writers or metadata exceeding the actual API contract', () => {
  expect(() => normalizeConfig({ target, scenario: 'files', observerEvery: 1 })).toThrow(
    'business seat'
  )
  expect(() => normalizeConfig({ target, fileType: 'x'.repeat(61) })).toThrow('fileType')
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(spawn).mockReset()
  for (const directory of tempDirectories.splice(0)) {
    // Only remove a directory created by this test's mkdtemp call.
    await rm(directory, { recursive: true, force: true })
  }
})

describe('configuration trust boundaries', () => {
  it('requires an explicit target and never supplies a production URL', async () => {
    expect(() => normalizeConfig()).toThrow(/target/)
    for (const profile of PROFILES) {
      const value = JSON.parse(
        await readFile(new URL(`../config/${profile}.json`, import.meta.url), 'utf8')
      )
      expect(value).not.toHaveProperty('target')
      expect(value).not.toHaveProperty('credentials')
      expect(normalizeConfig(value, { target }).profile).toBe(profile)
    }
  })

  it('deep merges threshold overrides without changing defaults or profile objects', () => {
    const profile = { thresholds: { httpP95Ms: 3500 }, fileSizesBytes: [1024] }
    const result = normalizeConfig(profile, { target, thresholds: { errorRate: 0 } })
    expect(result.thresholds).toEqual({
      httpP95Ms: 3500,
      uploadP95Ms: 10000,
      visibleP95Ms: 10000,
      errorRate: 0
    })
    result.fileSizesBytes.push(2048)
    expect(profile.fileSizesBytes).toEqual([1024])
    expect(DEFAULT_CONFIG.thresholds.errorRate).toBe(0.01)
  })

  it.each([
    { vu: 20 },
    { credentials: 'secret.json' },
    { thresholds: { errorRtae: 0.1 } },
    { thresholds: null },
    { thresholds: [] },
    JSON.parse('{"__proto__":{"polluted":true}}')
  ])('rejects unknown or malformed override fields: %j', (value) => {
    expect(() => mergeConfig(value)).toThrow()
    expect({}).not.toHaveProperty('polluted')
  })

  it.each([
    'http://example.test/v1',
    'http://192.168.1.20/v1',
    'ftp://localhost/v1',
    'https://user:password@example.test/v1',
    'https://@example.test/v1',
    'https://example.test/v1?token=secret',
    'https://example.test/v1?',
    'https://example.test/v1#fragment',
    'https://example.test/v1#',
    'https://example.test/other',
    'https://example.test\\@localhost/v1',
    '/v1',
    ' https://example.test/v1'
  ])('rejects unsafe or ambiguous target %s', (value) => {
    expect(() => normalizeConfig({ target: value })).toThrow()
  })

  it.each([
    ['http://localhost:8787', 'http://localhost:8787/v1'],
    ['http://127.0.0.1:8787/v1/', 'http://127.0.0.1:8787/v1'],
    ['http://[::1]:8787/v1', 'http://[::1]:8787/v1'],
    ['https://EXAMPLE.test/api/v1/', 'https://example.test/api/v1']
  ])('normalizes API bases while retaining deployment prefixes', (input, expected) => {
    expect(normalizeConfig({ target: input }).target).toBe(expected)
  })

  it.each(['http://localhost:8787/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1'])(
    'refuses a Cloudflare verdict against local target %s',
    (value) => {
      expect(() => normalizeConfig({ target: value, environment: 'cloudflare' })).toThrow(
        /non-local/
      )
    }
  )

  it('accepts an explicit HTTPS cloud target without asserting deployment verification', () => {
    expect(
      normalizeConfig({ target: 'https://staging.example.test/v1', environment: 'cloudflare' })
        .environment
    ).toBe('cloudflare')
  })

  it.each([
    ['vus', 0],
    ['vus', 1.5],
    ['vus', 10001],
    ['vus', '10'],
    ['durationSeconds', Infinity],
    ['durationSeconds', NaN],
    ['durationSeconds', -1],
    ['rampSeconds', -1],
    ['startDelaySeconds', 7 * 86400 + 1],
    ['rampSteps', 0],
    ['rampSteps', 1.5],
    ['rampSteps', 3],
    ['actionIntervalSeconds', 0],
    ['filesPerVu', 0],
    ['filesPerVu', 1.5],
    ['uploadConcurrency', 0],
    ['uploadConcurrency', 101],
    ['uploadConcurrency', 2.5],
    ['readyTimeoutSeconds', Infinity],
    ['visibilityTimeoutSeconds', 0],
    ['requestTimeoutSeconds', 3601],
    ['reconnectAfterSeconds', 0],
    ['observerEvery', -1],
    ['observerEvery', 1.5],
    ['fileSizesBytes', []],
    ['fileSizesBytes', [0]],
    ['fileSizesBytes', [1.5]],
    ['fileSizesBytes', [MAX_FILE_BYTES + 1]],
    ['fileSizesBytes', [NaN]],
    ['fileSizesBytes', Array(17).fill(1024)],
    ['scenario', 'unknown'],
    ['environment', 'production'],
    ['visibility', 'public'],
    ['fileType', ''],
    ['profile', ''],
    ['revision', '\nsecret']
  ])('rejects invalid %s without coercion', (key, value) => {
    expect(() => normalizeConfig({ target, [key]: value })).toThrow()
  })

  it.each([
    { httpP95Ms: Infinity },
    { uploadP95Ms: NaN },
    { visibleP95Ms: 0 },
    { errorRate: -0.01 },
    { errorRate: 1.01 },
    { errorRate: '0.1' }
  ])('rejects invalid thresholds %j', (thresholds) => {
    expect(() => normalizeConfig({ target, thresholds })).toThrow()
  })

  it('accepts zero ramp/delay/observers, fractional time, maximum file size and inclusive error rates', () => {
    const result = normalizeConfig({
      target,
      rampSeconds: 0,
      startDelaySeconds: 0,
      observerEvery: 0,
      actionIntervalSeconds: 0.25,
      fileSizesBytes: [MAX_FILE_BYTES],
      thresholds: { errorRate: 1 }
    })
    expect(result.fileSizesBytes).toEqual([MAX_FILE_BYTES])
    expect(result.observerEvery).toBe(0)
  })

  it('requires a reconnect event to occur inside the selected duration', () => {
    expect(() =>
      normalizeConfig({ target, scenario: 'reconnect', reconnectAfterSeconds: 60 })
    ).toThrow(/before the end/)
  })

  it('supports short workload overrides independently of the ramp and validates step limits', () => {
    const result = normalizeConfig({
      target,
      durationSeconds: 3,
      startDelaySeconds: 1,
      visibilityTimeoutSeconds: 5
    })
    expect(result.rampSeconds).toBe(5)
    expect(result.rampSteps).toBe(1)
    expect(normalizeConfig({ target, vus: 50, rampSteps: 5 }).rampSteps).toBe(5)
    expect(() => normalizeConfig({ target, vus: 1000, rampSteps: 101 })).toThrow(/rampSteps/)
    expect(
      normalizeConfig({ target, fileSizesBytes: Array(16).fill(1024) }).fileSizesBytes
    ).toHaveLength(16)
  })
})

describe('WebSocket allowlist and display', () => {
  it('allows target host by default and explicitly adds canonical extra hosts with ports', () => {
    const result = normalizeConfig({
      target,
      wsAllowedHosts: ['SOCKET.example.test:443', 'socket.example.test']
    })
    expect(result.wsAllowedHosts).toEqual(['localhost:8787', 'socket.example.test'])
  })

  it.each([
    'https://evil.test',
    '*.example.test',
    'good.test/evil',
    'user@evil.test',
    'host?x=1',
    'host#x'
  ])('rejects non-host WS allowlist entry %s', (value) => {
    expect(() => normalizeConfig({ target, wsAllowedHosts: [value] })).toThrow()
  })

  it('requires display URL even when business credentials are omitted', () => {
    expect(() => normalizeConfig({ target, scenario: 'display' })).toThrow(/displayWsUrl/)
  })

  it('supports an explicitly allowed local Chair port and its role/committee query', () => {
    const result = normalizeConfig({
      target,
      scenario: 'display',
      wsAllowedHosts: ['127.0.0.1:9000'],
      displayWsUrl: 'ws://127.0.0.1:9000/?role=display&committeeId=committee-1'
    })
    expect(result.displayWsUrl).toContain('role=display')
  })

  it.each([
    { displayWsUrl: 'ws://remote.test/', wsAllowedHosts: ['remote.test'] },
    { displayWsUrl: 'wss://unlisted.test/' },
    { displayWsUrl: 'wss://user:secret@localhost:8787/' }
  ])('rejects unsafe or unlisted display URLs', (overrides) => {
    expect(() => normalizeConfig({ target, scenario: 'display', ...overrides })).toThrow()
  })
})

describe('seat credentials', () => {
  it('matches the client invite format and preserves passwords byte for byte', () => {
    expect(normalizeInviteCode('abcd efgh jkmn')).toBe('ABCD-EFGH-JKMN')
    const input = seats()
    const validated = validateCredentials(input, config())
    expect(validated.seats[0].inviteCode).toBe('ABCD-EFGH-JKMN')
    expect(validated.seats[0].password).toBe(' secret one ')
    expect(input.seats[0].inviteCode).toBe('abcd efgh jkmn')
  })

  it('rejects too few seats rather than enabling modulo assignment', () => {
    expect(() => validateCredentials({ seats: seats().seats.slice(0, 1) }, config())).toThrow(
      /at least vus/
    )
  })

  it('detects normalized duplicate invites even when seat IDs differ', () => {
    const value = seats()
    value.seats[1].inviteCode = 'ABCD-EFGH-JKMN'
    expect(() => validateCredentials(value, config())).toThrow(/duplicates an inviteCode/)
  })

  it('rejects repeated declared seat IDs, including unused extra credentials', () => {
    const value = seats()
    value.seats.push({ inviteCode: '3456-789A-BCDE', password: 'extra-secret', seatId: ' seat-1 ' })
    expect(() => validateCredentials(value, config())).toThrow(/duplicates a seatId/)
  })

  it('permits omitted optional IDs but still needs distinct invites', () => {
    expect(
      validateCredentials(
        {
          seats: seats().seats.map(({ inviteCode, password }) => ({ inviteCode, password }))
        },
        config()
      ).seats
    ).toHaveLength(2)
  })

  it.each([
    { inviteCode: '', password: 'secret' },
    { inviteCode: 'ABCD-EFGH-JKMO', password: 'secret' },
    { inviteCode: 'ABCD-EFGH-JKMN', password: '' },
    { inviteCode: 'ABCD-EFGH-JKMN', password: '  ' },
    { inviteCode: 'ABCD-EFGH-JKMN', password: 123 },
    { inviteCode: 'ABCD-EFGH-JKMN', password: 'secret', expectedCapabilities: 'send_files' },
    { inviteCode: 'ABCD-EFGH-JKMN', password: 'secret', seatId: '' }
  ])('rejects invalid credentials without leaking their contents', (seat) => {
    let message = ''
    try {
      validateCredentials({ seats: [seat] }, { vus: 1 })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toBe('')
    expect(message).not.toContain('ABCD')
    expect(message).not.toContain('secret')
  })
})

describe('CLI and isolated process environment', () => {
  it('parses explicit flags and unit-bearing durations without a shell', () => {
    const cli = parseArgs([
      '--profile',
      'load',
      '--duration=2m',
      '--ramp',
      '500ms',
      '--vus',
      '25',
      '--credentials',
      './seats with spaces.json',
      '--file-sizes',
      '1024,20971520',
      '--observer-every',
      '5',
      '--dry-run'
    ])
    expect(cli.overrides).toMatchObject({
      profile: 'load',
      durationSeconds: 120,
      rampSeconds: 0.5,
      vus: 25,
      fileSizesBytes: [1024, MAX_FILE_BYTES],
      observerEvery: 5
    })
    expect(cli).toMatchObject({ credentials: './seats with spaces.json', dryRun: true })
    expect(parseDuration('1.5h')).toBe(5400)
  })

  it.each([
    ['--http-debug'],
    ['--out', 'json=raw.json'],
    ['--vus', '2', '--vus', '3'],
    ['--vus'],
    ['--vus', '--dry-run'],
    ['--vus', '0x10'],
    ['--vus', 'Infinity'],
    ['--duration', '1m30s'],
    ['--duration', '1;echo secret'],
    ['--profile', '../../secrets'],
    ['--dry-run=true'],
    ['main.ts']
  ])('rejects unsupported, duplicate or malformed CLI input %j', (...args) => {
    expect(() => parseArgs(args)).toThrow()
  })

  it('requires exactly k6 v2.3.0 including rejecting prereleases', () => {
    expect(parseK6Version('k6 v2.3.0 (commit/abc, go1.25, windows/amd64)\n')).toBe('2.3.0')
    expect(parseK6Version('k6.exe v2.3.0 (commit/e088784614, go1.26.8, windows/amd64)\n')).toBe(
      '2.3.0'
    )
    for (const value of [
      'k6 v2.2.0',
      'k6.exe v2.3.1',
      'k6 v2.3.0-rc.1',
      'k6.exe v2.3.0-rc.1',
      'custom 2.3.0'
    ]) {
      expect(() => parseK6Version(value)).toThrow(/v2.3.0/)
    }
  })

  it('drops inherited debug, raw sinks, dashboards, proxies and unrelated secrets', () => {
    const env = childEnvironment(
      {
        Path: 'C:\\tools',
        SystemRoot: 'C:\\Windows',
        HOME: '/home/test',
        K6_HTTP_DEBUG: 'full',
        k6_out: 'json=raw.json',
        K6_WEB_DASHBOARD: 'true',
        K6_WEB_DASHBOARD_EXPORT: 'leak.html',
        K6_LOG_OUTPUT: 'file=leak.log',
        K6_CONFIG: 'unsafe.json',
        K6_INSECURE_SKIP_TLS_VERIFY: 'true',
        VETO_LOAD_CREDENTIALS: 'secret contents',
        SECRET_TOKEN: 'sensitive',
        NODE_OPTIONS: '--require evil',
        HTTPS_PROXY: 'http://proxy.test',
        K6_NEW_MACHINE_READABLE_SUMMARY: 'true'
      },
      {
        config: config(),
        credentialsPath: 'C:\\secure dir\\seats.json',
        resultsPath: 'C:\\reports\\run-1',
        runId: 'safe-run-1'
      }
    )
    expect(env).toMatchObject({
      Path: 'C:\\tools',
      SystemRoot: 'C:\\Windows',
      K6_NEW_MACHINE_READABLE_SUMMARY: 'false',
      K6_WEB_DASHBOARD: 'false',
      VETO_LOAD_CREDENTIALS: 'C:/secure dir/seats.json',
      VETO_LOAD_RESULTS: 'C:/reports/run-1',
      VETO_LOAD_RUN_ID: 'safe-run-1'
    })
    for (const key of [
      'K6_HTTP_DEBUG',
      'k6_out',
      'K6_CONFIG',
      'K6_LOG_OUTPUT',
      'SECRET_TOKEN',
      'NODE_OPTIONS',
      'HTTPS_PROXY'
    ]) {
      expect(env).not.toHaveProperty(key)
    }
    expect(JSON.parse(env.VETO_LOAD_CONFIG)).toEqual(config())
    expect(JSON.stringify(env)).not.toContain('sensitive')
  })
})

describe('bounded structured diagnostics', () => {
  function line(payload: unknown, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      source: 'console',
      level: 'error',
      msg: JSON.stringify(payload),
      ...extra
    })
  }

  it('keeps failure classifications and excludes credentials, tokens and unrecognized fields', () => {
    const diagnostics = createDiagnostics(seats())
    diagnostics.consume(
      line({
        operation: 'seat.authenticate',
        kind: 'http',
        status: 401,
        impact: 'operation_failed',
        password: 'secret-two',
        token: 'arbitrary-session-token',
        response: 'raw response'
      })
    )
    diagnostics.consume(
      line({
        operation: 'file.upload',
        kind: 'body_too_large',
        status: 413,
        impact: 'operation_failed'
      })
    )
    diagnostics.consume(
      JSON.stringify({ level: 'error', msg: 'internal secret-two arbitrary-session-token' })
    )
    diagnostics.consume('raw secret-two')
    expect(diagnostics.events).toEqual([
      { operation: 'seat.authenticate', kind: 'http', status: 401, impact: 'operation_failed' },
      { operation: 'file.upload', kind: 'body_too_large', status: 413, impact: 'operation_failed' }
    ])
    expect(diagnostics.summary()).toMatchObject({
      classifications: { 'seat.authenticate:http:401': 1, 'file.upload:body_too_large:413': 1 },
      internalErrors: 1,
      suppressedLines: 2
    })
    expect(JSON.stringify([diagnostics.events, diagnostics.summary()])).not.toMatch(
      /secret-two|arbitrary-session-token/
    )
  })

  it('redacts credential substrings even when included in operation or kind labels', () => {
    const diagnostics = createDiagnostics(seats())
    diagnostics.consume(
      line({
        operation: 'abcd-efgh-jkmn',
        kind: 'secret-two',
        impact: 'operation_failed'
      })
    )
    expect(diagnostics.events[0]).toEqual({
      operation: 'redacted',
      kind: 'redacted',
      status: 0,
      impact: 'operation_failed'
    })
  })

  it('caps retained events and category cardinality', () => {
    const diagnostics = createDiagnostics()
    for (let index = 0; index < 2200; index++) {
      diagnostics.consume(
        line({
          operation: `file.operation${index}`,
          kind: 'http',
          status: 500,
          impact: 'operation_failed'
        })
      )
    }
    expect(diagnostics.events).toHaveLength(2000)
    expect(Object.keys(diagnostics.summary().classifications)).toHaveLength(200)
    expect(diagnostics.summary().droppedEvents).toBeGreaterThan(0)
  })
})

describe('runner lifecycle', () => {
  async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), 'veto-runner-test-'))
    tempDirectories.push(directory)
    const credentials = join(directory, 'seats.json')
    await writeFile(credentials, JSON.stringify(seats()))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    return { directory, credentials, log, error }
  }

  function fakeProcesses({
    exitCode = 0,
    interrupt = false,
    version = 'k6 v2.3.0',
    failSpawn = false
  } = {}) {
    const children: Array<EventEmitter & { kill: ReturnType<typeof vi.fn> }> = []
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn((signal) => {
          queueMicrotask(() => child.emit('close', null, signal))
          return true
        })
      })
      children.push(child)
      queueMicrotask(() => {
        if (args?.[0] === 'version') {
          child.stdout.write(version)
          child.emit('close', 0, null)
        } else if (args?.[0] === 'rev-parse') {
          child.stdout.write('a'.repeat(40))
          child.emit('close', 0, null)
        } else if (failSpawn) {
          child.emit('error', Object.assign(new Error('internal secret'), { code: 'ENOENT' }))
          child.emit('close', -2, null)
        } else if (interrupt) {
          process.emit('SIGINT')
        } else {
          child.emit('close', exitCode, null)
        }
      })
      return child as unknown as ReturnType<typeof spawn>
    })
    return children
  }

  it('validates dry-run inputs and k6 without creating reports or running a workload', async () => {
    const { directory, credentials, log } = await fixture()
    fakeProcesses()
    expect(
      await main([
        '--target',
        target,
        '--credentials',
        credentials,
        '--k6',
        'fake-k6',
        '--results',
        directory,
        '--dry-run'
      ])
    ).toBe(0)
    expect(vi.mocked(spawn).mock.calls.map((call) => call[1]?.[0])).toEqual([
      'version',
      'rev-parse'
    ])
    expect(await readdir(directory)).toEqual(['seats.json'])
    const output = log.mock.calls.flat().join('\n')
    expect(output).not.toContain('secret one')
    expect(output).not.toContain('ABCD')
    expect(JSON.parse(output).cloudflareVerified).toBe(false)
  })

  it('allows credential-free display only with an explicit target and WS URL', async () => {
    const { directory } = await fixture()
    fakeProcesses()
    expect(
      await main([
        '--target',
        target,
        '--scenario',
        'display',
        '--display-ws-url',
        'ws://localhost:8787/?role=display',
        '--k6',
        'fake-k6',
        '--results',
        directory,
        '--dry-run'
      ])
    ).toBe(0)
    expect(vi.mocked(spawn).mock.calls[0][2]?.env?.VETO_LOAD_CREDENTIALS).toBe('')
  })

  it('rejects missing business credentials before executing k6', async () => {
    await expect(main(['--target', target])).rejects.toThrow(/credentials/)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects malformed secret JSON without echoing parse input', async () => {
    const { credentials } = await fixture()
    await writeFile(credentials, '{"password":"never-print-this-secret" INVALID')
    await expect(main(['--target', target, '--credentials', credentials])).rejects.toThrow(
      'credentials must contain valid JSON'
    )
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses a wrong k6 version before launching the workload', async () => {
    const { credentials } = await fixture()
    fakeProcesses({ version: 'k6 v2.2.0' })
    await expect(
      main(['--target', target, '--credentials', credentials, '--k6', 'fake-k6'])
    ).rejects.toThrow(/v2.3.0/)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it.each([
    { exitCode: 0, expected: 0 },
    { exitCode: 99, expected: 99 },
    { interrupt: true, expected: 130 },
    { failSpawn: true, expected: 1 }
  ])(
    'saves independent metadata on exit, thresholds, SIGINT or spawn errors: %j',
    async (behavior) => {
      const { directory, credentials, log, error } = await fixture()
      const before = process.listenerCount('SIGINT')
      const children = fakeProcesses(behavior)
      const code = await main([
        '--target',
        target,
        '--credentials',
        credentials,
        '--k6',
        'fake-k6',
        '--results',
        directory
      ])
      expect(code).toBe(behavior.expected)
      expect(process.listenerCount('SIGINT')).toBe(before)
      const runDirectory = (await readdir(directory)).find((name) => name !== 'seats.json')!
      expect(runDirectory).toMatch(/^[a-zA-Z0-9_-]+$/)
      const reportDirectory = join(directory, runDirectory)
      const metadata = JSON.parse(await readFile(join(reportDirectory, 'metadata.json'), 'utf8'))
      expect(metadata).toMatchObject({
        environment: 'local',
        target,
        exitCode: behavior.expected,
        k6Version: '2.3.0',
        gitRevision: 'a'.repeat(40),
        cloudflareVerified: false
      })
      expect(Date.parse(metadata.ended)).toBeGreaterThanOrEqual(Date.parse(metadata.started))
      expect(metadata.cloudflareVerification).toContain('real cloud run')
      const runCall = vi.mocked(spawn).mock.calls.find((call) => call[1]?.[0] === 'run')!
      expect(runCall[1]).toEqual([
        'run',
        '--config',
        join(reportDirectory, 'k6-options.json').replaceAll('\\', '/'),
        '--address',
        '',
        '--out',
        `json=${join(reportDirectory, 'samples.json').replaceAll('\\', '/')}`,
        '--log-format=json',
        '--log-output=stderr',
        '--quiet',
        'main.ts'
      ])
      expect(runCall[2]).toMatchObject({
        cwd: fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, ''),
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe']
      })
      expect(runCall[2]?.env).toMatchObject({
        VETO_LOAD_CREDENTIALS: resolve(credentials).replaceAll('\\', '/'),
        VETO_LOAD_RESULTS: resolve(reportDirectory).replaceAll('\\', '/'),
        VETO_LOAD_RUN_ID: runDirectory
      })
      if (behavior.interrupt) expect(children.at(-1)?.kill).toHaveBeenCalledWith('SIGINT')
      const published = JSON.stringify([metadata, log.mock.calls, error.mock.calls])
      expect(published).not.toContain('secret one')
      expect(published).not.toContain('ABCD')
      expect(published).not.toContain('internal secret')
    }
  )
})
