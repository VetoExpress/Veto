import { sha256 } from 'k6/crypto'
import { RequestError } from '../lib/cloud-api.ts'
import { delay, marker, markerTime, verificationFileType } from '../lib/model.ts'
import * as metrics from '../lib/metrics.ts'
import type { SeatSession } from '../lib/seat-session.ts'
import type { Content, SeatCredential } from '../lib/types.ts'

function content(result: Record<string, unknown>, field: string): Content {
  const item = result[field] as Content | undefined
  if (!item || typeof item.id !== 'string') {
    metrics.recordError(`${field}.write`, 'invalid_response')
    throw new Error('INVALID_WRITE_RESPONSE')
  }
  return item
}

export async function reviewPending(session: SeatSession): Promise<void> {
  const ownRun = (item: Content) => markerTime(item, session.runId) !== null
  const review = async (root: string, key: string, capability: string) => {
    if (!session.can(capability)) return
    const items = await session.list(`${root}/workflow`, key, `${key}.workflow`)
    for (const item of items.filter(ownRun).slice(0, 10)) {
      try {
        if (key === 'directives') {
          if (item.status === 'submitted') {
            content(
              await session.api.json(
                'POST',
                `${root}/${encodeURIComponent(item.id)}/claim`,
                'directive.claim',
                {},
                {},
                true
              ),
              'directive'
            )
          } else if (!item.claimedByMe) continue
        } else if (item.status !== 'submitted') continue
        const field = key === 'files' ? 'file' : key === 'news' ? 'news' : 'directive'
        const updated = content(
          await session.api.json(
            'POST',
            `${root}/${encodeURIComponent(item.id)}/approve`,
            `${field}.approve`,
            { note: 'Veto load test' },
            {},
            true
          ),
          field
        )
        if (updated.status !== (key === 'directives' ? 'approved' : 'published')) {
          metrics.recordError(`${field}.approve`, 'unexpected_status')
          throw new Error('UNEXPECTED_STATUS')
        }
        metrics.operations.add(1, { operation: `${field}.approve` })
      } catch (error) {
        if (!(error instanceof RequestError && error.expectedConflict)) throw error
        // Competing reviewers are expected; the winner's result is checked by the author.
        console.warn(
          JSON.stringify({
            operation: `${key}.review`,
            kind: 'state_conflict',
            status: 409,
            impact: 'another_reviewer_won'
          })
        )
      }
    }
  }
  await Promise.all([
    review('/veto/files', 'files', 'review_files'),
    review('/veto/news', 'news', 'review_news'),
    review('/veto/directives', 'directives', 'process_directive')
  ])
}

/** Actual bytes are retained once per VU/size; sizes and concurrency are bounded by the runner. */
export function filePayload(size: number): ArrayBuffer {
  const data = new Uint8Array(size)
  // Non-zero deterministic binary content; verification uses SHA-256, not the Content-Length header.
  for (let index = 0; index < size; index++) data[index] = (index * 31 + 17) % 251
  return data.buffer
}

export interface UploadRecord {
  id: string
  hash: string
  started: number
  title: string
  size: number
  fileType: string
}
export async function uploadFiles(session: SeatSession, vu: number): Promise<UploadRecord[]> {
  if (!session.can('send_files')) {
    metrics.recordError('file.upload', 'capability_required')
    return []
  }
  const payloads = session.config.fileSizesBytes.map((size) => {
    const body = filePayload(size)
    return { body, hash: sha256(body, 'hex') }
  })
  const records: UploadRecord[] = []
  const ids = new Set<string>()
  let next = 0
  await Promise.all(
    Array.from({ length: session.config.uploadConcurrency }, async () => {
      while (next < session.config.filesPerVu && session.active) {
        const sequence = next++
        const payload = payloads[sequence % payloads.length]
        const started = Date.now()
        try {
          const title = marker(session.runId, vu, sequence, started)
          // The API caps lists at 200; real file-type filtering keeps verification groups <=100.
          const fileType = verificationFileType(
            session.config.fileType,
            sha256(session.runId, 'hex'),
            vu,
            sequence
          )
          const item = await session.api.upload(payload.body, title, fileType)
          if (
            ids.has(item.id) ||
            item.sourceSeatId !== session.auth.identity.seatId ||
            item.sourceCommitteeId !== session.auth.identity.committeeId
          ) {
            metrics.recordError('file.upload', 'duplicate_or_wrong_origin')
            throw new Error('INVALID_UPLOAD_IDENTITY')
          }
          ids.add(item.id)
          metrics.uploadOK.add(true)
          metrics.uploaded.add(1)
          metrics.uploadBytes.add(payload.body.byteLength)
          records.push({
            id: item.id,
            hash: payload.hash,
            started,
            title,
            size: payload.body.byteLength,
            fileType
          })
        } catch {
          metrics.uploadOK.add(false)
          // Uploads have no idempotency contract. Never blindly retry an uncertain write.
          console.warn(
            JSON.stringify({
              operation: 'file.upload',
              kind: 'not_retried',
              impact: 'verify_server_records'
            })
          )
        } finally {
          metrics.uploadMs.add(Date.now() - started)
        }
      }
    })
  )
  return records
}

export async function verifyFiles(session: SeatSession, records: UploadRecord[]): Promise<void> {
  for (const record of records) {
    const query = `?fileType=${encodeURIComponent(record.fileType)}`
    const mine = await session.waitVisible(
      `/veto/files/mine${query}`,
      'files',
      record.id,
      record.started
    )
    if (!mine) {
      metrics.downloadOK.add(false)
      // Missing expected records already fail the batch; avoid N independent timeout windows.
      break
    }
    if (
      mine &&
      (mine.title !== record.title ||
        mine.size !== record.size ||
        mine.sourceSeatId !== session.auth.identity.seatId)
    ) {
      metrics.recordError('file.verify', 'record_mismatch')
    }
    if (!session.can('view_files')) {
      metrics.downloadOK.add(false)
      metrics.recordError('file.download', 'view_files_required')
      continue
    }
    const published = await session.waitVisible(
      `/veto/files${query}`,
      'files',
      record.id,
      record.started,
      'published'
    )
    if (!published) {
      metrics.downloadOK.add(false)
      break
    }
    let valid = false
    try {
      valid = await session.api.download(record.id, record.hash)
    } catch {
      /* The HTTP layer logs the failure without exposing the token. */
    }
    metrics.downloadOK.add(valid)
    if (valid) metrics.downloaded.add(1)
    else metrics.recordError('file.download', 'integrity_failed')
  }
}

export async function submitMixed(
  session: SeatSession,
  credential: SeatCredential,
  vu: number,
  sequence: number
): Promise<void> {
  const started = Date.now()
  const title = marker(session.runId, vu, sequence, started)
  const jobs: Promise<unknown>[] = []
  if (session.can('submit_directive'))
    jobs.push(
      (async () => {
        const targets = await session.api.json(
          'GET',
          '/veto/directives/targets',
          'directives.targets'
        )
        const available = targets.targets as Array<{ id: string }> | undefined
        const target =
          credential.targetCommitteeId ??
          available?.find((item) => item.id !== session.auth.identity.committeeId)?.id
        if (!target || !available?.some((item) => item.id === target)) {
          metrics.recordError('directive.submit', 'target_required')
          return
        }
        const item = content(
          await session.api.json(
            'POST',
            '/veto/directives',
            'directive.submit',
            {
              title,
              content: title,
              targetCommitteeId: target
            },
            { 'Idempotency-Key': `${session.runId}-${vu}-${sequence}-directive` }
          ),
          'directive'
        )
        metrics.operations.add(1, { operation: 'directive.submit' })
        await session.waitVisible(
          '/veto/directives/mine',
          'directives',
          item.id,
          started,
          'approved'
        )
      })()
    )
  if (session.can('draft_news'))
    jobs.push(
      (async () => {
        const item = content(
          await session.api.json(
            'POST',
            '/veto/news',
            'news.submit',
            {
              title,
              content: title,
              source: 'Veto load test',
              contentTime: Date.now()
            },
            { 'Idempotency-Key': `${session.runId}-${vu}-${sequence}-news` }
          ),
          'news'
        )
        metrics.operations.add(1, { operation: 'news.submit' })
        await session.waitVisible('/veto/news/mine', 'news', item.id, started, 'published')
      })()
    )
  if (session.can('publish_situation'))
    jobs.push(
      (async () => {
        const item = content(
          await session.api.json('POST', '/veto/situations', 'situation.publish', {
            content: title,
            contentTime: Date.now()
          }),
          'situation'
        )
        metrics.operations.add(1, { operation: 'situation.publish' })
        await session.waitVisible('/veto/situations', 'situations', item.id, started, 'published')
      })()
    )
  const results = await Promise.allSettled(jobs)
  if (results.some((result) => result.status === 'rejected'))
    metrics.recordError('mixed.write', 'workflow_failed')
}

export async function reviewerLoop(session: SeatSession, isRunning: () => boolean): Promise<void> {
  while (session.active && isRunning()) {
    try {
      await reviewPending(session)
    } catch {
      metrics.recordError('workflow.review', 'review_failed')
    }
    await delay(session.config.actionIntervalSeconds * 1000)
  }
}
