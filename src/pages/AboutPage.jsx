import { BrandHeader } from '../components/BrandHeader'
import { AboutContent } from '../components/AboutContent'

export function AboutPage() {
  return (
    <main className="page">
      <div className="container panel">
        <BrandHeader aboutHref="/about" showStartLink />
        <section className="section-card about-card" id="about">
          <h1 className="section-title">About</h1>
          <AboutContent />
        </section>
      </div>
    </main>
  )
}
