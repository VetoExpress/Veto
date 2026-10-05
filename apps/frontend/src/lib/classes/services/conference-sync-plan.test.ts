import { describe, expect, it } from 'vitest'
import { planConferenceSync } from './conference-sync-plan'
describe('conference synchronization', () => {
  it('uploads new and previously offline conferences and restores on a new device', () => {
    expect(planConferenceSync('local', undefined, undefined)).toBe('upload')
    expect(planConferenceSync(undefined, 'remote', undefined)).toBe('download')
    expect(planConferenceSync('changed', 'base', 'base')).toBe('upload')
  })
  it('downloads remote changes only when the local copy has no changes', () => {
    expect(planConferenceSync('base', 'updated', 'base')).toBe('download')
    expect(planConferenceSync('same', 'same', 'base')).toBe('unchanged')
  })
  it('detects conflicts instead of silently losing offline or multi-device edits', () => {
    expect(planConferenceSync('offline', 'other device', 'base')).toBe('conflict')
    expect(planConferenceSync('local', 'remote', undefined)).toBe('conflict')
    expect(planConferenceSync('offline', undefined, 'base')).toBe('conflict')
  })
  it('propagates deletions and protects edits made concurrently with deletion', () => {
    expect(planConferenceSync(undefined, 'base', 'base')).toBe('delete-cloud')
    expect(planConferenceSync('base', undefined, 'base')).toBe('delete-local')
    expect(planConferenceSync(undefined, 'updated', 'base')).toBe('conflict')
  })
})
