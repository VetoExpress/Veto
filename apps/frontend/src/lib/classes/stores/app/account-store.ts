import { writable } from 'svelte/store'
import type { AccountUpdate } from '@vetoexpress/auth'
import type { AccountResult, AccountSnapshot, DesktopAccountAPI } from '@vetoexpress/auth/desktop'

export interface AccountState extends AccountSnapshot {
  ready: boolean
  available: boolean
  pending: boolean
  error: string | null
}

export function createAccountStore() {
  const initial: AccountState = {
    user: null,
    persistent: false,
    warning: null,
    ready: false,
    available: false,
    pending: false,
    error: null
  }
  const state = writable<AccountState>(initial)
  let api: DesktopAccountAPI | undefined
  let generation = 0
  let revision = 0
  let pending = false

  const apply = (result: AccountResult) => {
    state.update((current) =>
      result.ok
        ? { ...current, ...result.session, ready: true, error: null }
        : { ...current, ready: true, error: result.error }
    )
  }

  async function perform(
    operation: (bridge: DesktopAccountAPI) => Promise<AccountResult>,
    reportFailure = false
  ) {
    if (!api || pending) {
      if (reportFailure)
        throw new Error(pending ? '账号操作进行中，请稍后重试。' : '桌面账号不可用。')
      return
    }
    const bridge = api
    const connection = generation
    pending = true
    state.update((current) => ({ ...current, pending: true, error: null }))
    try {
      const result = await operation(bridge)
      if (connection === generation) apply(result)
      if (!result.ok && reportFailure) throw new Error(result.error)
    } catch (error) {
      const message = error instanceof Error ? error.message : '账号操作失败，请重试。'
      if (connection === generation)
        state.update((current) => ({
          ...current,
          error: reportFailure ? message : '账号操作失败，请重试。'
        }))
      if (reportFailure) throw new Error(message)
    } finally {
      pending = false
      if (connection === generation) state.update((current) => ({ ...current, pending: false }))
    }
  }

  return {
    subscribe: state.subscribe,
    connect(bridge: DesktopAccountAPI | undefined) {
      api = bridge
      const connection = ++generation
      state.set({ ...initial, ready: !bridge, available: !!bridge })
      if (!bridge) return () => {}
      const unsubscribe = bridge.onChanged((session) => {
        if (connection !== generation) return
        revision++
        apply({ ok: true, session })
      })
      const requestedRevision = revision
      void bridge
        .getSession()
        .then((result) => {
          if (connection === generation && revision === requestedRevision) apply(result)
        })
        .catch(() => {
          if (connection === generation)
            state.update((current) => ({
              ...current,
              ready: true,
              error: '无法读取账号状态，请重试。'
            }))
        })
      return () => {
        if (connection === generation) {
          generation++
          api = undefined
        }
        unsubscribe()
      }
    },
    async run(action: 'login' | 'refresh' | 'signOut', email = '', password = '') {
      await perform((bridge) =>
        action === 'login' ? bridge.login(email, password) : bridge[action]()
      )
    },
    updateProfile: (update: AccountUpdate) =>
      perform((bridge) => bridge.updateProfile(update), true)
  }
}

export const accountStore = createAccountStore()
