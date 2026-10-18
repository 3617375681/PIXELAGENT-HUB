import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadReplayManifest, replayFileUrl, type ReplayCase } from '../lib/replay';
import { soundEngine } from '../lib/soundEngine';

const OUTCOME = { passed: 'PASS', 'checks-failed': 'FAIL', 'not-built': 'NO BUILD' } as const;

/** One card per showcase idea: the final screenshot of its best attempt, and every attempt as a chip. */
export default function ReplayShowcase({ projectId }: { projectId?: string }) {
  const [showcase, setShowcase] = useState<ReplayCase[]>([]);
  useEffect(() => { void loadReplayManifest().then((manifest) => setShowcase(manifest.cases.filter((item) => item.group === 'showcase'))).catch(() => setShowcase([])); }, []);
  if (!showcase.length) return null;
  const ideas = [...new Set(showcase.map((item) => item.caseId!))];
  const open = () => { soundEngine.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const built = ideas.filter((idea) => showcase.some((item) => item.caseId === idea && item.outcome === 'passed')).length;
  return (
    <section className="studio-gallery" id="studio-showcase" aria-label="Apps the squad built with a real model">
      <span className="pixel-font studio-kicker">{ideas.length} IDEAS · {showcase.length} ATTEMPTS</span>
      <h2 className="pixel-font">WHAT THE SQUAD BUILT</h2>
      <p>One generation per attempt with DeepSeek, no hand edits. {built} of {ideas.length} ideas ended with every browser check passing; the misses are here too. Click a card to replay how it was made.</p>
      <div className="studio-showcase-grid">
        {ideas.map((idea) => {
          const attempts = showcase.filter((item) => item.caseId === idea).sort((a, b) => a.run! - b.run!);
          const best = attempts.find((item) => item.outcome === 'passed') || attempts.at(-1)!;
          const name = best.title.split(' · ')[0];
          return (
            <article key={idea} className={`pixel-card studio-showcase-card ${attempts.some((item) => item.projectId === projectId) ? 'selected' : ''}`}>
              <Link to={`/studio/${best.projectId}`} onClick={open} className="studio-showcase-shot" aria-label={`Replay ${name}`}>
                {best.screenshot ? <img src={replayFileUrl(best.screenshot)} alt={`${name}, as built`} loading="lazy" /> : <span className="pixel-font">NO BUILD</span>}
              </Link>
              <div className="studio-showcase-meta">
                <h3 className="pixel-font">{name.toUpperCase()}</h3>
                <div>
                  {attempts.map((item) => (
                    <Link key={item.projectId} to={`/studio/${item.projectId}`} onClick={open}
                      className={`pixel-font studio-chip ${item.outcome} ${item.projectId === projectId ? 'selected' : ''}`}
                      title={item.outcome === 'not-built' ? item.note : `${item.title}: ${OUTCOME[item.outcome!]} ${item.checks} checks`}>
                      #{item.run} {item.outcome === 'not-built' ? 'NO BUILD' : item.checks}
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
