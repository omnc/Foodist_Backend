import { describe, expect, it } from 'vitest'
import {
  createCsrfToken,
  parseCookieHeader,
  timingSafeEqualString,
} from './session'

describe('session helpers', () => {
  it('parses cookie headers', () => {
    expect(parseCookieHeader('foodist_session=abc; foodist_csrf=xyz')).toEqual({
      foodist_session: 'abc',
      foodist_csrf: 'xyz',
    })
  })

  it('creates unpredictable CSRF tokens', () => {
    const a = createCsrfToken()
    const b = createCsrfToken()
    expect(a).toHaveLength(64)
    expect(a).not.toBe(b)
  })

  it('compares tokens in constant-ish time', () => {
    expect(timingSafeEqualString('abcd', 'abcd')).toBe(true)
    expect(timingSafeEqualString('abcd', 'abce')).toBe(false)
    expect(timingSafeEqualString('abcd', 'abc')).toBe(false)
  })
})
