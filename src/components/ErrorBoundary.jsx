import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Preview failed to render.',
    }
  }

  componentDidCatch() {
    // Error details are available in browser console for debugging.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="message error">
          STL preview failed: {this.state.message}. Try refreshing or creating a new link.
        </div>
      )
    }

    return this.props.children
  }
}
