import { describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

describe('Prisma / adapter-d1 version alignment', () => {
  it('pins prisma, client, and adapter-d1 to exact 7.10.0', () => {
    expect(pkg.dependencies['@prisma/client']).toBe('7.10.0')
    expect(pkg.dependencies['@prisma/adapter-d1']).toBe('7.10.0')
    expect(pkg.devDependencies.prisma).toBe('7.10.0')
  })
})
