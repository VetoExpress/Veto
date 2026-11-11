import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

function nextMessage(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeEventListener('message', message)
      socket.removeEventListener('error', error)
      socket.removeEventListener('close', close)
    }
    const fail = (reason) => {
      cleanup()
      reject(new Error(label, { cause: reason }))
    }
    const message = (event) => {
      let value = event.data
      try {
        value = JSON.parse(value)
      } catch {
        // The Durable Object answers the literal application heartbeat with "pong".
      }
      if (!predicate(value)) return
      cleanup()
      resolve(value)
    }
    const error = () => fail('WebSocket error')
    const close = (event) => fail(`WebSocket closed: ${event.code} ${event.reason}`)
    const timer = setTimeout(() => fail('Timed out after 10 seconds'), 10000)
    socket.addEventListener('message', message)
    socket.addEventListener('error', error)
    socket.addEventListener('close', close)
  })
}

export async function verifyLocalBusiness(api, baseUrl, sessions) {
  const mpc = sessions.find((session) => session.capabilities.includes('draft_news'))
  const ipc = sessions.find((session) => session.capabilities.includes('publish_situation'))
  assert(mpc && ipc, 'Need both a news author and an IPC publisher')
  const wsUrl = new URL(mpc.wsUrl)
  const target = new URL(baseUrl)
  assert.equal(wsUrl.host, target.host, 'Backend wsUrl must preserve the target host and port')
  assert.equal(wsUrl.protocol, 'ws:')
  assert.equal(wsUrl.pathname, '/v1/veto/ws')
  const socket = new WebSocket(wsUrl, ['veto', `token.${mpc.token}`, 'live.v1'])
  try {
    await nextMessage(socket, (message) => message?.type === 'ready', 'WS ready failed')
    assert.equal(socket.protocol, 'veto', 'Negotiated WS subprotocol')
    const pong = nextMessage(socket, (message) => message === 'pong', 'WS heartbeat failed')
    socket.send('ping')
    await pong

    await api('/veto/committee/current', { token: mpc.token })
    await api('/veto/committee/current', { token: ipc.token })
    await api('/veto/timeline', { token: ipc.token })
    for (const operation of ['resume', 'pause']) {
      await api('/veto/timeline', {
        method: 'PATCH',
        token: ipc.token,
        body: { action: operation }
      })
    }

    const invalidation = nextMessage(
      socket,
      (message) => message?.type === 'invalidate' && message.topics.includes('news'),
      'WS news invalidation failed'
    )
    // Attach immediately so an HTTP error cannot leave a rejected promise unobserved.
    invalidation.catch(() => {})
    const news = await api('/veto/news', {
      method: 'POST',
      token: mpc.token,
      body: { source: 'Local load', title: 'Local readiness', content: 'Real Worker news.' },
      headers: { 'Idempotency-Key': randomUUID() },
      status: 201
    })
    await invalidation
    await api(`/veto/news/${news.news.id}/approve`, {
      method: 'POST',
      token: ipc.token,
      body: { note: 'Local readiness' }
    })
    const publishedNews = await api('/veto/news', { token: mpc.token })
    assert(publishedNews.news.some((item) => item.id === news.news.id))

    const directive = await api('/veto/directives', {
      method: 'POST',
      token: mpc.token,
      headers: { 'Idempotency-Key': randomUUID() },
      body: {
        title: 'Local readiness',
        content: 'Real Worker directive.',
        targetCommitteeId: ipc.identity.committeeId
      },
      status: 201
    })
    await api(`/veto/directives/${directive.directive.id}/claim`, {
      method: 'POST',
      token: ipc.token
    })
    const decision = await api(`/veto/directives/${directive.directive.id}/approve`, {
      method: 'POST',
      token: ipc.token,
      body: { note: 'Local readiness' }
    })
    assert.equal(decision.directive.status, 'approved')

    const situation = await api('/veto/situations', {
      method: 'POST',
      token: ipc.token,
      body: { content: 'Real Worker situation.' },
      status: 201
    })
    const situations = await api('/veto/situations', { token: mpc.token })
    assert(situations.situations.some((item) => item.id === situation.situation.id))

    const bytes = Buffer.from('Real local R2 file.\n')
    const upload = await api('/veto/files', {
      method: 'POST',
      token: mpc.token,
      body: bytes,
      headers: {
        'Content-Type': 'text/plain',
        'X-File-Name': encodeURIComponent('local-readiness.txt'),
        'X-File-Title': encodeURIComponent('Local readiness'),
        'X-File-Type': encodeURIComponent('load-readiness'),
        'X-File-Size': String(bytes.byteLength),
        'X-File-Visibility': 'conference'
      },
      status: 201
    })
    await api(`/veto/files/${upload.file.id}/approve`, {
      method: 'POST',
      token: ipc.token,
      body: { note: 'Local readiness', visibility: 'conference' }
    })
    const download = await api(`/veto/files/${upload.file.id}/download`, {
      token: ipc.token,
      binary: true
    })
    assert.deepEqual(Buffer.from(download), bytes, 'R2 round-trip content')
    await api('/veto/files/notifications?after=0', { token: mpc.token })
    return {
      checks: [
        'WS ready / veto subprotocol / ping-pong / news invalidation',
        'committee projection / timeline resume-pause',
        'news submit-approve-list',
        'directive submit-claim-approve',
        'situation publish-list',
        'R2 upload-review-download byte equality / notifications'
      ],
      wsUrl: wsUrl.toString()
    }
  } finally {
    socket.close(1000, 'Local readiness complete')
  }
}
