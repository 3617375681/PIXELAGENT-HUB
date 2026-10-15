import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router'
import App from './App'
import './index.css'
import { REPLAY } from './lib/replay'

// The static replay is served from a GitHub Pages subpath without SPA rewrites, so it uses hash routes.
const Router = REPLAY ? HashRouter : BrowserRouter

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message + '\n' + error.stack };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'red', padding: 40, fontSize: 14, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        REACT ERROR BOUNDARY:<br/>{this.state.error}
      </div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Router>
  </StrictMode>,
)
