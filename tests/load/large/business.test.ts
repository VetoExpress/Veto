import { describe, expect, it } from 'vitest'
import { businessFlow } from './business.mjs'

function harness(kind: string, corrupt = false) {
  const author = { index: 1, seat: { seatId: 'a', committeeId: 'from', conferenceId: 'c' } }
  const reviewer = { index: 2, seat: { seatId: 'b', committeeId: 'to', conferenceId: 'c' } }
  const reader = { index: 3, seat: { seatId: 'r', committeeId: 'from', conferenceId: 'c' } }
  const calls: { seat: number; operation: string }[] = []
  let status = 'submitted'
  let clock = 0
  const request = async (
    seat: typeof author,
    operation: string,
    route: string,
    options: any = {}
  ) => {
    calls.push({ seat: seat.index, operation })
    if (operation.endsWith('claim')) status = 'processing'
    if (operation.endsWith('approve')) status = kind === 'news' ? 'published' : 'approved'
    if (operation.endsWith('reject')) status = 'rejected'
    if (operation === 'situation.publish') status = 'published'
    const item = {
      id: 'id',
      sourceSeatId: 'a',
      conferenceId: 'c',
      targetCommitteeId: 'to',
      title: 'content',
      content: corrupt && operation.endsWith('.get') ? 'wrong' : 'content',
      contentTime: 100,
      status
    }
    const value = route.endsWith('/targets')
      ? { targets: [{ id: 'to' }] }
      : route.endsWith('/revisions')
        ? { revisions: [{ title: 'content', content: 'content', decision: status }] }
        : options.method === 'POST'
          ? { [kind]: item }
          : {
              [kind === 'directive' ? 'directives' : kind === 'situation' ? 'situations' : 'news']:
                [item]
            }
    clock += 10
    return options.validate && !options.validate(value) ? null : value
  }
  return { author, reviewer, reader, calls, request, now: () => clock }
}

describe('cross-seat business acceptance', () => {
  it('requires another seat to approve news and another reader to verify published content', async () => {
    const h = harness('news')
    const result = await businessFlow({ ...h, kind: 'news', title: 'content' })
    expect(result.ok).toBe(true)
    expect(h.calls.find((call) => call.operation === 'news.approve')?.seat).toBe(2)
    expect(h.calls.find((call) => call.operation === 'news.published.get')?.seat).toBe(3)
    expect(result.visibility.some((entry: any) => entry.operation === 'news.published.get')).toBe(
      true
    )
  })
  it.each(['approved', 'rejected'])(
    'checks directive %s decisions through the author list and revisions',
    async (decision) => {
      const h = harness('directive')
      const result = await businessFlow({ ...h, kind: 'directive', decision, title: 'content' })
      expect(result.ok).toBe(true)
      expect(h.calls.find((call) => call.operation === 'directive.workflow')?.seat).toBe(2)
      expect(h.calls.find((call) => call.operation === 'directive.mine.decided')?.seat).toBe(1)
      expect(h.calls.at(-1)?.operation).toBe('directive.revisions')
    }
  )
  it('rejects HTTP 200 lists when the published content is wrong', async () => {
    const h = harness('situation', true)
    const result = await businessFlow({ ...h, kind: 'situation', title: 'content' })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('CONTENT_OR_STATUS_MISMATCH')
  })
  it('does not count a flow that never got past a failed submission', async () => {
    const h = harness('news')
    const result = await businessFlow({
      ...h,
      request: async () => null,
      kind: 'news',
      title: 'content'
    })
    expect(result.ok).toBe(false)
    expect(result.step).toBe('news.submit')
  })
})
