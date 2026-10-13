import { describe, expect, it } from 'vitest'
import { imageBaseFor, imageKeyFromStored, isValidImageKey, newImageKey, resolveImageUrl } from './images'

const KEY = 'recipes/1791900673217-2d19e1a8-3a1e-4596-afb7-770fbc7eed1e.jpeg'
const WORKER = 'https://foodist_backend.omnc2019.workers.dev'

describe('image keys', () => {
  it('accepts generated keys in allowed folders only', () => {
    expect(isValidImageKey(KEY)).toBe(true)
    expect(isValidImageKey(newImageKey('description-blocks', 'Step 1.PNG'))).toBe(true)
    expect(isValidImageKey('avatars/a.png')).toBe(false)
    expect(isValidImageKey('recipes/../secret.png')).toBe(false)
    expect(isValidImageKey('recipes/.hidden')).toBe(false)
    expect(isValidImageKey('recipes/a/b.png')).toBe(false)
    expect(isValidImageKey('')).toBe(false)
  })

  it('sanitises the extension of new keys', () => {
    expect(newImageKey('recipes', 'photo.JPG')).toMatch(/^recipes\/\d+-[0-9a-f-]+\.jpg$/)
    expect(newImageKey('recipes', 'noext')).toMatch(/\.bin$/)
  })
})

describe('stored image values', () => {
  it('extracts keys from legacy r2.dev URLs, /images/ paths, worker URLs, and bare keys', () => {
    expect(imageKeyFromStored(`https://pub-5834839887-foodist-images.r2.dev/${KEY}`)).toBe(KEY)
    expect(imageKeyFromStored(`/images/${KEY}`)).toBe(KEY)
    expect(imageKeyFromStored(`${WORKER}/images/${KEY}`)).toBe(KEY)
    expect(imageKeyFromStored(KEY)).toBe(KEY)
    expect(imageKeyFromStored('https://images.example.com/x.png')).toBeNull()
    expect(imageKeyFromStored(null)).toBeNull()
  })

  it('resolves legacy and key values to the worker image route', () => {
    expect(resolveImageUrl(`https://pub-5834839887-foodist-images.r2.dev/${KEY}`, WORKER)).toBe(`${WORKER}/images/${KEY}`)
    expect(resolveImageUrl(KEY, `${WORKER}/`)).toBe(`${WORKER}/images/${KEY}`)
    expect(resolveImageUrl('https://images.example.com/x.png', WORKER)).toBe('https://images.example.com/x.png')
    expect(resolveImageUrl('not a key', WORKER)).toBeNull()
    expect(resolveImageUrl(null, WORKER)).toBeNull()
  })

  it('uses PUBLIC_IMAGE_BASE when configured, else the request origin', () => {
    expect(imageBaseFor(`${WORKER}/recipes/1`)).toBe(WORKER)
    expect(imageBaseFor(`${WORKER}/recipes/1`, 'https://img.foodist.example')).toBe('https://img.foodist.example')
  })
})
