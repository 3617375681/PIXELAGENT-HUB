import { Routes, Route, Navigate } from 'react-router'
import { lazy, Suspense } from 'react'
import ApiConnection from './components/ApiConnection'

const Studio = lazy(() => import('./pages/Studio'))

export default function App() {
  return (
    <>
    <ApiConnection />
    <Suspense fallback={<main role="status" className="min-h-screen flex items-center justify-center pixel-font-body">正在加载工作区…</main>}>
    <Routes>
      <Route path="/" element={<Navigate to="/studio" replace />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/studio/:projectId" element={<Studio />} />
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
