import { Hono } from 'hono'
import { isValidImageKey } from '../lib/images'

type Bindings = {
  IMAGES: R2Bucket
}

const imageController = new Hono<{ Bindings: Bindings }>()

// Serves R2 objects written by uploadImage. Keys are immutable (timestamp + UUID), so cache forever.
imageController.get('/*', async (c) => {
  let key: string
  try {
    key = decodeURIComponent(c.req.path.replace(/^\/images\//, ''))
  } catch {
    return c.json({ error: 'Invalid image key' }, 400)
  }
  if (!isValidImageKey(key)) {
    return c.json({ error: 'Invalid image key' }, 400)
  }

  const object = await c.env.IMAGES.get(key)
  if (!object) {
    return c.json({ error: 'Image not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  if (c.req.header('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
})

export default imageController
