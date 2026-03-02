import binderClipScenario from '../assets/scenario-binder-clip.svg'
import backpackWebbingScenario from '../assets/scenario-backpack-webbing.svg'
import clothingHemScenario from '../assets/scenario-clothing-hem.svg'

export function AboutContent() {
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
    </>
  )
}
