import { describe, expect, it } from 'vitest'
import { renderReport } from './report'
import type { LoadConfig } from './types'

describe('load report', () => {
  it('reports threshold failures and describes the limits of notification timing', () => {
    const report = renderReport(
      {
        metrics: {
          file_upload_ok: {
            type: 'rate',
            values: { rate: 0.5 },
            thresholds: { 'rate==1': { ok: false } }
          }
        }
      },
      {
        environment: 'local',
        scenario: 'files',
        profile: 'smoke',
        vus: 2,
        durationSeconds: 3,
        rampSeconds: 0
      } as LoadConfig,
      'run-1'
    )
    expect(report).toContain('未通过')
    expect(report).toContain('file_upload_ok: rate==1')
    expect(report).toContain('不等同于纯 WS 传播延迟')
    expect(report).toContain('不代表 Cloudflare 容量通过')
  })
})
