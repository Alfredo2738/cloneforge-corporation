import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import BrainInterface from './pages/BrainInterface'
import CorporateGate, { useCorporateAuth } from './components/auth/CorporateGate'

function GatedBrain() {
  const existing = useCorporateAuth()
  const [session, setSession] = useState(existing)

  if (!session) return <CorporateGate onGrant={setSession} />
  return <BrainInterface session={session} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GatedBrain />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
