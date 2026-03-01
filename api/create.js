import { getMessageRecordByToken, insertMessageRecord } from './_lib/db.js'
import { json, readJsonBody } from './_lib/http.js'
import { isValidPrintShape } from './_lib/printShapes.js'
import { generateFriendlyToken } from './_lib/token.js'

async function generateUniqueToken() {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const token = generateFriendlyToken()
    const existing = await getMessageRecordByToken(token)
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
    const printShape = `${body.printShape || body.emoji || ''}`.trim().toLowerCase()

    if (!senderMessage) {
      return json(res, 400, { error: 'senderMessage is required.' })
    }
    if (!printShape || !isValidPrintShape(printShape)) {
      return json(res, 400, { error: 'A valid printShape is required.' })
    }

    const token = await generateUniqueToken()
    const createdAt = new Date().toISOString()

    await insertMessageRecord({
      token,
      senderEmail,
      senderMessage,
      emoji: printShape,
      createdAt,
    })

    return json(res, 200, { token, printShape })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Internal server error.' })
  }
}
