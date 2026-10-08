import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import ArchivePage from './pages/ArchivePage'
import OpsConsole from './pages/OpsConsole'
import SessionDetailPage from './pages/SessionDetailPage'
import LiveHome from './pages/LiveHome'
import LiveArchivePage from './pages/LiveArchivePage'
import Studio from './pages/Studio'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/live" element={<LiveHome />} />
      <Route path="/live/session/:sessionId" element={<LiveHome />} />
      <Route path="/live/session/:sessionId/archive" element={<LiveArchivePage />} />
      <Route path="/ops/session/:sessionId" element={<SessionDetailPage />} />
      <Route path="/ops" element={<OpsConsole />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/studio/:projectId" element={<Studio />} />
    </Routes>
  )
}
