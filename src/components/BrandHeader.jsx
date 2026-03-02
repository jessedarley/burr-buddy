import logo from '../assets/logo.png'

export function BrandHeader() {
  return (
    <div className="brand">
      <img className="brand-logo" src={logo} alt="Burr Buddy logo" />
      <a className="brand-link" href="#about">
        about
      </a>
    </div>
  )
}
