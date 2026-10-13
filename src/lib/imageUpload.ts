import { newImageKey, type ImageFolder } from './images'

/** Store an image in R2 and return its object key (not a URL; URLs are resolved on read). */
export async function uploadImage(
  file: File,
  bucket: R2Bucket,
  folder: ImageFolder
): Promise<string> {
  const key = newImageKey(folder, file.name)
  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  return key
}

/** Best-effort removal of R2 objects; never throws. */
export async function deleteImages(bucket: R2Bucket, keys: Array<string | null | undefined>): Promise<void> {
  const valid = keys.filter((k): k is string => !!k)
  if (valid.length === 0) return
  try {
    await bucket.delete(valid)
  } catch (err) {
    console.error('R2 cleanup failed', err)
  }
}
