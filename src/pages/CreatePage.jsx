import { useMemo, useState } from 'react'
import { downloadTokenPlaqueStl } from '../lib/stl'

const EMOJI_OPTIONS = [
  '\u{1F32F}',
  '\u2764\uFE0F',
  '\u{1F525}',
  '\u2728',
  '\u{1F389}',
  '\u{1F32E}',
  '\u{1F340}',
  '\u{1F308}',
  '\u{1F4AB}',
]

function getBaseUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function CreatePage() {
  const [formData, setFormData] = useState({
    senderMessage: '',
    emoji: EMOJI_OPTIONS[0],
    senderEmail: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdToken, setCreatedToken] = useState('')

  const shareUrl = useMemo(() => {
    if (!createdToken) return ''
    return `${getBaseUrl()}/r/${createdToken}`
  }, [createdToken])

  const typeableUrl = useMemo(() => {
    if (!createdToken || typeof window === 'undefined') return ''
    return `${window.location.host}/r/${createdToken}`
  }, [createdToken])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create message link.')
      }

      setCreatedToken(payload.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (createdToken) {
    return (
      <main className="page">
        <div className="container panel">
          <h1>Share Link Created</h1>
          <p className="subtle">
            Send this URL to the receiver and keep the token plaque for the physical flow.
          </p>
          <p className="meta">Unique URL:</p>
          <p className="token-url">{shareUrl}</p>
          <p className="meta">Short type-in URL:</p>
          <p className="token-url">{typeableUrl}</p>
          <p className="meta">Typeable token code:</p>
          <p className="token-url">{createdToken}</p>
          <p className="subtle">
            Typing note: suffix uses an ambiguity-safe alphabet (no 0/O or 1/l).
          </p>
          <div className="row">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl)
              }}
            >
              Copy Link
            </button>
            <button type="button" onClick={() => downloadTokenPlaqueStl(createdToken)}>
              Download STL
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatedToken('')
                setFormData({ senderMessage: '', emoji: EMOJI_OPTIONS[0], senderEmail: '' })
              }}
            >
              Create Another
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container panel">
        <h1>Create Burr Buddy Link</h1>
        <p className="subtle">
          Enter your message, pick an emoji, and submit to generate a unique receiver URL.
        </p>

        {error ? <div className="message error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="senderMessage">Message</label>
            <textarea
              id="senderMessage"
              value={formData.senderMessage}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, senderMessage: event.target.value }))
              }
              required
            />
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="emoji">Emoji</label>
              <select
                id="emoji"
                value={formData.emoji}
                onChange={(event) => setFormData((prev) => ({ ...prev, emoji: event.target.value }))}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <option key={emoji} value={emoji}>
                    {emoji}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="senderEmail">Sender Email</label>
              <input
                id="senderEmail"
                type="email"
                value={formData.senderEmail}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, senderEmail: event.target.value }))
                }
                required
              />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Link'}
          </button>
        </form>
      </div>
    </main>
  )
}
