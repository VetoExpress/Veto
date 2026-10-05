import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { CloudClaimResult } from '$lib/classes/clients/cloud-join-client'
import { conferences } from './conference-store'
import { rememberCloudMembership } from './cloud-membership-store'

function result(committeeId: string, seatId: string): CloudClaimResult {
  return {
    inviteCode: 'ABCD-EFGH-JK23', conferenceId: 'conference-1', conferenceName: 'Test',
    organizer: '', committeeId, committeeName: committeeId, committeeType: 'cabinet',
    seatId, seatName: seatId, seatShortName: '', roleTemplateId: 'chair', roleName: '主席',
    capabilities: ['control_conference'], seatState: 'claimed', hasPassword: false,
    wsUrl: '', token: 'test-token', isChair: true,
    identity: {
      userId: seatId, displayName: seatId, conferenceId: 'conference-1', committeeId,
      seatId, roleTemplateId: 'chair', roleName: '主席', capabilities: ['control_conference'], isChair: true
    }
  }
}

describe('cloud memberships in multiple committees', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    })
    conferences.set([])
  })

  afterEach(() => vi.unstubAllGlobals())

  it('provides the active committee after joining another seat in the same conference', async () => {
    await rememberCloudMembership(result('AAA', 'delegate'))
    await rememberCloudMembership(result('BBB', 'chair'))

    const conference = get(conferences)[0]
    expect(conference?.getCommittee('AAA')).toBeDefined()
    expect(conference?.getCommittee('BBB')).toBeDefined()
    expect(conference?.getCommittee('BBB')?.getSeat('chair')).toBeDefined()
    expect(conference?.seatGroups.map((group) => group.id)).toContain('BBB:group')
    expect(conference?.users.map((user) => user.id)).toContain('chair')
  })

  it('keeps existing committee objects and procedure state when joining or returning', async () => {
    await rememberCloudMembership(result('AAA', 'chair-a'))
    const original = get(conferences)[0].getCommittee('AAA')!
    original.name = '本地会场名称'
    original.getSeat('chair-a')!.procedure!.attendance = 'present'

    await rememberCloudMembership(result('BBB', 'chair-b'))
    await rememberCloudMembership(result('AAA', 'chair-a'))

    expect(get(conferences)).toHaveLength(1)
    expect(get(conferences)[0].committees).toHaveLength(2)
    expect(get(conferences)[0].getCommittee('AAA')).toBe(original)
    expect(original.name).toBe('本地会场名称')
    expect(original.getSeat('chair-a')!.procedure!.attendance).toBe('present')
  })
})
