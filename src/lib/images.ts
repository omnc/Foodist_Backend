export const IMAGE_ROUTE_PREFIX = '/images/'

export const ALLOWED_IMAGE_FOLDERS = ['recipes', 'description-blocks'] as const
export type ImageFolder = (typeof ALLOWED_IMAGE_FOLDERS)[number]

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Hosts that were written into D1 before images were served by the Worker.
 * They never resolved (invalid r2.dev host), so their keys are re-served via /images/.
 */
const LEGACY_IMAGE_BASES = ['https://pub-5834839887-foodist-images.r2.dev/']

const KEY_PATTERN = /^[A-Za-z0-9._-]+$/

export function isValidImageKey(key: string): boolean {
  if (!key || key.length > 512) return false
  const segments = key.split('/')
  if (segments.length !== 2) return false
  const [folder, file] = segments
  if (!(ALLOWED_IMAGE_FOLDERS as readonly string[]).includes(folder)) return false
  if (!KEY_PATTERN.test(file) || file.startsWith('.')) return false
  return true
}

/** Extract an R2 key from a stored value (bare key, /images/<key>, or a legacy r2.dev URL). */
export function imageKeyFromStored(value: string | null | undefined): string | null {
  if (!value) return null
  let candidate = value
  const legacy = LEGACY_IMAGE_BASES.find((base) => value.startsWith(base))
  if (legacy) {
    candidate = value.slice(legacy.length)
  } else if (value.startsWith(IMAGE_ROUTE_PREFIX)) {
    candidate = value.slice(IMAGE_ROUTE_PREFIX.length)
  } else if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (!url.pathname.startsWith(IMAGE_ROUTE_PREFIX)) return null
      candidate = url.pathname.slice(IMAGE_ROUTE_PREFIX.length)
    } catch {
      return null
    }
  }
  return isValidImageKey(candidate) ? candidate : null
}

/**
 * Public URL for a stored image value. `base` is the Worker origin (or PUBLIC_IMAGE_BASE
 * when images move to an R2 custom domain). Unrecognised external URLs pass through.
 */
export function resolveImageUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null
  const key = imageKeyFromStored(value)
  if (!key) return /^https?:\/\//i.test(value) ? value : null
  return `${base.replace(/\/+$/, '')}${IMAGE_ROUTE_PREFIX}${key}`
}

export function imageBaseFor(requestUrl: string, publicImageBase?: string): string {
  if (publicImageBase) return publicImageBase
  return new URL(requestUrl).origin
}

export function newImageKey(folder: ImageFolder, fileName: string): string {
  const rawExt = fileName.includes('.') ? fileName.split('.').pop() || '' : ''
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  return `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Image must be jpeg, png, webp, or gif'
  if (file.size > MAX_IMAGE_BYTES) return 'Image too large (max 5MB)'
  return null
}
