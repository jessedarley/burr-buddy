import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BrandHeader } from '../components/BrandHeader'
import { PRINT_SHAPE_OPTIONS } from '../lib/printShapes'
import larksHeadDiagram from '../assets/larks-head-diagram.svg'

const StlViewer = lazy(() =>
  import('../components/StlViewer').then((module) => ({ default: module.StlViewer })),
)

function getReceiverBaseUrl() {
  const configured = `${import.meta.env.VITE_QR_BASE_URL || ''}`.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return 'https://burr-buddy.vercel.app'
}

export function CreatePage() {
  const [formData, setFormData] = useState({
    senderMessage: '',
    printShape: PRINT_SHAPE_OPTIONS[0].value,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdToken, setCreatedToken] = useState('')
  const [createdShape, setCreatedShape] = useState(PRINT_SHAPE_OPTIONS[0].value)
  const [printSizeText, setPrintSizeText] = useState('')
  const [isStlReady, setIsStlReady] = useState(false)

  const shareUrl = useMemo(() => {
    if (!createdToken) return ''
    return `${getReceiverBaseUrl()}/r/${createdToken}`
  }, [createdToken])

  const qrPayloadUrl = useMemo(() => {
    if (!createdToken) return ''
    const base = getReceiverBaseUrl()
    return `${base}/r/${createdToken}`
  }, [createdToken])

  const typeableUrl = useMemo(() => {
    if (!createdToken) return ''
    return `${getReceiverBaseUrl().replace(/^https?:\/\//, '')}/r/${createdToken}`
  }, [createdToken])

  useEffect(() => {
    let mounted = true
    if (!createdToken) return undefined

    ;(async () => {
      try {
        const { getPrintSizeInches } = await import('../lib/stl')
        const size = getPrintSizeInches(createdShape)
        if (mounted) {
          setPrintSizeText(`${size.widthIn}" W x ${size.heightIn}" H x ${size.thicknessIn}" T`)
        }
      } catch {
        if (mounted) {
          setPrintSizeText('2.00" W x 2.00" H x 0.125" T')
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [createdShape, createdToken])

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
      const responseText = await response.text()
      let payload = {}
      try {
        payload = responseText ? JSON.parse(responseText) : {}
      } catch {
        payload = {}
      }

      if (!response.ok) {
        throw new Error(
          payload.error || `Failed to create message link (HTTP ${response.status}).`,
        )
      }

      setCreatedToken(payload.token)
      setCreatedShape(payload.printShape || formData.printShape)
      setPrintSizeText('')
      setIsStlReady(false)
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
          <BrandHeader />
          <section className="hero">
            <h1 className="hero-title">
              {isStlReady ? 'Your Burr Buddy is ready' : 'We are making your STL file'}
            </h1>
            <p className="hero-lead">
              Confirm the shape and download the STL for 3D printing.
            </p>
          </section>

          <section className="section-card">
            <h2 className="section-title">Preview and Download STL</h2>
            <div className="field">
              <label htmlFor="previewShape">3D Print Shape</label>
              <select
                id="previewShape"
                value={createdShape}
                onChange={(event) => setCreatedShape(event.target.value)}
              >
                {PRINT_SHAPE_OPTIONS.map((shape) => (
                  <option key={shape.value} value={shape.value}>
                    {shape.label}
                  </option>
                ))}
              </select>
            </div>
            <Suspense fallback={<p className="status">Loading STL preview...</p>}>
              <StlViewer
                token={createdToken}
                printShape={createdShape}
                qrPayload={qrPayloadUrl}
                onReady={() => setIsStlReady(true)}
              />
            </Suspense>
            <p className="note">Drag to rotate and scroll to zoom.</p>
          </section>

          <div className="action-row">
            <div className="action-item">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl)
                }}
              >
                Copy Receiver URL
              </button>
              <p className="action-note">{typeableUrl}</p>
            </div>
            <div className="action-item">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!isStlReady}
                onClick={async () => {
                  if (!isStlReady) return
                  const { downloadTokenPlaqueStl } = await import('../lib/stl')
                  downloadTokenPlaqueStl(createdToken, createdShape, qrPayloadUrl)
                }}
              >
                {isStlReady ? 'Download STL for Print' : 'Working...'}
              </button>
              <p className="action-note">Print size: {printSizeText || 'Calculating...'}</p>
            </div>
            <div className="action-item">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCreatedToken('')
                  setCreatedShape(PRINT_SHAPE_OPTIONS[0].value)
                  setPrintSizeText('')
                  setIsStlReady(false)
                  setFormData({
                    senderMessage: '',
                    printShape: PRINT_SHAPE_OPTIONS[0].value,
                  })
                }}
              >
                Start New Message
              </button>
            </div>
          </div>

          <section id="about" className="section-card about-card">
            <h2 className="section-title">About</h2>
            <p className="about-text">
              Burr Buddy is a way to deliver a secret message. You write a message, choose a
              shape, and generate a printable tag with a QR code. After printing, you quietly clip
              it to someone&apos;s bag or clothes, or slip it into their locker or pocket without
              them knowing. They find it, scan the code, read the secret message, and then respond
              to the message in the app.
            </p>
            <p className="about-text">
              The goal is to make digital communication feel personal again: less feed, more surprise.
              A tiny print, a hidden message, and a private moment between two people.
            </p>
            <p className="about-text">
              The name Burr Buddy refers to having burrs attach to your clothes when you walk through
              the woods. This is a quiet passenger.
            </p>
            <p className="about-text">
              To wear or gift it, loop a small rubber band through the hole in the tag, then girth
              hitch the rubber band onto a safety pin or a small binder clip.
            </p>
            <figure className="about-figure">
              <img src={larksHeadDiagram} alt="Diagram showing how to attach the tag with a rubber band using a girth hitch" />
            </figure>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container panel">
        <BrandHeader />
        <section className="hero">
          <h1 className="hero-title">Write Your Secret Message</h1>
          <p className="hero-lead">
            Compose a note, pick a print shape, and generate a shareable link plus printable STL.
          </p>
        </section>

        {error ? <div className="message error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <section className="section-card">
            <h2 className="section-title">Step 1: Message</h2>
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
          </section>

          <section className="section-card">
            <h2 className="section-title">Step 2: 3D Print Shape</h2>
            <div className="field">
              <label htmlFor="printShape">Shape</label>
              <select
                id="printShape"
                value={formData.printShape}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, printShape: event.target.value }))
                }
              >
                {PRINT_SHAPE_OPTIONS.map((shape) => (
                  <option key={shape.value} value={shape.value}>
                    {shape.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Generating Link...' : 'Generate Link + STL Preview'}
          </button>
        </form>

        <section id="about" className="section-card about-card">
          <h2 className="section-title">About</h2>
          <p className="about-text">
            Burr Buddy is a way to deliver a secret message. You write a message, choose a
            shape, and generate a printable tag with a QR code. After printing, you quietly clip it
            to someone&apos;s bag or clothes, or slip it into their locker or pocket without them
            knowing. They find it, scan the code, read the secret message, and then respond to the
            message in the app.
          </p>
          <p className="about-text">
            The goal is to make digital communication feel personal again: less feed, more surprise.
            A tiny print, a hidden message, and a private moment between two people.
          </p>
          <p className="about-text">
            The name Burr Buddy refers to having burrs attach to your clothes when you walk through
            the woods. This is a quiet passenger.
          </p>
          <p className="about-text">
            To wear or gift it, loop a small rubber band through the hole in the tag, then girth
            hitch the rubber band onto a safety pin or a small binder clip.
          </p>
          <figure className="about-figure">
            <img src={larksHeadDiagram} alt="Diagram showing how to attach the tag with a rubber band using a girth hitch" />
          </figure>
        </section>
      </div>
    </main>
  )
}
