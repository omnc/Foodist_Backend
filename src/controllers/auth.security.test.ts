/**
 * Security regression tests for auth authorization helpers used by the controller.
 * Full D1/Worker integration tests require local bindings; these lock the P0 rules.
 */
import { describe, expect, it } from 'vitest'
import { requireSelf } from '../lib/authz'
import { assertNoSensitiveUserFields, toPublicUser } from '../lib/userDto'

describe('P0.1 password-change authorization model', () => {
  it('never treats email alone as authorization (self check requires JWT id)', () => {
    // Simulates: attacker knows victim email but has no JWT / wrong JWT subject
    const attacker = { id: 2, email: 'attacker@example.com' }
    const victimId = 1
    expect(requireSelf(attacker, victimId).ok).toBe(false)
    expect(requireSelf(undefined, victimId).ok).toBe(false)
  })
})

describe('P0.2 IDOR prevention on user update/delete', () => {
  it('User A cannot target User B by path id', () => {
    const result = requireSelf({ id: 10 }, 99)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it('User A can target self', () => {
    expect(requireSelf({ id: 10 }, 10)).toEqual({ ok: true, userId: 10 })
  })
})

describe('P0.3 password hash never in public user DTO', () => {
  it('register/login-shaped payloads exclude password', () => {
    const dto = toPublicUser({
      id: 1,
      email: 'u@example.com',
      password: 'HASH',
      username: null,
      pfpUrl: null,
      bio: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(dto).not.toBeNull()
    expect(assertNoSensitiveUserFields(dto)).toEqual([])
    expect(assertNoSensitiveUserFields({ user: dto, token: 'x' })).toEqual([])
  })
})
