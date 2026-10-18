import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, type ReplayCase } from '../lib/replay';
import { soundEngine } from '../lib/soundEngine';

const STRATEGIES = [{ id: 'manager-coder', label: 'PLAN+CODE' }, { id: 'coder-only', label: 'CODE ONLY' }] as const;
const OUTCOME = { passed: 'PASS', 'checks-failed': 'FAIL', 'not-built': 'NO BUILD' } as const;

/** Every recorded generation of the strategy comparison, one clickable cell per run. */
export default function ReplayGallery({ projectId }: { projectId?: string }) {
  const [series, setSeries] = useState<ReplayCase[]>([]);
  useEffect(() => { void loadReplayManifest().then((manifest) => setSeries(manifest.cases.filter((item) => item.group === 'series'))).catch(() => setSeries([])); }, []);
  if (!series.length) return null;
  const cases = [...new Set(series.map((item) => item.caseId!))];
  const passed = (strategy: string) => series.filter((item) => item.strategy === strategy && item.outcome === 'passed').length;
  const total = (strategy: string) => series.filter((item) => item.strategy === strategy).length;
  const open = () => { soundEngine.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <section className="studio-gallery" id="studio-gallery" aria-label="All recorded real-model runs">
      <span className="pixel-font studio-kicker">{series.length} REAL RUNS</span>
      <h2 className="pixel-font">DOES A PLANNER HELP?</h2>
      <p>Five apps, built three times each with and without the Manager's plan, using DeepSeek. Every run is here, failures included. Click one to replay it.</p>
      <div className="studio-gallery-score pixel-font">
        {STRATEGIES.map((strategy) => <span key={strategy.id}>{strategy.label} <b>{passed(strategy.id)}/{total(strategy.id)}</b></span>)}
        <span>FULLY PASSED</span>
      </div>
      <div className="studio-gallery-grid">
        {cases.map((caseId) => {
          const runs = series.filter((item) => item.caseId === caseId);
          return (
            <article key={caseId} className="pixel-card">
              <h3 className="pixel-font">{runs[0].title.split(' · ')[0].replace(/^Pixel /, '').toUpperCase()}</h3>
              {STRATEGIES.map((strategy) => (
                <div key={strategy.id} className="studio-gallery-row">
                  <span className="pixel-font">{strategy.label}</span>
                  {runs.filter((item) => item.strategy === strategy.id).sort((a, b) => a.run! - b.run!).map((item) => (
                    <Link key={item.projectId} to={`/studio/${item.projectId}`} onClick={open}
                      className={`pixel-font ${item.outcome} ${item.projectId === projectId ? 'selected' : ''}`}
                      title={`${item.title}: ${item.outcome === 'not-built' ? item.note : `${OUTCOME[item.outcome!]} ${item.checks} checks`}`}
                      aria-label={`${item.title}, ${OUTCOME[item.outcome!]}${item.checks ? `, ${item.checks} checks` : ''}`}>
                      <i>R{item.run}</i>{item.outcome === 'not-built' ? '—' : item.checks}
                    </Link>
                  ))}
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
