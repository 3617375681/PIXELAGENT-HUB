import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Code2, Download, Play, Plus, Radio, RefreshCw, RotateCcw, Square, Terminal, Volume2, VolumeX, Zap } from 'lucide-react';
import { OFFLINE_MESSAGE, studioApi } from '../lib/recordsApi';
import type { StudioChanges, StudioDiagnostic, StudioProject, StudioSummary, StudioVersions, StudioTestPlan } from '../types/studio';
import { readCheckResults, type BrowserCheckResult } from '../lib/studioChecks';
import { prepareStudioPreview, readPreviewMessage } from '../lib/studioPreview';
import './Studio.css';
import StudioReviewPanel from '../components/StudioReviewPanel';
import StudioBrowserPanel from '../components/StudioBrowserPanel';
import StudioPipeline from '../components/StudioPipeline';
import { reducePipeline } from '../lib/studioPipeline';
import { useStudioEvents } from '../hooks/useStudioEvents';
import ApiConnection from '../components/ApiConnection';
import ReplayBanner from '../components/ReplayBanner';
import { REPLAY, loadReplayManifest } from '../lib/replay';
import { soundEngine } from '../lib/soundEngine';

const statusText = { queued: 'QUEUED', running: 'BUILDING', ready_for_review: 'READY TO PLAY', failed: 'FAILED', cancelled: 'CANCELLED' };
const EXAMPLES = [
  { label: 'SNAKE', text: 'A pixel snake game: arrow keys to move, a score, pause/resume, restart and a game-over screen. Start paused and show how to play.' },
  { label: 'TIMER', text: 'A pixel pomodoro timer: 25-minute work and 5-minute break modes, start/pause/reset buttons and a big countdown.' },
  { label: 'TIP CALC', text: 'A pixel tip calculator: bill amount, tip percent buttons (10, 15, 20) and the number of people; show the tip and the total per person.' },
];
const projectStatus = (project: StudioSummary) => project.status === 'ready_for_review' && project.review
  ? project.review.decision === 'approved' ? 'APPROVED' : 'CHANGES REQUESTED'
  : statusText[project.status];

export default function Studio() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [description, setDescription] = useState(EXAMPLES[0].text);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('pixelagent:sound') !== 'off'; } catch { return true; } });
  useEffect(() => {
    soundEngine.setEnabled(sound);
    try { localStorage.setItem('pixelagent:sound', sound ? 'on' : 'off'); } catch { /* per-viewer convenience only */ }
  }, [sound]);
  const creationRequest = useRef<{ description: string; key: string } | null>(null);
  const [projects, setProjects] = useState<StudioSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [html, setHtml] = useState('');
  const [filePath, setFilePath] = useState('index.html');
  const [tab, setTab] = useState<'preview' | 'source'>('preview');
  const [changes, setChanges] = useState<StudioChanges | null>(null);
  const [changesError, setChangesError] = useState('');
  const [versions, setVersions] = useState<StudioVersions | null>(null);
  const [changeRequest, setChangeRequest] = useState('');
  const [testPlans, setTestPlans] = useState<StudioTestPlan[]>([]);
  const [testPlanRefresh, setTestPlanRefresh] = useState(0);
  const [qaRun, setQaRun] = useState(0);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResults, setQaResults] = useState<BrowserCheckResult[]>([]);
  const [qaSaved, setQaSaved] = useState(false);
  const qaPlan = useRef<StudioTestPlan | null>(null);
  const qaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [history, setHistory] = useState<{ projectId?: string; reports: StudioDiagnostic[] }>({ reports: [] });
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const preview = useMemo(() => {
    const nonce = crypto.randomUUID();
    return { nonce, html: prepareStudioPreview(html, nonce) };
  }, [html, qaRun]);

  useEffect(() => {
    setRuntimeErrors([]); setPreviewLoaded(false); setSavedSnapshot('');
    const receive = (event: MessageEvent) => {
      const message = readPreviewMessage(event, previewFrame.current?.contentWindow || null, preview.nonce);
      if (message?.kind === 'loaded') {
        setPreviewLoaded(true);
        const plan = qaPlan.current;
        if (plan?.projectId === projectId && qaTimer.current) previewFrame.current?.contentWindow?.postMessage({ channel: 'studio-checks', nonce: preview.nonce, checks: plan?.result?.output.checks }, '*');
      }
      if (message?.kind === 'error') setRuntimeErrors((errors) => errors.length < 20 ? [...errors, message.message] : errors);
      if (message?.kind === 'checks' && qaTimer.current) {
        const results = readCheckResults(message.message);
        const checks = qaPlan.current?.result?.output.checks;
        if (results && checks && results.length === checks.length && results.every((result, index) => result.name === checks[index].name)) {
          clearTimeout(qaTimer.current); qaTimer.current = undefined;
          setQaResults(results); setQaRunning(false);
        }
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [preview, projectId]);

  useEffect(() => {
    qaPlan.current = null; setQaRunning(false); setQaResults([]); setQaSaved(false);
    return () => { clearTimeout(qaTimer.current); qaTimer.current = undefined; };
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setTestPlans([]);
    if (!projectId) return;
    const poll = async () => {
      try {
        const { plans } = await studioApi.testPlans(projectId, controller.signal);
        if (controller.signal.aborted) return;
        setTestPlans(plans);
        if (plans.some((plan) => ['queued', 'running'].includes(plan.status))) timer = setTimeout(poll, 1000);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error)); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, testPlanRefresh, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory({ projectId, reports: [] });
    if (projectId) void studioApi.diagnostics(projectId, controller.signal).then(({ reports }) => {
      if (!controller.signal.aborted) setHistory({ projectId, reports });
    }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [projectId, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void studioApi.list(controller.signal).then(({ projects }) => setProjects(projects)).catch((error) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error));
    });
    return () => controller.abort();
  }, [refreshKey, project?.status]);

  useEffect(() => {
    setProject(null); setHtml(''); setError(''); setFilePath('index.html');
    if (!projectId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { project } = await studioApi.project(projectId, controller.signal);
        if (controller.signal.aborted) return;
        setProject(project); setError('');
        if (project.status === 'ready_for_review') {
          const preview = await studioApi.preview(projectId, controller.signal);
          if (!controller.signal.aborted) setHtml(preview.html);
        } else if (project.status === 'running' || project.status === 'queued') timer = setTimeout(poll, 1000);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : String(error));
          const status = (error as { status?: number })?.status;
          if (!status || status >= 500 || status === 429) timer = setTimeout(poll, 3000);
        }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, refreshKey]);

  const timeline = useStudioEvents(projectId, refreshKey);
  const pipeline = useMemo(() => reducePipeline(timeline.events), [timeline.events]);
  // In the static replay the saved record is already final; show it as running until its timeline has played.
  const replaying = REPLAY && !!project && !pipeline.terminal;
  const running = replaying || project?.status === 'queued' || project?.status === 'running';
  const current = project?.rounds.at(-1);
  const files = current?.code.output?.files || [];
  const selectedFile = files.find((file) => file.path === filePath) || files[0];
  const ready = !replaying && project?.status === 'ready_for_review';
  useEffect(() => {
    if (!REPLAY || projectId) return;
    void loadReplayManifest().then((manifest) => navigate(`/studio/${manifest.hero}`, { replace: true })).catch((error) => setError(error instanceof Error ? error.message : String(error)));
  }, [projectId, navigate]);
  const generationMetrics = project?.generationMetrics;
  useEffect(() => {
    setVersions(null);
    if (!projectId) return;
    const controller = new AbortController();
    void studioApi.versions(projectId, controller.signal).then((versions) => {
      if (!controller.signal.aborted) setVersions(versions);
    }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [projectId, refreshKey, project?.status]);
  useEffect(() => {
    setChanges(null); setChangesError('');
    if (!projectId || !ready || !(project?.repair || project?.revision)) return;
    const controller = new AbortController();
    void studioApi.changes(projectId, controller.signal).then(({ changes }) => {
      if (!controller.signal.aborted) setChanges(changes);
    }).catch((error) => { if (!controller.signal.aborted) setChangesError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [projectId, ready, project?.repair, project?.revision, refreshKey]);
  const diagnosticSnapshot = JSON.stringify({ previewFile: project?.previewFile, loaded: previewLoaded, errors: runtimeErrors });
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const create = () => action(async () => {
    soundEngine.click();
    const text = description.trim();
    if (creationRequest.current?.description !== text) creationRequest.current = { description: text, key: crypto.randomUUID() };
    const accepted = await studioApi.create(text, creationRequest.current.key);
    creationRequest.current = null;
    navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const cancel = () => action(async () => {
    if (!projectId) return;
    const result = await studioApi.cancel(projectId); setProject(result.project); setRefreshKey((key) => key + 1);
  });
  const retry = () => action(async () => {
    if (!projectId) return;
    const accepted = await studioApi.retry(projectId);
    navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const download = () => action(async () => {
    if (!projectId) return;
    const blob = await studioApi.archive(projectId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${projectId}.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const saveDiagnostic = () => action(async () => {
    if (!projectId || !project?.previewFile) return;
    const { report } = await studioApi.saveDiagnostic(projectId, { previewFile: project.previewFile, loaded: previewLoaded, errors: runtimeErrors });
    setHistory((current) => current.projectId === projectId ? { projectId, reports: [report, ...current.reports] } : current);
    setSavedSnapshot(diagnosticSnapshot);
    invalidateApproval();
  });
  const invalidateApproval = () => {
    const clear = <T extends StudioSummary>(item: T): T => item.projectId === projectId && item.review?.decision === 'approved' ? { ...item, review: null } : item;
    setProject((project) => project ? clear(project) : project);
    setProjects((projects) => projects.map(clear));
    setVersions((versions) => versions ? { ...versions, versions: versions.versions.map(clear) } : versions);
  };
  const repair = (diagnosticId: string) => action(async () => {
    if (!projectId) return;
    const accepted = await studioApi.repair(projectId, diagnosticId);
    navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const revise = () => action(async () => {
    if (!projectId) return;
    const accepted = await studioApi.revise(projectId, changeRequest.trim());
    setChangeRequest(''); navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const selectVersion = (target: string) => action(async () => {
    if (!projectId) return;
    await studioApi.selectVersion(projectId, target);
    navigate(`/studio/${target}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const generateTests = () => action(async () => {
    if (!projectId) return;
    await studioApi.createTestPlan(projectId); setTestPlanRefresh((key) => key + 1);
  });
  const cancelTests = (id: string) => action(async () => {
    if (!projectId) return;
    await studioApi.cancelTestPlan(projectId, id); setTestPlanRefresh((key) => key + 1);
  });
  const runChecks = (plan: StudioTestPlan) => {
    qaPlan.current = plan; setQaResults([]); setQaSaved(false); setQaRunning(true); setTab('preview');
    qaTimer.current = setTimeout(() => {
      qaTimer.current = undefined; setQaRunning(false);
      setQaResults((plan.result?.output.checks || []).map((check) => ({ name: check.name, status: 'failed', actual: '', error: 'Sandbox checks did not finish within 20 seconds' })));
    }, 20000);
    setQaRun((value) => value + 1);
  };
  const saveChecks = () => action(async () => {
    if (!projectId || !project?.previewFile || !qaPlan.current || !qaResults.length) return;
    const { report } = await studioApi.saveDiagnostic(projectId, { previewFile: project.previewFile, loaded: previewLoaded, errors: runtimeErrors, testPlanId: qaPlan.current.id, checks: qaResults });
    setHistory((current) => current.projectId === projectId ? { projectId, reports: [report, ...current.reports] } : current);
    setQaSaved(true);
    invalidateApproval();
  });

  const goTo = (id: string) => { navigate(`/studio/${id}`); setTab('preview'); setRefreshKey((key) => key + 1); };
  const stuck = project && ['failed', 'cancelled'].includes(project.status);

  return (
    <main className="studio pixel-grid-bg">
      {REPLAY && <ReplayBanner projectId={projectId} />}
      <div className="studio-crt scanline" aria-hidden="true" />
      <header className="studio-header">
        <Link to="/studio" className="studio-brand" aria-label="PixelAgent Hub home">
          <span className="studio-mark"><Zap size={16} /></span>
          <span><span className="pixel-font glow-text">PIXELAGENT HUB</span><small className="pixel-font">AI DEV SQUAD</small></span>
        </Link>
        <div className="studio-header-status pixel-font">
          <span><Radio size={10} className={running ? 'animate-pulse' : ''} style={{ color: running ? '#f59e0b' : '#22c55e' }} />{running ? 'RUNNING' : 'READY'}</span>
          <span><Terminal size={10} style={{ color: '#a855f7' }} />4 AGENTS</span>
        </div>
        <div className="studio-header-actions">
          <button className="studio-icon-button pixel-font" onClick={() => { setSound((value) => !value); soundEngine.setEnabled(true); soundEngine.click(); }} aria-pressed={sound} title={sound ? 'Sound on' : 'Sound off'}>
            {sound ? <Volume2 size={12} /> : <VolumeX size={12} />}<span className="studio-sound-label">{sound ? 'SOUND' : 'MUTED'}</span>
          </button>
          {REPLAY
            ? <button className="studio-pill pixel-font" style={{ '--pill': '#f59e0b' } as React.CSSProperties} onClick={() => { soundEngine.click(); setRefreshKey((key) => key + 1); }}><RotateCcw size={12} />REPLAY</button>
            : <Link to="/studio" className="studio-pill pixel-font" style={{ '--pill': '#22c55e' } as React.CSSProperties} onClick={() => soundEngine.click()}><Plus size={12} />NEW</Link>}
          {!REPLAY && <button className="studio-icon-button" onClick={() => setRefreshKey((key) => key + 1)} aria-label="Refresh" title="Refresh"><RefreshCw size={12} /></button>}
          {!REPLAY && <ApiConnection />}
        </div>
      </header>

      <div className="studio-page">
        <section className="studio-hero" aria-label="Start a mission">
          <h1 className="pixel-font">TYPE AN IDEA.<br /><em>WATCH 4 AGENTS BUILD IT.</em></h1>
          <p className="studio-lede">The Manager plans, the Coder writes a small web app, the Builder compiles it, and the Tester clicks through it in a real browser. Any error goes straight back to the Coder.</p>
          <div className="studio-prompt">
            <label htmlFor="studio-description" className="sr-only">Your idea</label>
            <textarea id="studio-description" value={REPLAY && project ? project.description : description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={2} disabled={REPLAY || busy || running} />
            <button className="studio-create pixel-font" onClick={() => void create()} disabled={REPLAY || busy || running || !description.trim()}><Play size={14} />{busy ? 'WAIT…' : 'BUILD IT'}</button>
          </div>
          {REPLAY
            ? <p className="studio-hint">This is a recorded run, so building is switched off. Clone the repo and run <code>npm start</code> to try your own idea offline.</p>
            : <div className="studio-examples"><span className="pixel-font">TRY</span>{EXAMPLES.map((example) => <button key={example.label} className="pixel-font" disabled={busy || running} onClick={() => { soundEngine.click(); setDescription(example.text); }}>{example.label}</button>)}</div>}
        </section>

        {error && <div className={`studio-error ${error === OFFLINE_MESSAGE ? 'offline' : ''}`} role="alert">{error}<button className="pixel-font" onClick={() => setRefreshKey((key) => key + 1)}>RETRY</button></div>}

        {project && (
          <section className="studio-mission" aria-label="Current mission">
            <span className="pixel-font studio-kicker">{REPLAY ? 'STATUS' : 'MISSION'}</span>
            {/* In the replay the prompt box above already shows the recorded request. */}
            <p>{REPLAY ? 'Recorded run of the request above' : project.plan?.output?.projectName || project.description}</p>
            <span className={`pixel-font studio-status ${replaying ? 'running' : project.status}`} role="status">{replaying ? 'REPLAYING' : projectStatus(project)}</span>
            {running && !REPLAY && <button className="pixel-font" onClick={() => void cancel()} disabled={busy}><Square size={12} />STOP</button>}
            {stuck && !REPLAY && <button className="pixel-font" onClick={() => void retry()} disabled={busy}><RotateCcw size={12} />TRY AGAIN</button>}
          </section>
        )}
        {project?.error && <div className="studio-error" role="alert">{project.error}</div>}

        <StudioPipeline view={pipeline} events={timeline.events} live={running} />

        <section className="studio-result" aria-label="Result">
          <div className="studio-tabs" role="tablist" aria-label="Result view">
            {([{ key: 'preview', label: 'PLAY', icon: Play }, { key: 'source', label: 'CODE', icon: Code2 }] as const).map(({ key, label, icon: Icon }) => <button key={key} id={`studio-tab-${key}`} className="pixel-font" role="tab" aria-selected={tab === key} aria-controls="studio-panel" disabled={qaRunning} onClick={() => { soundEngine.click(); setTab(key); }}><Icon size={14} />{label}</button>)}
            <button className="studio-download pixel-font" onClick={() => void download()} disabled={!ready || busy}><Download size={14} />ZIP</button>
          </div>
          <div className="studio-panel" id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
            {tab === 'preview' && (html && !replaying
              ? <><iframe ref={previewFrame} title="The built app" srcDoc={preview.html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /><p className="studio-preview-note">{runtimeErrors.length ? `${runtimeErrors.length} runtime errors seen. See MORE TOOLS.` : previewLoaded ? 'Live and playable. Built is not the same as accepted: check it against the idea.' : 'Loading…'}</p></>
              : <div className="studio-empty"><span aria-hidden="true">▦</span><h3 className="pixel-font">{running ? 'BUILDING…' : stuck ? 'NOTHING TO PLAY' : 'NO APP YET'}</h3><p>{running ? 'The app appears here as soon as it compiles.' : stuck ? 'This run stopped before a working build.' : 'Type an idea above and press BUILD IT.'}</p></div>)}
            {tab === 'source' && (files.length
              ? <div className="studio-source"><label htmlFor="studio-file" className="pixel-font">FILE</label><select id="studio-file" value={selectedFile?.path || ''} onChange={(event) => setFilePath(event.target.value)}>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><pre><code>{selectedFile?.content}</code></pre></div>
              : <div className="studio-empty"><h3 className="pixel-font">NO CODE YET</h3><p>The Coder's files show up here.</p></div>)}
          </div>
        </section>

        <details className="studio-more" onToggle={(event) => { if (event.currentTarget.open) soundEngine.openPanel(); else soundEngine.closePanel(); }}>
          <summary className="pixel-font">MORE TOOLS</summary>

          <section className="studio-tester" aria-label="Projects">
            <h3 className="pixel-font">PROJECTS · {projects.length}</h3>
            {projects.length === 0 && <p className="studio-hint">Your builds will be listed here.</p>}
            <div className="studio-project-list">{projects.map((item) => <Link key={item.projectId} to={`/studio/${item.projectId}`} className={`studio-project-link ${projectId === item.projectId ? 'selected' : ''}`}><strong>{item.description}</strong><small>{item.retry ? 'Retry · ' : item.repair ? 'Repair · ' : item.revision ? 'Change · ' : ''}{projectStatus(item)}</small></Link>)}</div>
          </section>

          {project && (project.retry || project.revision || project.repair) && <section className="studio-tester" aria-label="Lineage">
            <h3 className="pixel-font">WHERE THIS VERSION CAME FROM</h3>
            {project.retry && <p>A fresh retry of <Link to={`/studio/${project.retry.parentProjectId}`}>a failed or cancelled run</Link>.</p>}
            {project.revision && <p>Change request: “{project.revision.changeRequest}” on <Link to={`/studio/${project.revision.parentProjectId}`}>the previous version</Link>.</p>}
            {project.repair && <p>Repaired from saved {project.repair.browserRunId ? 'browser-test' : 'diagnostic'} evidence on <Link to={`/studio/${project.repair.parentProjectId}`}>the original</Link>. Test it again after it builds.</p>}
          </section>}

          {versions && versions.versions.length > 1 && <section className="studio-tester" aria-label="Versions">
            <h3 className="pixel-font">VERSIONS · {versions.versions.length}</h3>
            <div className="studio-version-history">{versions.versions.map((version, index) => <div key={version.projectId}><Link to={`/studio/${version.projectId}`}>V{index + 1} · {version.retry ? 'Retry' : version.revision?.changeRequest || (version.repair ? 'Repair' : 'First build')} · {projectStatus(version)}</Link>{versions.selectedProjectId === version.projectId ? <span className="pixel-font">IN USE</span> : <button disabled={REPLAY || busy || running || version.status !== 'ready_for_review'} onClick={() => void selectVersion(version.projectId)}>Use this</button>}</div>)}</div>
          </section>}

          {ready && !REPLAY && <section className="studio-tester" aria-label="Change it">
            <h3 className="pixel-font">ASK FOR A CHANGE</h3>
            <label htmlFor="studio-change-request" className="sr-only">What should change</label>
            <textarea id="studio-change-request" value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} maxLength={4000} rows={2} disabled={busy} placeholder="e.g. make the snake faster after every 5 points" />
            <button disabled={busy || !changeRequest.trim()} onClick={() => void revise()}>Build a new version</button>
          </section>}

          {changes && <section className="studio-tester studio-changes" aria-label="What changed">
            <h3 className="pixel-font">WHAT CHANGED</h3>
            <p>{changes.files.length} files changed, {changes.unchanged} unchanged.</p>
            {changes.files.map((file) => <details key={file.path} open={changes.files.length === 1}><summary>{file.path} · {file.status}</summary><div className="studio-change-columns"><section><h4>Before</h4><pre><code>{file.before === undefined ? '(no file)' : file.before}</code></pre></section><section><h4>After</h4><pre><code>{file.after === undefined ? '(deleted)' : file.after}</code></pre></section></div></details>)}
          </section>}
          {changesError && <p className="studio-hint" role="alert">{changesError}</p>}

          {generationMetrics && <section className="studio-tester" aria-label="Usage">
            <h3 className="pixel-font">USAGE</h3>
            <dl className="studio-usage-grid">
              <div><dt>Time</dt><dd>{generationMetrics.elapsedMs === null ? running ? '…' : 'unknown' : `${(generationMetrics.elapsedMs / 1000).toFixed(1)} s`}</dd></div>
              <div><dt>Tokens</dt><dd>{generationMetrics.reportedUsageTasks ? generationMetrics.reportedTokens.toLocaleString() : 'not reported'}</dd></div>
              <div><dt>Compiles / failed</dt><dd>{generationMetrics.buildAttempts} / {generationMetrics.failedBuilds}</dd></div>
              <div><dt>Model</dt><dd>{generationMetrics.models.join(', ') || 'unknown'}</dd></div>
            </dl>
          </section>}

          {ready && !REPLAY && <section className="studio-tester" aria-label="Quick checks">
            <h3 className="pixel-font">QUICK CHECKS</h3>
            <p className="studio-hint">The Tester writes click-and-expect checks; they run inside the preview above. The full sandboxed browser test is below.</p>
            <button disabled={busy || qaRunning || testPlans.some((plan) => ['queued', 'running'].includes(plan.status))} onClick={() => void generateTests()}>Write checks</button>
            {testPlans.map((plan) => <details key={plan.id}><summary>Plan {plan.id.slice(0, 8)} · {plan.status}</summary>{plan.error && <p role="alert">{plan.error}</p>}{['queued', 'running'].includes(plan.status) && <button onClick={() => void cancelTests(plan.id)} disabled={busy}>Cancel</button>}{plan.result?.output?.checks && <><ol>{plan.result.output.checks.map((check, index) => <li key={index}>{check.name}: {check.actions.length} actions → {check.selector} {check.assertion === 'disabled' ? 'disabled' : 'text'} = {JSON.stringify(check.expected)}</li>)}</ol><button disabled={plan.status !== 'ready' || busy || qaRunning || plan.previewFile !== project?.previewFile} onClick={() => runChecks(plan)}>Run in preview</button></>}</details>)}
            {qaRunning && <p role="status">Running checks…</p>}
            {qaResults.length > 0 && <><p role="status">{qaResults.filter((result) => result.status === 'passed').length} / {qaResults.length} passed</p><ul>{qaResults.map((result, index) => <li key={index}>{result.name} · {result.status} · got {JSON.stringify(result.actual)}{result.error && <pre>{result.error}</pre>}</li>)}</ul><button disabled={busy || qaSaved} onClick={() => void saveChecks()}>{qaSaved ? 'Saved' : 'Save results'}</button></>}
          </section>}
          {ready && project && <StudioBrowserPanel key={`browser-${project.projectId}`} projectId={project.projectId} previewFile={project.previewFile} plans={testPlans} onRepaired={goTo} />}

          {project && <section className="studio-tester studio-evidence" aria-label="Build log">
            <h3 className="pixel-font">BUILD LOG</h3>
            {project.plan && <p>Plan: {project.plan.status} · {project.plan.output?.llmProvider || '—'} / {project.plan.output?.llmModel || '—'}</p>}
            {project.rounds.map((round) => <article key={round.round}><h4>Round {round.round}</h4><p>Code: {round.code.status} · {round.code.output?.llmProvider || '—'} / {round.code.output?.llmModel || '—'}</p><p>Build: {round.build?.status || 'not run'}</p>{round.build?.errors.map((message, index) => <pre key={index}>{message}</pre>)}{round.code.status === 'failed' && <pre>{round.code.reasoning}</pre>}</article>)}
            {ready && !REPLAY && <article><h4>Preview observation</h4><p>{runtimeErrors.length ? `${runtimeErrors.length} runtime errors captured` : previewLoaded ? 'Loaded, no runtime errors so far' : 'Not loaded yet'}</p>{runtimeErrors.map((message, index) => <pre key={index}>{message}</pre>)}<button disabled={busy || (!previewLoaded && !runtimeErrors.length) || savedSnapshot === diagnosticSnapshot} onClick={() => void saveDiagnostic()}>{savedSnapshot === diagnosticSnapshot ? 'Saved' : 'Save observation'}</button></article>}
            {history.reports.length > 0 && <article><h4>Saved observations</h4>{history.reports.map((report) => <section key={report.id}><p>{new Date(report.savedAt).toLocaleString()} · {report.loaded ? 'loaded' : 'not loaded'} · {report.errors.length} errors{report.checks ? ` · ${report.checks.filter((check) => check.status === 'passed').length}/${report.checks.length} checks` : ''}</p>{report.errors.map((message, index) => <pre key={index}>{message}</pre>)}{!REPLAY && <button disabled={!ready || busy || !report.errors.length || report.previewFile !== project.previewFile} onClick={() => void repair(report.id)}>Repair from this</button>}</section>)}</article>}
            <small>Project {project.projectId}</small>
          </section>}

          {ready && project && !REPLAY && <StudioReviewPanel key={project.projectId} project={project} reports={history.projectId === projectId ? history.reports : []} onSaved={() => setRefreshKey((key) => key + 1)} />}
        </details>
      </div>
    </main>
  );
}
