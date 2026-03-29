import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, Component } from 'react'
import BrainInterface from './pages/BrainInterface'
import ClonePharmaSales from './pages/ClonePharmaSales'
import CorporateGate, { useCorporateAuth } from './components/auth/CorporateGate'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, background: '#050c18', color: '#f87171', fontFamily: 'monospace', minHeight: '100vh' }}>
        <h2 style={{ color: '#fb7185' }}>Interface Error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error?.message}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#94a3b8' }}>{this.state.error?.stack}</pre>
        <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

function GatedBrain() {
  const existing = useCorporateAuth()
  const [session, setSession] = useState(existing)

  if (!session) return <CorporateGate onGrant={setSession} />
  return <ErrorBoundary><BrainInterface session={session} /></ErrorBoundary>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GatedBrain />} />
        <Route path="/clonepharma_sales" element={<ErrorBoundary><ClonePharmaSales /></ErrorBoundary>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
