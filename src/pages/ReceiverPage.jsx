import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BrandHeader } from '../components/BrandHeader'

export function ReceiverPage() {
  const { token } = useParams()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageData, setMessageData] = useState(null)
  const [reply, setReply] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitState, setSubmitState] = useState('')
  const [replyHistory, setReplyHistory] = useState([])
  const combinedMessages = [
    messageData?.senderMessage?.trim() || '',
    ...replyHistory,
  ]
    .filter(Boolean)
    .join('\n')

  useEffect(() => {
    let mounted = true

    async function loadMessage() {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/message?token=${encodeURIComponent(token)}`)
        const responseText = await response.text()
        let payload = {}
        try {
          payload = responseText ? JSON.parse(responseText) : {}
        } catch {
          payload = {}
        }
        if (!response.ok) {
          throw new Error(payload.error || `Unable to load this message (HTTP ${response.status}).`)
        }
        if (mounted) {
          setMessageData(payload)
          const existingReplies = `${payload.receiverReply || ''}`
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
          setReplyHistory(existingReplies)
        }
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
      const responseText = await response.text()
      let payload = {}
      try {
        payload = responseText ? JSON.parse(responseText) : {}
      } catch {
        payload = {}
      }
      if (!response.ok) {
        throw new Error(payload.error || `Could not submit reply (HTTP ${response.status}).`)
      }
      setSubmitState('Reply sent.')
      setReplyHistory((prev) => [...prev, reply.trim()])
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
        <BrandHeader />
        <section className="hero">
          <h1 className="hero-title">Your Secret Message (Shh!)</h1>
          <p className="hero-lead">Read your note below, then leave a reply for the sender.</p>
        </section>

        {isLoading ? <p className="status">Loading...</p> : null}
        {error ? <div className="message error">{error}</div> : null}

        {messageData ? (
          <>
            <section className="section-card">
              <h2 className="section-title">Messages</h2>
              <div className="sender-message">{combinedMessages}</div>
            </section>

            <section className="section-card">
              <h2 className="section-title">Add a message</h2>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <textarea
                    id="reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending Reply...' : 'Send Reply'}
                </button>
              </form>
            </section>
            {submitState ? <div className="message success">Reply delivered. You are all set.</div> : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
