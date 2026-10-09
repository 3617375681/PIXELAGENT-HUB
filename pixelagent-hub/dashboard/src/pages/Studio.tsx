import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Code2, Download, Hammer, Play, RefreshCw, Square, Terminal } from 'lucide-react';
import { studioApi } from '../lib/recordsApi';
import type { StudioChanges, StudioDiagnostic, StudioProject, StudioSummary, StudioVersions, StudioTestPlan } from '../types/studio';
import { readCheckResults, type BrowserCheckResult } from '../lib/studioChecks';
import { prepareStudioPreview, readPreviewMessage } from '../lib/studioPreview';
import './Studio.css';
import StudioReviewPanel from '../components/StudioReviewPanel';
import StudioBrowserPanel from '../components/StudioBrowserPanel';
import { studioStages } from '../lib/studioStages';

const statusText = { queued: '排队中', running: '团队工作中', ready_for_review: '构建完成 · 等待验收', failed: '运行失败', cancelled: '已取消' };
const phaseText: Record<string, string> = { queued: '等待执行', planning: 'Manager 正在规划', coding: 'Coder 正在生成源码', building: '正在实际编译', ready_for_review: '可以试玩与检查', failed: '执行已停止', cancelled: '执行已取消' };
const defaultDescription = '制作像素贪吃蛇：方向键移动，包含计分、暂停/继续、重新开始和游戏结束状态。开始时暂停，提供运行说明。';
const projectStatus = (project: StudioSummary) => project.status === 'ready_for_review' && project.review
  ? project.review.decision === 'approved' ? '人工验收通过' : '人工验收 · 需返修'
  : statusText[project.status];

export default function Studio() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [description, setDescription] = useState(defaultDescription);
  const creationRequest = useRef<{ description: string; key: string } | null>(null);
  const [projects, setProjects] = useState<StudioSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [html, setHtml] = useState('');
  const [filePath, setFilePath] = useState('index.html');
  const [tab, setTab] = useState<'preview' | 'source' | 'evidence' | 'changes'>('preview');
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

  const running = project?.status === 'queued' || project?.status === 'running';
  const current = project?.rounds.at(-1);
  const files = current?.code.output?.files || [];
  const selectedFile = files.find((file) => file.path === filePath) || files[0];
  const ready = project?.status === 'ready_for_review';
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
    if (!projectId || tab !== 'changes' || !ready) return;
    const controller = new AbortController();
    void studioApi.changes(projectId, controller.signal).then(({ changes }) => {
      if (!controller.signal.aborted) setChanges(changes);
    }).catch((error) => { if (!controller.signal.aborted) setChangesError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [projectId, tab, ready, refreshKey]);
  const diagnosticSnapshot = JSON.stringify({ previewFile: project?.previewFile, loaded: previewLoaded, errors: runtimeErrors });
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const create = () => action(async () => {
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

  return (
    <main className="studio">
      <header className="studio-header">
        <Link to="/" className="studio-home"><ArrowLeft size={16} />控制台</Link>
        <div className="studio-brand"><span className="studio-mark" aria-hidden="true">▦</span><div><span className="pixel-font">PIXEL / STUDIO</span><small>把需求变成可以试玩的作品</small></div></div>
        <button onClick={() => setRefreshKey((key) => key + 1)} aria-label="刷新项目"><RefreshCw size={16} /></button>
      </header>
      <div className="studio-layout">
        <aside className="studio-sidebar">
          <section className="studio-brief">
            <span className="studio-kicker">01 / 创作任务</span>
            <h1>让团队做出<br /><em>你的下一件作品。</em></h1>
            <label htmlFor="studio-description">新的创作任务</label>
            <textarea id="studio-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={6} disabled={busy || running} />
            <p className="studio-hint">离线网页与像素小游戏。规划、写码、构建会留下实际记录。</p>
            <button className="studio-create" onClick={() => void create()} disabled={busy || running || !description.trim()}><Play size={16} />{busy ? '正在处理…' : '开始创作'}</button>
          </section>
          <section className="studio-projects">
            <span className="studio-kicker">02 / 我的项目</span>
            {projects.length === 0 && <p className="studio-hint">项目会保存在这里，刷新后仍可继续查看。</p>}
            {projects.map((item) => <Link key={item.projectId} to={`/studio/${item.projectId}`} className={`studio-project-link ${projectId === item.projectId ? 'selected' : ''}`}><strong>{item.description}</strong><small>{item.retry ? '重试 · ' : item.repair ? '返修 · ' : item.revision ? '修改 · ' : ''}{projectStatus(item)}</small></Link>)}
          </section>
        </aside>
        <section className="studio-workspace" aria-label="作品工作区">
          {error && <div className="studio-error" role="alert">{error}<button onClick={() => setRefreshKey((key) => key + 1)}>重试</button></div>}
          <div className="studio-workspace-heading"><div><span className="studio-kicker">WORKSPACE</span><h2>{project?.plan?.output?.projectName || (project?.strategy === 'coder-only' ? '单 Agent 对照作品' : project ? running ? '正在准备你的项目' : '你的创作任务' : '你的作品，从这里开始')}</h2></div>{project && <span className={`studio-status ${project.status}`} role="status">{projectStatus(project)}</span>}</div>
          {project && <details className="studio-requirements"><summary>本次需求</summary><p>{project.description}</p></details>}
          {project?.retry && <p className="studio-hint">这是重新生成的新版本。<Link to={`/studio/${project.retry.parentProjectId}`}>查看原失败或取消记录</Link>。</p>}
          {project?.revision && <p className="studio-hint">本次修改：{project.revision.changeRequest} · <Link to={`/studio/${project.revision.parentProjectId}`}>查看基础版本</Link></p>}
          {versions && <details className="studio-version-history"><summary>版本历史 · {versions.versions.length} 个版本</summary><p className="studio-hint">选择版本会保存当前使用的候选作品；每个版本仍需独立验收。{versions.selectedProjectId === null && ' 尚未选择可用版本。'}</p>{versions.versions.map((version, index) => <div key={version.projectId}><Link to={`/studio/${version.projectId}`}>V{index + 1} · {version.retry ? '重新生成' : version.revision?.changeRequest || (version.repair ? '依据诊断返修' : '初始作品')} · {projectStatus(version)}</Link>{versions.selectedProjectId === version.projectId ? <span>当前使用</span> : <button disabled={busy || running || version.status !== 'ready_for_review'} onClick={() => void selectVersion(version.projectId)}>使用此版本</button>}</div>)}</details>}
          {ready && <details className="studio-revision-brief"><summary>在此版本上追加需求</summary><label htmlFor="studio-change-request">希望修改什么</label><textarea id="studio-change-request" value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} maxLength={4000} rows={3} disabled={busy} /><button disabled={busy || !changeRequest.trim()} onClick={() => void revise()}>开始修改并生成新版本</button></details>}
          {project?.repair && <p className="studio-hint">本次依据保存的失败证据返修。<Link to={`/studio/${project.repair.parentProjectId}`}>查看原项目</Link> · {project.repair.browserRunId ? `独立浏览器报告 ${project.repair.browserRunId}` : `客户端诊断 ${project.repair.diagnosticId}`}。构建通过后仍需复测。</p>}
          <ol className="studio-team" aria-label="团队执行阶段">
            {studioStages(project).map((agent) => <li key={agent.name} className={agent.state}><span className="studio-agent-icon">{agent.icon}</span><div><strong>{agent.name}</strong><small>{agent.detail}</small></div><span className="studio-agent-state">{agent.label}</span></li>)}
          </ol>
          {generationMetrics && <section className="studio-tester" aria-label="生成耗时与用量">
            <h3>本次生成 / 耗时与用量</h3>
            <dl className="studio-usage-grid">
              <div><dt>生成耗时</dt><dd>{generationMetrics.elapsedMs === null ? running ? '等待生成完成' : '未知' : `${(generationMetrics.elapsedMs / 1000).toFixed(1)} 秒`}</dd></div>
              <div><dt>已报告 Token</dt><dd>{generationMetrics.reportedUsageTasks ? generationMetrics.reportedTokens.toLocaleString() : '未报告'}</dd></div>
              <div><dt>已返回角色任务</dt><dd>{generationMetrics.agentTasks} 个 · {generationMetrics.reportedUsageTasks} 个含用量</dd></div>
              <div><dt>构建尝试 / 失败</dt><dd>{generationMetrics.buildAttempts} / {generationMetrics.failedBuilds}</dd></div>
            </dl>
            <p className="studio-hint">模型：{generationMetrics.models.join('、') || '未返回模型信息'}</p>
            {generationMetrics.missingUsageTasks > 0 && <p className="studio-hint">{generationMetrics.missingUsageTasks} 个已返回任务缺失用量，统计不完整。</p>}
            <p className="studio-hint">金额未计算。仅汇总 Manager/Coder 已返回结果，不包含 Tester、外部工具或未返回结果的请求。角色任务数不等于模型请求数。</p>
          </section>}
          {running && <div className="studio-progress" role="status"><Hammer size={16} />{phaseText[project?.phase || 'queued']}{current && ` · 第 ${current.round} 轮`}<button onClick={() => void cancel()} disabled={busy}><Square size={12} />取消</button></div>}
          {project?.error && <div className="studio-error" role="alert">{project.error}</div>}
          {project && ['failed', 'cancelled'].includes(project.status) && <section className="studio-tester" aria-label="重新生成作品"><h3>保留本次记录，重新生成</h3><p className="studio-hint">沿用原需求、追加修改和返修上下文，从头执行并创建新版本。点击后会重新调用模型并产生用量；原错误和记录继续保留。</p><button disabled={busy} onClick={() => void retry()}>重新生成新版本（调用模型）</button></section>}
          {ready && <section className="studio-tester" aria-label="Tester 交互检查"><h3>Tester / 沙箱内交互检查</h3><p className="studio-hint">模型生成检查，页面执行合成事件、文本和禁用状态断言。结果不替代完整浏览器测试或人工批准。</p><button disabled={busy || qaRunning || testPlans.some((plan) => ['queued', 'running'].includes(plan.status))} onClick={() => void generateTests()}>生成交互检查（调用模型）</button>{testPlans.map((plan) => <details key={plan.id}><summary>检查计划 · {plan.status} · {plan.id.slice(0, 8)}</summary>{plan.error && <p role="alert">{plan.error}</p>}{['queued', 'running'].includes(plan.status) && <button onClick={() => void cancelTests(plan.id)} disabled={busy}>取消生成检查</button>}{plan.result?.output?.checks && <><p>{plan.result.output.llmProvider} / {plan.result.output.llmModel}</p><ol>{plan.result.output.checks.map((check, index) => <li key={index}>{check.name}：{check.actions.length} 个操作 → {check.selector} 的{check.assertion === 'disabled' ? '禁用状态' : '文本'} 应为 {JSON.stringify(check.expected)}</li>)}</ol><p>覆盖限制：{plan.result.output.limitations.join('；') || '模型未列出限制，请检查计划覆盖范围。'}</p><button disabled={plan.status !== 'ready' || busy || qaRunning || plan.previewFile !== project?.previewFile} onClick={() => runChecks(plan)}>从初始页面运行检查</button></>}</details>)}{qaRunning && <p role="status">正在执行沙箱检查…</p>}{qaResults.length > 0 && <><p role="status">{qaResults.filter((result) => result.status === 'passed').length} / {qaResults.length} 项检查通过</p><ul>{qaResults.map((result, index) => <li key={index}>{result.name} · {result.status} · 实际值 {JSON.stringify(result.actual)}{result.error && <pre>{result.error}</pre>}</li>)}</ul><button disabled={busy || qaSaved} onClick={() => void saveChecks()}>{qaSaved ? '检查结果已保存' : '保存检查结果与失败证据'}</button></>}</section>}
          {ready && project && <StudioBrowserPanel key={`browser-${project.projectId}`} projectId={project.projectId} previewFile={project.previewFile} plans={testPlans} onRepaired={(id) => { navigate(`/studio/${id}`); setTab('preview'); setRefreshKey((key) => key + 1); }} />}
          {ready && project && <StudioReviewPanel key={project.projectId} project={project} reports={history.projectId === projectId ? history.reports : []} onSaved={() => setRefreshKey((key) => key + 1)} />}
          <div className="studio-tabs" role="tablist" aria-label="查看作品">
            {([{ key: 'preview', label: '试玩', icon: Play }, { key: 'source', label: '源码', icon: Code2 }, { key: 'evidence', label: '验证记录', icon: Terminal }] as const).map(({ key, label, icon: Icon }) => <button key={key} id={`studio-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="studio-panel" disabled={qaRunning} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}
            <button id="studio-tab-changes" role="tab" aria-selected={tab === 'changes'} aria-controls="studio-panel" disabled={qaRunning || !ready || !(project?.repair || project?.revision)} onClick={() => setTab('changes')}><Code2 size={15} />版本差异</button>
            <button className="studio-download" onClick={() => void download()} disabled={!ready || busy}><Download size={15} />下载源码 ZIP</button>
          </div>
          <div className="studio-panel" id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
            {tab === 'changes' && <div className="studio-changes"><h3>版本前后的实际源码</h3>{changesError && <p role="alert">{changesError}</p>}{!changes && !changesError && <p>{project?.repair || project?.revision ? '正在读取源码差异…' : '该项目没有基础版本。'}</p>}{changes && <><p>{changes.files.length} 个文件有变化，{changes.unchanged} 个文件内容未变。差异不代表功能验收通过。</p><p className="studio-hint">原项目 {changes.parentProjectId} / {changes.fromPreview} → 当前项目 {changes.projectId} / {changes.toPreview}</p>{changes.files.length === 0 && <p>源码没有变化，请复测保存的错误是否仍存在。</p>}{changes.files.map((file) => <details key={file.path} open={changes.files.length === 1}><summary>{file.path} · {{ added: '新增', removed: '删除', modified: '修改' }[file.status]}</summary><div className="studio-change-columns"><section><h4>原源码</h4><pre><code>{file.before === undefined ? '原项目没有此文件' : file.before}</code></pre></section><section><h4>当前源码</h4><pre><code>{file.after === undefined ? '返修项目已删除此文件' : file.after}</code></pre></section></div></details>)}</>}</div>}
            {tab === 'preview' && (html ? <><iframe ref={previewFrame} title="生成作品试玩" srcDoc={preview.html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /><p className="studio-preview-note">{runtimeErrors.length ? `试玩发现 ${runtimeErrors.length} 条运行异常，请查看验证记录。` : previewLoaded ? '页面已加载。请实际试玩；页面加载和编译成功不代表功能验收完成。' : '正在加载试玩页面…'}</p></> : <div className="studio-empty"><span aria-hidden="true">▦</span><h3>{running ? '团队正在制作你的作品' : project?.status === 'failed' || project?.status === 'cancelled' ? '本次运行未生成可试玩版本' : '先给团队一个创作任务'}</h3><p>{running ? '每个阶段会自动更新，完成后可以在这里试玩。' : '成功构建后，作品、源码与检查记录会出现在这里。'}</p></div>)}
            {tab === 'source' && (files.length ? <div className="studio-source"><label htmlFor="studio-file">项目文件</label><select id="studio-file" value={selectedFile?.path || ''} onChange={(event) => setFilePath(event.target.value)}>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><pre><code>{selectedFile?.content}</code></pre></div> : <div className="studio-empty"><h3>源码尚未生成</h3><p>Coder 完成后会显示实际文件内容。</p></div>)}
            {tab === 'evidence' && <div className="studio-evidence"><h3>实际执行记录</h3><article><h4>本次试玩运行诊断</h4><p>{runtimeErrors.length ? `已捕获 ${runtimeErrors.length} 条异常` : previewLoaded ? '页面曾加载，当前未捕获运行异常' : '尚未观察到页面加载'}</p>{runtimeErrors.map((message, index) => <pre key={index}>{message}</pre>)}<p className="studio-hint">实时记录刷新后清空；可保存到项目供后续查看，不代表功能测试通过。</p><button disabled={!ready || busy || (!previewLoaded && !runtimeErrors.length) || savedSnapshot === diagnosticSnapshot} onClick={() => void saveDiagnostic()}>{savedSnapshot === diagnosticSnapshot ? '当前诊断已保存' : '保存本次诊断'}</button></article><article><h4>已保存的试玩诊断</h4>{history.reports.length === 0 && <p>暂无保存记录。</p>}{history.reports.map((report) => <section key={report.id}><h5>{new Date(report.savedAt).toLocaleString()} · {report.previewFile}</h5><p>来源：浏览器客户端观察 · 页面{report.loaded ? '已加载' : '未观察到加载'} · {report.errors.length} 条异常</p>{report.errors.map((message, index) => <pre key={index}>{message}</pre>)}{report.checks && <p>检查计划 {report.testPlanId}：{report.checks.filter((check) => check.status === 'passed').length} / {report.checks.length} 项通过</p>}<button disabled={!ready || busy || !report.errors.length || report.previewFile !== project?.previewFile} onClick={() => void repair(report.id)}>依据此诊断返修</button></section>)}<p className="studio-hint">保存的是客户端观察，不是可信的自动功能测试或人工批准。</p></article>{project?.plan && <p>规划：{project.plan.status} · {project.plan.output?.llmProvider || '未调用成功'} / {project.plan.output?.llmModel || '—'}</p>}{project?.rounds.map((round) => <article key={round.round}><h4>第 {round.round} 轮</h4><p>代码生成：{round.code.status} · {round.code.output?.llmProvider || '—'} / {round.code.output?.llmModel || '—'}</p><p>实际构建：{round.build?.status || '尚未执行'}</p>{round.build?.errors.map((error, index) => <pre key={index}>{error}</pre>)}{round.build?.checkedFiles && <p>已检查文件：{round.build.checkedFiles.join('、')}</p>}{round.code.status === 'failed' && <pre>{round.code.reasoning}</pre>}</article>)}<p className="studio-hint">独立浏览器检查按 Tester 计划执行；人工决定单独记录，不改写构建和检查结果。</p>{project && <small>项目 {project.projectId}</small>}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
