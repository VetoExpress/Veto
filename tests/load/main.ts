import type { Options } from 'k6/options'
import { SharedArray } from 'k6/data'
import { vu } from 'k6/execution'
import { credentialFor, delay } from './lib/model.ts'
import { SeatSession } from './lib/seat-session.ts'
import { OnlineWindow } from './lib/online-window.ts'
import { renderReport } from './lib/report.ts'
import * as metrics from './lib/metrics.ts'
import type { LoadConfig, SeatCredential, Summary } from './lib/types.ts'
import { reviewerLoop, submitMixed, uploadFiles, verifyFiles } from './scenarios/workflows.ts'
import { runDisplay } from './scenarios/display.ts'

if (!__ENV.VETO_LOAD_CONFIG || !__ENV.VETO_LOAD_RUN_ID || !__ENV.VETO_LOAD_RESULTS) {
  throw new Error('Run through node tests/load/run.mjs so target and credentials are validated.')
}
const config: LoadConfig = JSON.parse(__ENV.VETO_LOAD_CONFIG)
const runId = __ENV.VETO_LOAD_RUN_ID
const seats = new SharedArray<SeatCredential>('load seats', () =>
  config.scenario === 'display' ? [] : JSON.parse(open(__ENV.VETO_LOAD_CREDENTIALS)).seats
)
const fileScenario = config.scenario === 'files' || config.scenario === 'mixed'
const observers = config.observerEvery ? Math.floor(config.vus / config.observerEvery) : 0
const expectedUploads = (config.vus - observers) * config.filesPerVu
const thresholds: Options['thresholds'] = {
  load_errors: ['count==0'],
  iterations: [`count==${config.vus}`],
  ...(config.scenario === 'display'
    ? {
        display_projection_ok: ['rate==1']
      }
    : {
        http_req_failed: [`rate<=${config.thresholds.errorRate}`],
        http_req_duration: [`p(95)<${config.thresholds.httpP95Ms}`],
        seat_auth_ok: ['rate==1'],
        ws_ready_ok: ['rate==1'],
        seat_session_expired: ['count==0'],
        ...(config.onlineWindowSeconds
          ? {
              online_window_ok: ['rate==1'],
              online_window_seats: [`count==${config.vus}`]
            }
          : {}),
        ...(fileScenario
          ? {
              files_uploaded: [`count>=${expectedUploads}`],
              files_downloaded: [`count>=${expectedUploads}`],
              file_upload_ok: ['rate==1'],
              file_download_integrity_ok: ['rate==1'],
              file_upload_ms: [`p(95)<${config.thresholds.uploadP95Ms}`],
              content_visible_ok: ['rate==1'],
              content_visible_ms: [`p(95)<${config.thresholds.visibleP95Ms}`],
              live_notifications: ['count>0'],
              live_delivery_ok: ['rate==1']
            }
          : {}),
        ...(config.scenario === 'mixed' ? { business_operations: ['count>0'] } : {}),
        ...(config.scenario === 'reconnect' ? { reconnect_ok: ['rate==1'] } : {})
      })
}
if (config.scenario === 'mixed') {
  for (const operation of [
    'news.submit',
    'news.approve',
    'directive.submit',
    'directive.approve',
    'situation.publish'
  ]) {
    // Expose bounded operation counts in the aggregate report, including zero-coverage workflows.
    thresholds[`business_operations{operation:${operation}}`] = ['count>=0']
  }
}
// A single scenario keeps one VU bound to one Seat for the entire connection lifetime.
// Ramp-down is intentionally avoided: cutting off active uploads would contaminate integrity results.
export const options: Options = {
  scenarios: {
    seats: {
      executor: 'per-vu-iterations',
      vus: config.vus,
      iterations: 1,
      maxDuration: `${
        config.durationSeconds +
        config.rampSeconds +
        config.startDelaySeconds +
        config.readyTimeoutSeconds +
        config.requestTimeoutSeconds * 2 +
        config.visibilityTimeoutSeconds * config.filesPerVu * 2 +
        120
      }s`
    }
  },
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Exclude url: a target URL or WS URL may otherwise disclose identifiers in exported metrics.
  systemTags: ['name', 'method', 'status', 'expected_response', 'scenario'],
  discardResponseBodies: true
}

export function setup(): {
  started: number
  windowStart: number
  windowEnd: number
} {
  const started = Date.now()
  const windowStart = started + (config.rampSeconds + config.startDelaySeconds) * 1000
  if (config.onlineWindowSeconds) {
    metrics.onlineWindowStart.add(windowStart)
    metrics.onlineWindowEnd.add(windowStart + config.onlineWindowSeconds * 1000)
  }
  return {
    started,
    windowStart,
    windowEnd: windowStart + (config.onlineWindowSeconds ?? 0) * 1000
  }
}

export default async function (data: {
  started: number
  windowStart: number
  windowEnd: number
}): Promise<void> {
  // Initialize zero-sample counters so thresholds cannot mistake skipped work for success.
  metrics.errors.add(0)
  metrics.sessionExpired.add(0)
  if (config.onlineWindowSeconds) metrics.onlineWindowSeats.add(0)
  if (fileScenario) {
    metrics.uploaded.add(0)
    metrics.downloaded.add(0)
    metrics.notifications.add(0)
  }
  if (config.scenario === 'mixed') metrics.operations.add(0)
  if (config.rampSeconds) {
    const steps = config.rampSteps ?? 1
    const fraction =
      steps > 1
        ? Math.floor(((vu.idInTest - 1) * steps) / config.vus) / Math.max(1, steps - 1)
        : (vu.idInTest - 1) / Math.max(1, config.vus - 1)
    const stagger =
      config.openLoopSeed === undefined
        ? 0
        : ((vu.idInTest * 2654435761 + config.openLoopSeed) >>> 0) % 500
    await delay(config.rampSeconds * 1000 * fraction + stagger)
  }
  if (config.scenario === 'display') {
    await runDisplay(config, runId, vu.idInTest)
    return
  }
  const credential = credentialFor(seats, vu.idInTest)
  const window = config.onlineWindowSeconds
    ? new OnlineWindow(data.windowStart, data.windowEnd)
    : undefined
  const session = new SeatSession(config, runId, (online) => {
    window?.update(online, Date.now())
    if (config.onlineWindowSeconds) metrics.connectionState.add(online ? 1 : 0)
  })
  let running = true
  let reviewer: Promise<void> = Promise.resolve()
  let until = Date.now() + config.durationSeconds * 1000
  try {
    await session.start(credential)
    await session.loadInitial()
    if (window) await delay(Math.max(0, data.windowStart - Date.now()))
    until = window
      ? data.windowStart + config.durationSeconds * 1000
      : Date.now() + config.durationSeconds * 1000
    const observer = Boolean(config.observerEvery && vu.idInTest % config.observerEvery === 0)
    if (config.scenario === 'mixed' || config.scenario === 'files' || observer) {
      session.api.phase = 'online-window'
      reviewer = reviewerLoop(session, () => running)
    }
    if (config.scenario === 'reconnect') {
      await delay(config.reconnectAfterSeconds * 1000)
      await session.reconnect()
    }
    if (fileScenario && !observer) {
      // Absolute barrier aligns the upload burst across users that completed authentication in time.
      const barrier = data.started + (config.rampSeconds + config.startDelaySeconds) * 1000
      await delay(Math.max(0, barrier - Date.now()))
      const records = await uploadFiles(session, vu.idInTest)
      await verifyFiles(session, records)
    }
    let sequence = config.filesPerVu
    do {
      session.api.phase =
        Date.now() < (window?.end ?? data.windowStart) ? 'online-window' : 'workload'
      if (config.scenario === 'mixed' && !observer)
        await submitMixed(session, credential, vu.idInTest, sequence++)
      await delay(config.actionIntervalSeconds * 1000)
    } while (session.active && Date.now() < until)
    // Reviewers remain alive while the last, slower uploads finish and are verified.
    const reviewUntil =
      data.started +
      (config.rampSeconds +
        config.startDelaySeconds +
        config.durationSeconds +
        config.visibilityTimeoutSeconds) *
        1000
    while (session.active && Date.now() < reviewUntil && fileScenario) await delay(100)
  } catch {
    metrics.recordError('seat.scenario', 'scenario_failed')
  } finally {
    if (window) {
      const passed = window.complete(Date.now())
      metrics.onlineWindowOK.add(passed)
      if (passed) metrics.onlineWindowSeats.add(1)
      else metrics.recordError('seat.online_window', 'incomplete_online_window')
    }
    running = false
    await reviewer
    await session.close()
  }
}

export function handleSummary(data: Summary): Record<string, string> {
  const report = renderReport(data, config, runId)
  return {
    [`${__ENV.VETO_LOAD_RESULTS}/summary.json`]: JSON.stringify(data, null, 2),
    [`${__ENV.VETO_LOAD_RESULTS}/report.md`]: report,
    ...(config.onlineWindowSeconds
      ? {
          [`${__ENV.VETO_LOAD_RESULTS}/online-window.json`]: JSON.stringify(
            {
              requiredSeats: config.vus,
              completedSeats: data.metrics.online_window_seats?.values.count ?? 0,
              durationSeconds: config.onlineWindowSeconds,
              start: data.metrics.online_window_start_epoch_ms?.values.value ?? null,
              end: data.metrics.online_window_end_epoch_ms?.values.value ?? null
            },
            null,
            2
          )
        }
      : {}),
    stdout: `${report}\n`
  }
}
