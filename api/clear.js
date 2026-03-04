import { clearReplies, getMessageRecordByToken } from './_lib/db.js'
import { json, readJsonBody } from './_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = await readJsonBody(req)
    const token = `${body.token || ''}`.trim()

    if (!token) {
      return json(res, 400, { error: 'token is required.' })
    }

    const record = await getMessageRecordByToken(token)
    if (!record) {
      return json(res, 404, { error: 'Message not found.' })
    }

    const changes = await clearReplies(token)
    if (changes === 0) {
      return json(res, 404, { error: 'Message not found.' })
    }

    return json(res, 200, { ok: true })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Internal server error.' })
  }
}
