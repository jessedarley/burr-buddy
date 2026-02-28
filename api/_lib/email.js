async function sendWithResend({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  const from = process.env.EMAIL_FROM || 'Burr Buddy <no-reply@example.com>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend failed: ${body}`)
  }
  return true
}

async function sendWithSendGrid({ to, subject, text }) {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return false

  const fromEmail = process.env.EMAIL_FROM || 'no-reply@example.com'
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`SendGrid failed: ${body}`)
  }
  return true
}

export async function sendReplyEmail({ to, token, emoji, senderMessage, receiverReply }) {
  const subject = `Burr Buddy reply for token ${token}`
  const text = [
    'You received a new Burr Buddy reply.',
    '',
    `Token: ${token}`,
    `Emoji: ${emoji}`,
    '',
    'Original message:',
    senderMessage,
    '',
    'Reply:',
    receiverReply,
  ].join('\n')

  const sentByResend = await sendWithResend({ to, subject, text })
  if (sentByResend) return

  const sentBySendGrid = await sendWithSendGrid({ to, subject, text })
  if (sentBySendGrid) return

  throw new Error('No email provider configured. Set RESEND_API_KEY or SENDGRID_API_KEY.')
}
