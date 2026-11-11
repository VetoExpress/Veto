import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyLocale, getLocale, initializeLocale, setLocale, t } from './locale.svelte'
import { createTimer, destroyAllTimers } from '$lib/classes/services/timer/timer'

afterEach(() => {
  applyLocale('zh-CN')
  destroyAllTimers()
  vi.unstubAllGlobals()
})

describe('reactive locale', () => {
  it('updates derived translations without changing a running or paused timer', () => {
    const running = createTimer('locale-running')
    const paused = createTimer('locale-paused')
    running.start(60, () => {}, () => {}, 12)
    paused.start(60, () => {}, () => {}, 9)
    paused.pause()
    expect(t('common_language')).toBe('界面语言')
    const elapsed = running.elapsedSec
    const pausedElapsed = paused.elapsedSec
    applyLocale('en-US')
    expect(t('common_language')).toBe('Interface language')
    expect(running.isRunning).toBe(true)
    expect(running.elapsedSec).toBeGreaterThanOrEqual(elapsed)
    expect(running.elapsedSec).toBeLessThan(elapsed + 1)
    expect(paused.isRunning).toBe(false)
    expect(paused.elapsedSec).toBe(pausedElapsed)
  })

  it('does not let a late initial desktop snapshot override a user switch', async () => {
    let completeRead: ((locale: 'zh-CN' | 'en-US') => void) | undefined
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    })
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    vi.stubGlobal('document', { documentElement: { lang: '' } })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      veto: { i18n: {
        getLocale: () => new Promise<'zh-CN' | 'en-US'>((resolve) => { completeRead = resolve }),
        setLocale: vi.fn().mockResolvedValue(undefined),
        onLocaleChanged: () => vi.fn()
      } }
    })
    const stop = initializeLocale()
    await setLocale('en-US')
    completeRead?.('zh-CN')
    await Promise.resolve()
    expect(getLocale()).toBe('en-US')
    expect(stored.get('veto-locale')).toBe('en-US')
    stop()
  })
})
