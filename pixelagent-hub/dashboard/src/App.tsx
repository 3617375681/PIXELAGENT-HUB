import { Routes, Route } from 'react-router'
import { lazy, Suspense } from 'react'

const Home = lazy(() => import('./pages/Home'))
const ArchivePage = lazy(() => import('./pages/ArchivePage'))
const OpsConsole = lazy(() => import('./pages/OpsConsole'))
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'))
const LiveHome = lazy(() => import('./pages/LiveHome'))
const LiveArchivePage = lazy(() => import('./pages/LiveArchivePage'))
const Studio = lazy(() => import('./pages/Studio'))

export default function App() {
  return (
    <Suspense fallback={<main role="status" className="min-h-screen flex items-center justify-center pixel-font-body">正在加载工作区…</main>}>
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
    </Suspense>
  )
}
