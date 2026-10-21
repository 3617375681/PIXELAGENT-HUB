import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, replayFileUrl, type ReplayCase } from '../lib/replay';
import { soundEngine } from '../lib/soundEngine';

export default function ReplayUnseen({ projectId }: { projectId?: string }) {
  const [cases, setCases] = useState<ReplayCase[]>([]);
  useEffect(() => { void loadReplayManifest().then((manifest) => setCases(manifest.cases.filter((item) => item.group === 'unseen'))).catch(() => setCases([])); }, []);
  if (!cases.length) return null;
  const ideas = new Set(cases.filter((item) => !item.bug).map((item) => item.caseId)).size;
  const bugs = cases.filter((item) => item.bug).length;
  const open = () => { soundEngine.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <section className="studio-gallery" id="studio-unseen" aria-label="Real runs on unseen ideas">
      <span className="pixel-font studio-kicker">{ideas} NEW IDEAS · {bugs} BUGS CAUGHT</span>
      <h2 className="pixel-font">UNSEEN IDEAS</h2>
      <p>These ideas were committed before their runs and never used to tune the pipeline; the red cards are real bugs the checks caught.</p>
      <div className="studio-showcase-grid">
        {cases.map((item) => (
          <article key={item.projectId} className={`pixel-card studio-showcase-card ${item.bug ? 'studio-unseen-bug' : ''} ${item.projectId === projectId ? 'selected' : ''}`}>
            <Link to={`/studio/${item.projectId}`} onClick={open} className="studio-showcase-shot" aria-label={`Replay ${item.title}`}>
              {item.screenshot ? <img src={replayFileUrl(item.screenshot)} alt={`${item.title}, as built`} loading="lazy" /> : <span className="pixel-font">{item.bug ? 'BUG CAUGHT' : 'REPLAY RUN'}</span>}
            </Link>
            <div className="studio-showcase-meta">
              <h3 className="pixel-font">{item.title.split(' · ')[0].toUpperCase()}</h3>
              <p>{item.note}</p>
              <Link to={`/studio/${item.projectId}`} onClick={open} className={`pixel-font studio-chip ${item.outcome}`}>
                {item.outcome === 'passed' ? 'PASS' : 'FAIL'} · {item.checks} CHECKS
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
