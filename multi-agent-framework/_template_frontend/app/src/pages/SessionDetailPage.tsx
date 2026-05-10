import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { recordsApi } from '@/lib/recordsApi';

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [memory, setMemory] = useState<unknown>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    setError('');
    void recordsApi
      .getSession(sessionId)
      .then((r) => {
        setSession(r.session || null);
        setMarkdown(typeof r.markdown === 'string' ? r.markdown : '');
      })
      .catch((e) => setError(String(e)));
  }, [sessionId]);

  const loadMemory = () => {
    if (!sessionId) return;
    void recordsApi
      .getMemory(sessionId)
      .then((r) => setMemory(r.memory))
      .catch((e) => setError(String(e)));
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-[#e5e7eb] p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link to="/ops" className="text-sm text-cyan-400 hover:underline">← NanoClaw</Link>
          <h1 className="text-lg font-semibold">Session {sessionId || '—'}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="px-2 py-1 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700"
            onClick={() => void loadMemory()}
          >
            GET /api/memory
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded border border-red-900/60 bg-red-950/40 hover:bg-red-900/50 text-red-200"
            onClick={() => {
              if (!sessionId || !confirm(`Delete session ${sessionId}?`)) return;
              void recordsApi
                .deleteSession(sessionId)
                .then(() => navigate('/ops'))
                .catch((e) => setError(String(e)));
            }}
          >
            DELETE session
          </button>
        </div>
      </div>
      {error && <div className="text-sm text-amber-300">{error}</div>}
      {memory != null && (
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h2 className="text-sm font-medium text-slate-300 mb-2">memory (session.json.memory)</h2>
          <pre className="text-xs overflow-auto max-h-48 bg-slate-950 p-2 rounded border border-slate-800">
            {JSON.stringify(memory, null, 2)}
          </pre>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h2 className="text-sm font-medium text-slate-300 mb-2">session.json</h2>
          <pre className="text-xs overflow-auto max-h-[70vh] bg-slate-950 p-2 rounded border border-slate-800">
            {session ? JSON.stringify(session, null, 2) : '…'}
          </pre>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h2 className="text-sm font-medium text-slate-300 mb-2">output.md</h2>
          <pre className="text-xs overflow-auto max-h-[70vh] bg-slate-950 p-2 rounded border border-slate-800 whitespace-pre-wrap">
            {markdown || '(empty)'}
          </pre>
        </div>
      </div>
    </div>
  );
}
