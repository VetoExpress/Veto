import { describe, expect, it } from 'vitest'
import { isLocale, resolveLocale } from './locale'
import { messages, translate } from './index'

describe('shared locale contract', () => {
  it('normalizes supported language preferences and falls back to Chinese', () => {
    expect(resolveLocale('en')).toBe('en-US')
    expect(resolveLocale('en-GB')).toBe('en-US')
    expect(resolveLocale('zh-cn')).toBe('zh-CN')
    expect(resolveLocale('fr-FR')).toBe('zh-CN')
    expect(resolveLocale(null)).toBe('zh-CN')
    expect(isLocale('en')).toBe(false)
    expect(isLocale('en-US')).toBe(true)
  })

  it('uses explicit locale without leaking language between callers', () => {
    expect(translate('common_language', {}, 'en-US')).toBe('Interface language')
    expect(translate('common_language', {}, 'zh-CN')).toBe('界面语言')
    expect(translate('common_language')).toBe('界面语言')
  })

  it('ships matching nonempty catalogs', () => {
    expect(Object.keys(messages['en-US']).sort()).toEqual(Object.keys(messages['zh-CN']).sort())
    for (const catalog of Object.values(messages)) {
      expect(Object.values(catalog).every((value) => value.trim().length > 0)).toBe(true)
    }
  })
})
