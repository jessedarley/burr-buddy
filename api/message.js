import { getMessageRecordByToken } from './_lib/db.js'
import { getQueryParam, json } from './_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const token = `${getQueryParam(req, 'token') || ''}`.trim()
  if (!token) {
    return json(res, 400, { error: 'token is required.' })
  }

  const record = await getMessageRecordByToken(token)
  if (!record) {
    return json(res, 404, { error: 'Message not found.' })
  }

  return json(res, 200, {
    token: record.token,
    printShape: record.emoji,
    senderMessage: record.senderMessage,
    createdAt: record.createdAt,
    repliedAt: record.repliedAt,
  })
}
