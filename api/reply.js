import { getMessageRecordByToken, markReply } from './_lib/db.js'
import { json, readJsonBody } from './_lib/http.js'
import { sendReplyEmail } from './_lib/email.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = await readJsonBody(req)
    const token = `${body.token || ''}`.trim()
    const reply = `${body.reply || ''}`.trim()

    if (!token) {
      return json(res, 400, { error: 'token is required.' })
    }
    if (!reply) {
      return json(res, 400, { error: 'reply is required.' })
    }

    const record = await getMessageRecordByToken(token)
    if (!record) {
      return json(res, 404, { error: 'Message not found.' })
    }
    if (record.receiverReply) {
      return json(res, 409, { error: 'A reply has already been submitted for this token.' })
    }

    const repliedAt = new Date().toISOString()
    const changes = await markReply(token, reply, repliedAt)
    if (changes === 0) {
      return json(res, 409, { error: 'A reply has already been submitted for this token.' })
    }

    let emailStatus = 'skipped'
    if (record.senderEmail) {
      try {
        await sendReplyEmail({
          to: record.senderEmail,
          token: record.token,
          printShape: record.emoji,
          senderMessage: record.senderMessage,
          receiverReply: reply,
        })
        emailStatus = 'sent'
      } catch {
        emailStatus = 'failed'
      }
    }

    return json(res, 200, { ok: true, repliedAt, emailStatus })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Internal server error.' })
  }
}
