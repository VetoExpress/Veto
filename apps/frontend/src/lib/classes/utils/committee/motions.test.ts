import { describe, expect, it } from 'vitest'
import { resolveMotion } from './motions'

describe('motion utilities', () => {
  it('resolves direct and voting motions', () => {
    expect(resolveMotion('change_attendance')).toMatchObject({ requiresVoting: false })
    expect(resolveMotion('close_meeting')).toMatchObject({
      requiresVoting: true,
      votingMajority: 'two_thirds'
    })
    expect(resolveMotion('moderated_debate')).toMatchObject({
      requiresVoting: true,
      votingMajority: 'simple_majority'
    })
    expect(resolveMotion('unmoderated_debate')).toMatchObject({
      requiresVoting: true,
      votingMajority: 'simple_majority'
    })
    expect(resolveMotion('enter_next_procedure')).toMatchObject({
      requiresVoting: true,
      votingMajority: 'two_thirds'
    })
  })
})
