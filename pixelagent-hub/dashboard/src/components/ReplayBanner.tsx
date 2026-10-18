import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, type ReplayManifest } from '../lib/replay';

const REPO_URL = 'https://github.com/3617375681/PIXELAGENT-HUB';
const FEATURED_LABELS = ['DEMO', 'REAL APP', 'BUG CAUGHT', 'BUG FIXED'];

/** One-line notice in the static demo: it is a recorded, read-only run, and which case is showing. */
export default function ReplayBanner({ projectId, live = false }: { projectId?: string; live?: boolean }) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  useEffect(() => { void loadReplayManifest().then(setManifest).catch(() => setManifest(null)); }, []);
  const current = manifest?.cases.find((item) => item.projectId === projectId);
  const featured = manifest?.cases.filter((item) => !item.group || item.group === 'featured') || [];
  const recorded = manifest?.cases.filter((item) => item.group === 'series' || item.group === 'showcase') || [];
  return (
    <aside className="studio-replay" aria-label="Replay notice">
      <span className={`pixel-font studio-replay-tag ${live ? 'live' : ''}`}>{live ? 'LIVE' : 'REPLAY'}</span>
      <span className="studio-replay-text">{live ? 'Your run · your own key · running in this browser' : `Recorded run · read-only${current ? ` · ${current.kind === 'mock' ? 'offline mock model' : 'real model (DeepSeek)'}` : ''}`}</span>
      {manifest && (
        <nav aria-label="Replay cases">
          {featured.map((item, index) => (
            <Link key={item.projectId} to={`/studio/${item.projectId}`} className={`pixel-font ${item.projectId === projectId ? 'selected' : ''}`} title={item.title}>
              {FEATURED_LABELS[index] || `CASE ${index}`}
            </Link>
          ))}
          {recorded.length > 0 && <button type="button" className={`pixel-font ${current && recorded.includes(current) ? 'selected' : ''}`} onClick={() => (document.getElementById('studio-showcase') || document.getElementById('studio-gallery'))?.scrollIntoView({ behavior: 'smooth' })}>GALLERY · {recorded.length} RUNS ↓</button>}
        </nav>
      )}
      <a className="pixel-font" href={REPO_URL} target="_blank" rel="noreferrer">GITHUB ↗</a>
    </aside>
  );
}
