import { describe, expect, it } from 'vitest'
import { parseId, readFormData, readJsonObject } from './http'

describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('42')).toBe(42)
    expect(parseId(' 7 ')).toBe(7)
    expect(parseId(3)).toBe(3)
    for (const bad of ['0', '-1', '1.5', 'abc', 'undefined', 'NaN', '', '12abc', undefined, null, 0, 2.5]) {
      expect(parseId(bad)).toBeNull()
    }
  })
})

describe('readJsonObject', () => {
  const req = (body: string) => new Request('http://x', { method: 'POST', body })

  it('returns the parsed object', async () => {
    expect(await readJsonObject(req('{"note":"hi"}'))).toEqual({ note: 'hi' })
  })

  it('falls back to {} for null, arrays, invalid, or empty bodies', async () => {
    expect(await readJsonObject(req('null'))).toEqual({})
    expect(await readJsonObject(req('[1]'))).toEqual({})
    expect(await readJsonObject(req('{bad'))).toEqual({})
    expect(await readJsonObject(new Request('http://x', { method: 'POST' }))).toEqual({})
  })
})

describe('readFormData', () => {
  it('returns null when the body is not form data', async () => {
    expect(await readFormData(new Request('http://x', { method: 'POST', body: 'x' }))).toBeNull()
  })
})
