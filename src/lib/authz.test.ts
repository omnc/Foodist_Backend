import { describe, expect, it } from 'vitest'
import { getAuthUserId, requireSelf } from './authz'

describe('requireSelf', () => {
  it('rejects missing auth', () => {
    expect(requireSelf(null, 1)).toEqual({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    })
  })

  it('rejects cross-account target ids', () => {
    expect(requireSelf({ id: 1 }, 2)).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: cannot modify another user',
    })
  })

  it('allows matching string/number ids', () => {
    expect(requireSelf({ id: '5' }, 5)).toEqual({ ok: true, userId: 5 })
    expect(requireSelf({ id: 5 }, '5')).toEqual({ ok: true, userId: 5 })
  })
})

describe('getAuthUserId', () => {
  it('parses valid ids and rejects garbage', () => {
    expect(getAuthUserId({ id: 3 })).toBe(3)
    expect(getAuthUserId({ id: '3' })).toBe(3)
    expect(getAuthUserId({ id: 'nope' })).toBeNull()
    expect(getAuthUserId(undefined)).toBeNull()
  })
})
