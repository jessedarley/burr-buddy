import { getMessageRecordByToken, insertMessageRecord } from './_lib/db.js'
import { json, readJsonBody } from './_lib/http.js'
import { generateFriendlyToken } from './_lib/token.js'

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function generateUniqueToken() {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const token = generateFriendlyToken()
    const existing = getMessageRecordByToken(token)
    if (!existing) return token
  }
  throw new Error('Could not generate a unique token.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = await readJsonBody(req)
    const senderMessage = `${body.senderMessage || ''}`.trim()
    const senderEmail = `${body.senderEmail || ''}`.trim()
    const emoji = `${body.emoji || ''}`.trim()

    if (!senderMessage) {
      return json(res, 400, { error: 'senderMessage is required.' })
    }
    if (!senderEmail || !isValidEmail(senderEmail)) {
      return json(res, 400, { error: 'A valid senderEmail is required.' })
    }
    if (!emoji) {
      return json(res, 400, { error: 'emoji is required.' })
    }

    const token = await generateUniqueToken()
    const createdAt = new Date().toISOString()

    insertMessageRecord({
      token,
      senderEmail,
      senderMessage,
      emoji,
      createdAt,
    })

    return json(res, 200, { token })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Internal server error.' })
  }
}
