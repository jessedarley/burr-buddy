import logo from '../assets/logo.png'

export function BrandHeader({
  aboutHref = '#about',
  showStartLink = false,
  startLinkNewTab = false,
}) {
  return (
    <div className="brand">
      <a href="/create" aria-label="Start New Burr Buddy">
        <img className="brand-logo" src={logo} alt="Burr Buddy logo" />
      </a>
      <div className="brand-links">
        <a className="brand-link" href={aboutHref}>
          about
        </a>
        {showStartLink ? (
          <a
            className="brand-link"
            href="/create"
            target={startLinkNewTab ? '_blank' : undefined}
            rel={startLinkNewTab ? 'noopener noreferrer' : undefined}
          >
            Start New Burr Buddy
          </a>
        ) : null}
      </div>
    </div>
  )
}
