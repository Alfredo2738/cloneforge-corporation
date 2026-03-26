import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BrainInterface from './pages/BrainInterface'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrainInterface />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
