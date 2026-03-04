import printingStep1Image from '../assets/Photos/Bambu.JPEG'
import printingStep2Image from '../assets/Photos/Sharpie.JPEG'
import printingStep3Image from '../assets/Photos/Sharpie Done.JPEG'
import printingStep4Image from '../assets/Photos/Putting onto clip.JPEG'
import printingStep5Image from '../assets/Photos/On Clip.JPEG'
import clippingStep1Image from '../assets/Photos/On Pocket.JPEG'
import clippingStep2Image from '../assets/Photos/On hem.JPEG'
import clippingStep3Image from '../assets/Photos/On Backpack.JPEG'

export function AboutContent() {
  const printingAssemblySteps = [
    {
      src: printingStep1Image,
      alt: 'Freshly printed Burr Buddy tags with contrasting QR code colors on a print bed',
      caption: 'If possible, print your Burr Buddy with two contrasting colors so the QR code is easily scanned.',
    },
    {
      images: [
        {
          src: printingStep2Image,
          alt: 'Single-color Burr Buddy tag with a Sharpie coloring in the QR code details',
        },
        {
          src: printingStep3Image,
          alt: 'Single-color Burr Buddy tag after the QR code has been colored in',
        },
      ],
      caption: 'If printing in a single filament, color the QR code with a Sharpie',
    },
    {
      images: [
        {
          src: printingStep4Image,
          alt: 'Sliding Burr Buddy onto the thin metal part of a small black binder clip',
        },
        {
          src: printingStep5Image,
          alt: 'Burr Buddy attached to a small black binder clip',
        },
      ],
      caption: 'Slide the Burr Buddy onto the thin metal part of a small (3/4" wide) binder clip',
    },
  ]

  const clippingSteps = [
    {
      src: clippingStep1Image,
      alt: 'Burr Buddy clipped to the edge of a coat or pocket',
      caption: 'Clip it to a pocket',
    },
    {
      src: clippingStep2Image,
      alt: 'Burr Buddy clipped onto a pocket',
      caption: 'Clip it to the edge of a coat or shirt',
    },
    {
      src: clippingStep3Image,
      alt: 'Burr Buddy clipped to a purse or backpack',
      caption: 'or clip it to a purse or backpack',
    },
  ]

  return (
    <>
      <p className="about-text">
        Once upon a time, along a narrow path through tall pines and whispering grasses, there was a small woodland secret called Burr Buddy.
      </p>
      <p className="about-text">
        If you have ever walked through the woods, you know how tiny burrs cling quietly to your socks or the hem of your coat. You do not notice them arriving &mdash; only later do you discover the small passenger.
      </p>
      <p className="about-text">A Burr Buddy works much the same way.</p>
      <p className="about-text">
        First, write a secret message &mdash; short or long, silly or sincere. Choose a shape for the tag: a circle, star, heart, hexagon, or another small charm. The message becomes a printable tag marked with a QR code &mdash; a tiny doorway hidden in plain sight.
      </p>
      <p className="about-text">
        Print the tag, then quietly fasten it to someone&apos;s world. Clip it to a backpack, slip it into a pocket, or tuck it into a locker. Like a burr on a woodland walk, it simply appears.
      </p>
      <p className="about-text">
        When it is found, the code can be scanned to reveal the hidden message, and a reply can be sent back through the same little doorway.
      </p>
      <p className="about-text">
        A tiny print.
        <br />
        A hidden note.
        <br />
        A quiet passenger from the woods.
      </p>
      <figure className="about-figure" id="instructions">
        <h3 className="about-subtitle">Printing and Attaching to Binder Clip</h3>
        <div className="about-printing-grid">
          {printingAssemblySteps.map((step, index) => (
            <div
              className={`about-printing-step${step.images ? ' about-printing-step-paired' : ''}`}
              key={`printing-step-${index + 1}`}
            >
              {step.images ? (
                <div className="about-printing-pair">
                  {step.images.map((image, imageIndex) => (
                    image.src ? (
                      <img className="about-printing-image" src={image.src} alt={image.alt} key={`image-${imageIndex + 1}-${image.alt}`} />
                    ) : (
                      <div className="about-printing-image-placeholder" aria-hidden="true" key={`placeholder-${imageIndex + 1}-${image.alt}`}>
                        Image coming soon
                      </div>
                    )
                  ))}
                </div>
              ) : step.src ? (
                <img className="about-printing-image" src={step.src} alt={step.alt} />
              ) : (
                <div className="about-printing-image-placeholder" aria-hidden="true">
                  Image coming soon
                </div>
              )}
              {step.caption ? <p className="about-scenario-label">{step.caption}</p> : null}
            </div>
          ))}
        </div>
      </figure>
      <figure className="about-figure">
        <h3 className="about-subtitle">Clipping it on</h3>
        <div className="about-clipping-grid">
          {clippingSteps.map((step, index) => (
            <div className="about-clipping-card" key={`clipping-step-${index + 1}`}>
              {step.src ? (
                <img className="about-printing-image" src={step.src} alt={step.alt} />
              ) : (
                <div className="about-printing-image-placeholder" aria-hidden="true">
                  Image coming soon
                </div>
              )}
              <p className="about-scenario-label">{step.caption}</p>
            </div>
          ))}
        </div>
      </figure>
      <section className="about-figure">
        <h3 className="about-subtitle">Get Creative</h3>
        <ul className="about-bullet-list">
          <li className="about-text">Print a single tag for a private message.</li>
          <li className="about-text">Use the clear message and add message functions to reuse the tag.</li>
          <li className="about-text">
            Print a bunch of the same tag and hand them out to promote or broadcast your message (Vote for Pedro for example).
          </li>
        </ul>
      </section>
    </>
  )
}
