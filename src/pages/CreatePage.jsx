import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BrandHeader } from '../components/BrandHeader'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PRINT_SHAPE_OPTIONS } from '../lib/printShapes'
import binderClipScenario from '../assets/scenario-binder-clip.svg'
import backpackWebbingScenario from '../assets/scenario-backpack-webbing.svg'
import clothingHemScenario from '../assets/scenario-clothing-hem.svg'

const StlViewer = lazy(() =>
  import('../components/StlViewer').then((module) => ({ default: module.StlViewer })),
)

function AboutCopy() {
  return (
    <>
      <p className="about-text">
        Once upon a time, along a narrow path that wound through tall pines and whispering grasses, there was a small woodland secret known as <strong>Burr Buddy</strong>.
      </p>
      <p className="about-text">
        If you have ever wandered through the woods, you may know how tiny burrs cling quietly to your socks or the hem of your coat. You do not hear them arrive. You only discover them later &mdash; a small passenger from the forest, waiting to be noticed.
      </p>
      <p className="about-text">A Burr Buddy works much the same way.</p>
      <p className="about-text">
        First, you sit beneath an imaginary tree and write your secret message &mdash; it may be long or short, silly or sincere. Then you choose the shape it will take: perhaps a circle like the moon, a star like the night sky, a heart, a hexagon, or some other small charm.
      </p>
      <p className="about-text">
        With a click, the woodland presses your message into a tiny printable tag, marked with a QR code &mdash; a little doorway hidden in plain sight.
      </p>
      <p className="about-text">You print the tag.</p>
      <p className="about-text">Then comes the quiet part of the tale.</p>
      <p className="about-text">
        Without announcing yourself, you fasten the tag to someone&apos;s world. You might clip it gently to a backpack strap. Slip it into a coat pocket. Tuck it into a locker. Let it rest where it will be discovered but not explained.
      </p>
      <p className="about-text">Like a burr on a woodland walk, it simply appears.</p>
      <p className="about-text">
        Later, the finder notices the small shape. They turn it over. They scan the code with their phone. The hidden message unfolds just for them. And within the same app, they may send a reply &mdash; another quiet note traveling back through the trees.
      </p>
      <p className="about-text">Now it is ready to wander.</p>
      <p className="about-text">
        A tiny print.
        <br />
        A hidden note.
        <br />
        A quiet passenger from the woods.
      </p>
    </>
  )
}

function AboutScenarios() {
  return (
    <figure className="about-figure">
      <p className="about-text about-figure-note">
        Slide the Burr Buddy onto the black part of a Small (3/4&quot; wide) Binder Clip or backpack webbing or any hem of clothing.
      </p>
      <div className="about-scenario-grid">
        <div className="about-scenario">
          <img src={binderClipScenario} alt="Burr Buddy slid onto the black part of a small binder clip" />
          <p className="about-scenario-label">Small Binder Clip</p>
        </div>
        <div className="about-scenario">
          <img src={backpackWebbingScenario} alt="Burr Buddy attached to backpack webbing" />
          <p className="about-scenario-label">Backpack Webbing</p>
        </div>
        <div className="about-scenario">
          <img src={clothingHemScenario} alt="Burr Buddy attached to a clothing hem" />
          <p className="about-scenario-label">Clothing Hem</p>
        </div>
      </div>
    </figure>
  )
}

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
            <ErrorBoundary>
              <Suspense fallback={<p className="status">Loading STL preview...</p>}>
                <StlViewer
                  token={createdToken}
                  printShape={createdShape}
                  qrPayload={qrPayloadUrl}
                  onReady={() => setIsStlReady(true)}
                />
              </Suspense>
            </ErrorBoundary>
            <p className="note">Drag to rotate and scroll to zoom.</p>
          </section>

          <div className="action-row">
            <div className="action-item">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  window.open(shareUrl, '_blank', 'noopener,noreferrer')
                }}
              >
                Open Messenger
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
                Start New Burr Buddy
              </button>
            </div>
          </div>

          <section id="about" className="section-card about-card">
            <h2 className="section-title">About</h2>
            <AboutCopy />
            <AboutScenarios />
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
          <AboutCopy />
          <AboutScenarios />
        </section>
      </div>
    </main>
  )
}

