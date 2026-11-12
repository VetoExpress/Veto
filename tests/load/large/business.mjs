/** Exercise production HTTP contracts with different author, processor and reader seats. */
export async function businessFlow({
  kind,
  request,
  author,
  reviewer,
  reader,
  title,
  decision = 'approved',
  active = () => true,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => performance.now()
}) {
  let step = 'start'
  const visibility = []
  const begin = now()
  const checked = (data) => {
    if (!data) throw new Error('REQUEST_FAILED')
    return data
  }
  const record = (item, status) =>
    item?.title === title &&
    item.content === title &&
    item.sourceSeatId === author.seat.seatId &&
    item.conferenceId === author.seat.conferenceId &&
    item.status === status
  async function visible(seat, operation, route, key, id, valid, started) {
    step = operation
    const deadline = now() + 45000
    while (active()) {
      const result = checked(
        await request(seat, operation, route, { validate: (data) => Array.isArray(data?.[key]) })
      )
      const item = result[key].find((entry) => entry.id === id)
      if (item) {
        if (!valid(item)) throw new Error('CONTENT_OR_STATUS_MISMATCH')
        visibility.push({ operation, elapsedMs: now() - started })
        return item
      }
      if (now() >= deadline) throw new Error('VISIBILITY_TIMEOUT')
      await pause(2000)
    }
    throw new Error('WINDOW_ENDED')
  }
  try {
    if (
      !author ||
      !reviewer ||
      !reader ||
      author.index === reviewer.index ||
      author.index === reader.index ||
      author.seat.conferenceId !== reader.seat.conferenceId ||
      author.seat.conferenceId !== reviewer.seat.conferenceId
    )
      throw new Error('INDEPENDENT_SEATS_REQUIRED')
    if (kind === 'news') {
      step = 'news.submit'
      const submittedAt = now()
      const result = checked(
        await request(author, step, '/veto/news', {
          method: 'POST',
          json: { source: 'Veto pressure test', title, content: title, contentTime: Date.now() },
          headers: { 'idempotency-key': title },
          validate: (data) => typeof data?.news?.id === 'string' && record(data.news, 'submitted')
        })
      )
      const id = result.news.id
      await visible(
        author,
        'news.mine.submitted',
        '/veto/news/mine',
        'news',
        id,
        (item) => record(item, 'submitted'),
        submittedAt
      )
      await visible(
        reviewer,
        'news.workflow',
        '/veto/news/workflow',
        'news',
        id,
        (item) => record(item, 'submitted'),
        submittedAt
      )
      step = 'news.approve'
      const publishedAt = now()
      checked(
        await request(reviewer, step, `/veto/news/${id}/approve`, {
          method: 'POST',
          json: { note: 'Load review' },
          validate: (data) => data?.news?.id === id && record(data.news, 'published')
        })
      )
      await visible(
        reader,
        'news.published.get',
        '/veto/news',
        'news',
        id,
        (item) => record(item, 'published'),
        publishedAt
      )
      await visible(
        author,
        'news.mine.published',
        '/veto/news/mine',
        'news',
        id,
        (item) => record(item, 'published'),
        publishedAt
      )
    } else if (kind === 'directive') {
      step = 'directive.targets'
      checked(
        await request(author, step, '/veto/directives/targets', {
          validate: (data) => data?.targets?.some((item) => item.id === reviewer.seat.committeeId)
        })
      )
      step = 'directive.submit'
      const submittedAt = now()
      const result = checked(
        await request(author, step, '/veto/directives', {
          method: 'POST',
          json: { title, content: title, targetCommitteeId: reviewer.seat.committeeId },
          headers: { 'idempotency-key': title },
          validate: (data) =>
            typeof data?.directive?.id === 'string' &&
            record(data.directive, 'submitted') &&
            data.directive.targetCommitteeId === reviewer.seat.committeeId
        })
      )
      const id = result.directive.id
      await visible(
        author,
        'directive.mine.submitted',
        '/veto/directives/mine',
        'directives',
        id,
        (item) => record(item, 'submitted'),
        submittedAt
      )
      await visible(
        reviewer,
        'directive.workflow',
        '/veto/directives/workflow',
        'directives',
        id,
        (item) => record(item, 'submitted') && item.targetCommitteeId === reviewer.seat.committeeId,
        submittedAt
      )
      step = 'directive.claim'
      checked(
        await request(reviewer, step, `/veto/directives/${id}/claim`, {
          method: 'POST',
          validate: (data) => data?.directive?.id === id && record(data.directive, 'processing')
        })
      )
      step = `directive.${decision === 'approved' ? 'approve' : 'reject'}`
      const decidedAt = now()
      checked(
        await request(
          reviewer,
          step,
          `/veto/directives/${id}/${decision === 'approved' ? 'approve' : 'reject'}`,
          {
            method: 'POST',
            json: { note: 'Load decision' },
            validate: (data) => data?.directive?.id === id && record(data.directive, decision)
          }
        )
      )
      await visible(
        author,
        'directive.mine.decided',
        '/veto/directives/mine',
        'directives',
        id,
        (item) => record(item, decision),
        decidedAt
      )
      step = 'directive.revisions'
      checked(
        await request(reviewer, step, `/veto/directives/${id}/revisions`, {
          validate: (data) =>
            data?.revisions?.some(
              (item) => item.title === title && item.content === title && item.decision === decision
            )
        })
      )
    } else if (kind === 'situation') {
      step = 'situation.publish'
      const publishedAt = now()
      const result = checked(
        await request(author, step, '/veto/situations', {
          method: 'POST',
          json: { content: title, contentTime: Date.now() },
          validate: (data) =>
            typeof data?.situation?.id === 'string' &&
            data.situation.content === title &&
            data.situation.sourceSeatId === author.seat.seatId &&
            data.situation.status === 'published' &&
            Number.isSafeInteger(data.situation.contentTime)
        })
      )
      await visible(
        reader,
        'situation.published.get',
        '/veto/situations',
        'situations',
        result.situation.id,
        (item) =>
          item.content === title &&
          item.sourceSeatId === author.seat.seatId &&
          item.conferenceId === author.seat.conferenceId &&
          item.status === 'published' &&
          item.contentTime === result.situation.contentTime,
        publishedAt
      )
    } else throw new Error('UNKNOWN_WORKFLOW')
    return { kind, ok: true, elapsedMs: now() - begin, visibility }
  } catch (error) {
    return { kind, ok: false, step, code: error.message, elapsedMs: now() - begin, visibility }
  }
}
