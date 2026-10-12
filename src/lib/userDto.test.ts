import { describe, expect, it } from 'vitest'
import { assertNoSensitiveUserFields, toPublicUser } from './userDto'

describe('toPublicUser', () => {
  it('strips password and returns public fields', () => {
    const publicUser = toPublicUser({
      id: 1,
      email: 'a@example.com',
      password: '$2a$10$secretHash',
      username: 'alice',
      pfpUrl: null,
      bio: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    })

    expect(publicUser).toEqual({
      id: 1,
      email: 'a@example.com',
      username: 'alice',
      pfpUrl: null,
      bio: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    })
    expect(publicUser).not.toHaveProperty('password')
  })

  it('returns null for missing user', () => {
    expect(toPublicUser(null)).toBeNull()
    expect(toPublicUser(undefined)).toBeNull()
  })
})

describe('assertNoSensitiveUserFields', () => {
  it('flags password on nested payloads', () => {
    const violations = assertNoSensitiveUserFields({
      user: { id: 1, password: 'hash' },
      token: 'jwt',
    })
    expect(violations).toContain('root.user.password')
  })

  it('passes clean payloads', () => {
    expect(assertNoSensitiveUserFields({ id: 1, email: 'a@example.com' })).toEqual([])
  })
})
