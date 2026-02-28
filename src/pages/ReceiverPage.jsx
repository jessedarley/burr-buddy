import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

export function ReceiverPage() {
  const { token } = useParams()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageData, setMessageData] = useState(null)
  const [reply, setReply] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitState, setSubmitState] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadMessage() {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/message?token=${encodeURIComponent(token)}`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load this message.')
        }
        if (mounted) setMessageData(payload)
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    if (token) {
      loadMessage()
    } else {
      setIsLoading(false)
      setError('Missing token.')
    }

    return () => {
      mounted = false
    }
  }, [token])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitState('')
    setError('')
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reply }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not submit reply.')
      }
      setSubmitState('Reply sent.')
      setReply('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page">
      <div className="container panel">
        <h1>Open Burr Buddy Message</h1>
        {isLoading ? <p>Loading...</p> : null}
        {error ? <div className="message error">{error}</div> : null}

        {messageData ? (
          <>
            <p className="emoji-view">{messageData.emoji}</p>
            <div className="sender-message">{messageData.senderMessage}</div>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="reply">Your Reply</label>
                <textarea
                  id="reply"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Reply'}
              </button>
            </form>
            {submitState ? <div className="message success">{submitState}</div> : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
