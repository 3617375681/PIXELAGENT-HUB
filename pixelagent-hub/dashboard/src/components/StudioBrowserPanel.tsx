import { useEffect, useState } from 'react';
import { fetchRecordsBinary, studioApi } from '../lib/recordsApi';
import type { StudioBrowserRun, StudioTestPlan } from '../types/studio';

function Screenshot({ projectId, runId, name }: { projectId: string; runId: string; name: 'initial.png' | 'final.png' }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    void fetchRecordsBinary(`/api/studio/projects/${encodeURIComponent(projectId)}/browser-runs/${encodeURIComponent(runId)}/${name}`).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((error) => { if (!disposed) setError(error instanceof Error ? error.message : String(error)); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, runId, name]);
  return <figure>{url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name === 'initial.png' ? 'Screenshot before checks' : 'Screenshot after checks'} /></a>}<figcaption>{name === 'initial.png' ? 'Before' : 'After'}{error && ` · ${error}`}</figcaption></figure>;
}

export default function StudioBrowserPanel({ projectId, previewFile, plans, onRepaired }: { projectId: string; previewFile?: string; plans: StudioTestPlan[]; onRepaired: (projectId: string) => void }) {
  const [state, setState] = useState<{ enabled: boolean; runs: StudioBrowserRun[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await studioApi.browserRuns(projectId, controller.signal);
        if (controller.signal.aborted) return;
        setState(next); setError('');
        if (next.runs.some((run) => ['queued', 'running'].includes(run.status))) timer = setTimeout(poll, 1000);
      } catch (error) {
        if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : String(error)); timer = setTimeout(poll, 3000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, refresh]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setRefresh((value) => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const active = state?.runs.some((run) => ['queued', 'running'].includes(run.status));
  return <section className="studio-tester" aria-label="Browser tests"><h3>BROWSER TESTS</h3><p className="studio-hint">A sandboxed Chromium on the server clicks, types and presses keys from the Tester's plan, then saves screenshots.</p>{state && !state.enabled && <p>Browser tests are off on this server (see docs/software-studio/browser-verification.md).</p>}{error && <p role="alert">{error}</p>}{state?.enabled && plans.filter((plan) => plan.status === 'ready' && plan.previewFile === previewFile).map((plan) => <button key={plan.id} disabled={busy || active} onClick={() => void perform(() => studioApi.startBrowserRun(projectId, plan.id))}>Run browser test · {plan.id.slice(0, 8)}</button>)}{state?.enabled && !plans.some((plan) => plan.status === 'ready' && plan.previewFile === previewFile) && <p>Generate a Tester plan for this version first.</p>}{state?.runs.map((run) => <details key={run.id} onToggle={(event) => { if (event.currentTarget.open) setExpanded(run.id); else setExpanded((current) => current === run.id ? null : current); }}><summary>{run.status} · {new Date(run.startedAt).toLocaleString()} · {run.id.slice(0, 8)}</summary><p>Chromium {run.browserVersion || 'not started'} · {run.checks.filter((check) => check.status === 'passed').length}/{run.checks.length} passed</p><p>Preview SHA-256: <code>{run.previewHash}</code></p>{run.error && <pre>{run.error}</pre>}{run.errors.map((error, index) => <pre key={index}>{error}</pre>)}{run.blockedRequests.length > 0 && <p>Blocked {run.blockedRequests.length} network requests; test failed.</p>}<ul>{run.checks.map((check, index) => <li key={index}>{check.name} · {check.status} · got {JSON.stringify(check.actual)}{check.error && <pre>{check.error}</pre>}</li>)}</ul>{['queued', 'running'].includes(run.status) && <button disabled={busy} onClick={() => void perform(() => studioApi.cancelBrowserRun(projectId, run.id))}>Cancel browser test</button>}{run.repairable && <><p className="studio-hint">Repair calls the model and creates a new version; this report and source are kept.</p><button disabled={busy || active} onClick={() => void perform(async () => { const next = await studioApi.repairBrowserRun(projectId, run.id); onRepaired(next.projectId); })}>Repair from this failure</button></>}{run.status === 'failed' && !run.repairable && <p className="studio-hint">This report cannot drive a repair (infrastructure error or changed preview). Run the test again.</p>}<div className="studio-browser-screenshots">{expanded === run.id && run.screenshots.map((name) => <Screenshot key={name} projectId={projectId} runId={run.id} name={name} />)}</div></details>)}</section>;
}
