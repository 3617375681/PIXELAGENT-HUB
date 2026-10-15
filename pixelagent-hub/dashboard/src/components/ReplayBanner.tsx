import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, type ReplayManifest } from '../lib/replay';

const REPO_URL = 'https://github.com/3617375681/PIXELAGENT-HUB';

/** One-line notice in the static demo: it is a recorded, read-only run, and which case is showing. */
export default function ReplayBanner({ projectId }: { projectId?: string }) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  useEffect(() => { void loadReplayManifest().then(setManifest).catch(() => setManifest(null)); }, []);
  const current = manifest?.cases.find((item) => item.projectId === projectId);
  return (
    <aside className="studio-replay" aria-label="Replay notice">
      <span className="pixel-font studio-replay-tag">REPLAY</span>
      <span className="studio-replay-text">Recorded run · read-only{current ? ` · ${current.kind === 'mock' ? 'offline mock model' : 'real model (DeepSeek)'}` : ''}</span>
      {manifest && (
        <nav aria-label="Replay cases">
          {manifest.cases.map((item, index) => (
            <Link key={item.projectId} to={`/studio/${item.projectId}`} className={`pixel-font ${item.projectId === projectId ? 'selected' : ''}`} title={item.title}>
              {index === 0 ? 'DEMO' : `CASE ${index}`}
            </Link>
          ))}
        </nav>
      )}
      <a className="pixel-font" href={REPO_URL} target="_blank" rel="noreferrer">GITHUB ↗</a>
    </aside>
  );
}
