/** Parse a positive integer path/body id; anything else (NaN, 0, "abc", "1.5") yields null. */
export function parseId(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null
  const id = Number(raw.trim())
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Read a JSON object body; missing, invalid, null, or non-object bodies yield {}. */
export async function readJsonObject(req: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Read multipart/urlencoded form data; returns null when the body is not form data. */
export async function readFormData(req: { formData(): Promise<FormData> }): Promise<FormData | null> {
  try {
    return await req.formData()
  } catch {
    return null
  }
}
