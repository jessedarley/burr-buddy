import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AboutPage } from './pages/AboutPage'
import { CreatePage } from './pages/CreatePage'
import { ReceiverPage } from './pages/ReceiverPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/create" replace />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/p/:token" element={<ReceiverPage />} />
      <Route path="/r/:token" element={<ReceiverPage />} />
      <Route path="*" element={<Navigate to="/create" replace />} />
    </Routes>
  )
}
