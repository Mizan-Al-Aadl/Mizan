import { Routes, Route, Navigate } from 'react-router-dom'
import MizanApp from './pages/MizanApp'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MizanApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}