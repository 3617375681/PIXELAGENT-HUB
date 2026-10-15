import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, type ReplayManifest } from '../lib/replay';

const REPO_URL = 'https://github.com/3617375681/PIXELAGENT-HUB';

/** Always-visible notice in the static demo: what is being replayed, how it was recorded, and that it is read-only. */
export default function ReplayBanner({ projectId }: { projectId?: string }) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  useEffect(() => { void loadReplayManifest().then(setManifest).catch(() => setManifest(null)); }, []);
  const current = manifest?.cases.find((item) => item.projectId === projectId);
  return (
    <aside className="studio-replay" aria-label="回放说明">
      <div className="studio-replay-row">
        <span className="pixel-font studio-replay-tag">REPLAY</span>
        <span>静态回放演示 · 只读{manifest ? ` · 录制于 ${manifest.recordedAt.slice(0, 10)}` : ''}</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub 源码</a>
      </div>
      {current && <p><strong>{current.kind === 'mock' ? 'MOCK 模型' : '真实模型'}</strong>{current.note}</p>}
      {manifest && (
        <nav aria-label="回放案例">
          {manifest.cases.map((item) => <Link key={item.projectId} to={`/studio/${item.projectId}`} className={item.projectId === projectId ? 'selected' : ''}>{item.title}</Link>)}
        </nav>
      )}
    </aside>
  );
}
