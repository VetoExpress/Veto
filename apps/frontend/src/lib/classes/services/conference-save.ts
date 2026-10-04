import { writable } from 'svelte/store'

export interface SaveStatus {
  state: 'loading' | 'pending' | 'saving' | 'saved' | 'error'
  savedAt?: number
  error?: string
}

/** Serialize writes so a slower earlier save can never overwrite the latest one. */
export function createConferenceSaver(write: (data: unknown) => Promise<void>) {
  const status = writable<SaveStatus>({ state: 'loading' })
  let queue = Promise.resolve()
  let revision = 0
  let savedAt: number | undefined
  return {
    status,
    pending() { revision++; status.set({ state: 'pending', savedAt }) },
    fail(error: unknown) { status.set({ state: 'error', savedAt, error: error instanceof Error ? error.message : '保存失败' }) },
    save(data: unknown): Promise<boolean> {
      const version = ++revision
      // Capture at request time; live objects must not drift while queued.
      let copy: unknown
      try { copy = JSON.parse(JSON.stringify(data)) } catch (error) {
        this.fail(error); return Promise.resolve(false)
      }
      status.set({ state: 'saving', savedAt })
      let success = false
      queue = queue.then(async () => {
        try {
          await write(copy)
          savedAt = Date.now()
          success = true
          if (version === revision) status.set({ state: 'saved', savedAt })
        } catch (error) {
          if (version === revision) this.fail(error)
        }
      })
      return queue.then(() => success)
    },
  }
}
