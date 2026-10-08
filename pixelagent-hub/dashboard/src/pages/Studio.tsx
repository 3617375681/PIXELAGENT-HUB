import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Code2, Download, Hammer, Play, RefreshCw, Square, Terminal } from 'lucide-react';
import { studioApi } from '../lib/recordsApi';
import type { StudioDiagnostic, StudioProject, StudioSummary } from '../types/studio';
import { prepareStudioPreview, readPreviewMessage } from '../lib/studioPreview';
import './Studio.css';

const statusText = { queued: '排队中', running: '团队工作中', ready_for_review: '构建完成 · 等待验收', failed: '运行失败', cancelled: '已取消' };
const phaseText: Record<string, string> = { queued: '等待执行', planning: 'Manager 正在规划', coding: 'Coder 正在生成源码', building: '正在实际编译', ready_for_review: '可以试玩与检查', failed: '执行已停止', cancelled: '执行已取消' };
const defaultDescription = '制作像素贪吃蛇：方向键移动，包含计分、暂停/继续、重新开始和游戏结束状态。开始时暂停，提供运行说明。';

export default function Studio() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [description, setDescription] = useState(defaultDescription);
  const [projects, setProjects] = useState<StudioSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [html, setHtml] = useState('');
  const [filePath, setFilePath] = useState('index.html');
  const [tab, setTab] = useState<'preview' | 'source' | 'evidence'>('preview');
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
  }, [html]);

  useEffect(() => {
    setRuntimeErrors([]); setPreviewLoaded(false); setSavedSnapshot('');
    const receive = (event: MessageEvent) => {
      const message = readPreviewMessage(event, previewFrame.current?.contentWindow || null, preview.nonce);
      if (message?.kind === 'loaded') setPreviewLoaded(true);
      if (message?.kind === 'error') setRuntimeErrors((errors) => errors.length < 20 ? [...errors, message.message] : errors);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [preview]);

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
  const diagnosticSnapshot = JSON.stringify({ previewFile: project?.previewFile, loaded: previewLoaded, errors: runtimeErrors });
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const create = () => action(async () => {
    const accepted = await studioApi.create(description.trim());
    navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
  });
  const cancel = () => action(async () => {
    if (!projectId) return;
    const result = await studioApi.cancel(projectId); setProject(result.project); setRefreshKey((key) => key + 1);
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
  });
  const repair = (diagnosticId: string) => action(async () => {
    if (!projectId) return;
    const accepted = await studioApi.repair(projectId, diagnosticId);
    navigate(`/studio/${accepted.projectId}`); setTab('preview'); setRefreshKey((key) => key + 1);
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
            {projects.map((item) => <Link key={item.projectId} to={`/studio/${item.projectId}`} className={`studio-project-link ${projectId === item.projectId ? 'selected' : ''}`}><strong>{item.description}</strong><small>{item.repair ? '返修 · ' : ''}{statusText[item.status]}</small></Link>)}
          </section>
        </aside>
        <section className="studio-workspace" aria-label="作品工作区">
          {error && <div className="studio-error" role="alert">{error}<button onClick={() => setRefreshKey((key) => key + 1)}>重试</button></div>}
          <div className="studio-workspace-heading"><div><span className="studio-kicker">WORKSPACE</span><h2>{project?.plan?.output?.projectName || (project ? '正在准备你的项目' : '你的作品，从这里开始')}</h2></div>{project && <span className={`studio-status ${project.status}`} role="status">{statusText[project.status]}</span>}</div>
          {project && <details className="studio-requirements"><summary>本次需求</summary><p>{project.description}</p></details>}
          {project?.repair && <p className="studio-hint">本次依据保存的运行诊断返修。<Link to={`/studio/${project.repair.parentProjectId}`}>查看原项目</Link> · 诊断 {project.repair.diagnosticId}。构建通过后仍需复测。</p>}
          <ol className="studio-team" aria-label="团队执行阶段">
            {[{ icon: '▤', name: 'Manager', detail: '需求与规划', done: project?.plan?.status === 'success', active: project?.phase === 'planning' }, { icon: '⌘', name: 'Coder', detail: '生成真实源码', done: current?.code.status === 'success', active: project?.phase === 'coding' }, { icon: '▣', name: 'Builder', detail: '编译与错误返修', done: current?.build?.status === 'passed', active: project?.phase === 'building' }].map((agent) => <li key={agent.name} className={agent.active ? 'active' : agent.done ? 'done' : ''}><span className="studio-agent-icon">{agent.icon}</span><div><strong>{agent.name}</strong><small>{agent.detail}</small></div><span className="studio-agent-state">{agent.active ? '工作中' : agent.done ? '完成' : '等待'}</span></li>)}
          </ol>
          {running && <div className="studio-progress" role="status"><Hammer size={16} />{phaseText[project?.phase || 'queued']}{current && ` · 第 ${current.round} 轮`}<button onClick={() => void cancel()} disabled={busy}><Square size={12} />取消</button></div>}
          {project?.error && <div className="studio-error" role="alert">{project.error}</div>}
          <div className="studio-tabs" role="tablist" aria-label="查看作品">
            {([{ key: 'preview', label: '试玩', icon: Play }, { key: 'source', label: '源码', icon: Code2 }, { key: 'evidence', label: '验证记录', icon: Terminal }] as const).map(({ key, label, icon: Icon }) => <button key={key} id={`studio-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="studio-panel" onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}
            <button className="studio-download" onClick={() => void download()} disabled={!ready || busy}><Download size={15} />下载源码 ZIP</button>
          </div>
          <div className="studio-panel" id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
            {tab === 'preview' && (html ? <><iframe ref={previewFrame} title="生成作品试玩" srcDoc={preview.html} sandbox="allow-scripts" referrerPolicy="no-referrer" /><p className="studio-preview-note">{runtimeErrors.length ? `试玩发现 ${runtimeErrors.length} 条运行异常，请查看验证记录。` : previewLoaded ? '页面已加载。请实际试玩；页面加载和编译成功不代表功能验收完成。' : '正在加载试玩页面…'}</p></> : <div className="studio-empty"><span aria-hidden="true">▦</span><h3>{running ? '团队正在制作你的作品' : project?.status === 'failed' || project?.status === 'cancelled' ? '本次运行未生成可试玩版本' : '先给团队一个创作任务'}</h3><p>{running ? '每个阶段会自动更新，完成后可以在这里试玩。' : '成功构建后，作品、源码与检查记录会出现在这里。'}</p></div>)}
            {tab === 'source' && (files.length ? <div className="studio-source"><label htmlFor="studio-file">项目文件</label><select id="studio-file" value={selectedFile?.path || ''} onChange={(event) => setFilePath(event.target.value)}>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><pre><code>{selectedFile?.content}</code></pre></div> : <div className="studio-empty"><h3>源码尚未生成</h3><p>Coder 完成后会显示实际文件内容。</p></div>)}
            {tab === 'evidence' && <div className="studio-evidence"><h3>实际执行记录</h3><article><h4>本次试玩运行诊断</h4><p>{runtimeErrors.length ? `已捕获 ${runtimeErrors.length} 条异常` : previewLoaded ? '页面曾加载，当前未捕获运行异常' : '尚未观察到页面加载'}</p>{runtimeErrors.map((message, index) => <pre key={index}>{message}</pre>)}<p className="studio-hint">实时记录刷新后清空；可保存到项目供后续查看，不代表功能测试通过。</p><button disabled={!ready || busy || (!previewLoaded && !runtimeErrors.length) || savedSnapshot === diagnosticSnapshot} onClick={() => void saveDiagnostic()}>{savedSnapshot === diagnosticSnapshot ? '当前诊断已保存' : '保存本次诊断'}</button></article><article><h4>已保存的试玩诊断</h4>{history.reports.length === 0 && <p>暂无保存记录。</p>}{history.reports.map((report) => <section key={report.id}><h5>{new Date(report.savedAt).toLocaleString()} · {report.previewFile}</h5><p>来源：浏览器客户端观察 · 页面{report.loaded ? '已加载' : '未观察到加载'} · {report.errors.length} 条异常</p>{report.errors.map((message, index) => <pre key={index}>{message}</pre>)}<button disabled={!ready || busy || !report.errors.length || report.previewFile !== project?.previewFile} onClick={() => void repair(report.id)}>依据此诊断返修</button></section>)}<p className="studio-hint">保存的是客户端观察，不是可信的自动功能测试或人工批准。</p></article>{project?.plan && <p>规划：{project.plan.status} · {project.plan.output?.llmProvider || '未调用成功'} / {project.plan.output?.llmModel || '—'}</p>}{project?.rounds.map((round) => <article key={round.round}><h4>第 {round.round} 轮</h4><p>代码生成：{round.code.status} · {round.code.output?.llmProvider || '—'} / {round.code.output?.llmModel || '—'}</p><p>实际构建：{round.build?.status || '尚未执行'}</p>{round.build?.errors.map((error, index) => <pre key={index}>{error}</pre>)}{round.build?.checkedFiles && <p>已检查文件：{round.build.checkedFiles.join('、')}</p>}{round.code.status === 'failed' && <pre>{round.code.reasoning}</pre>}</article>)}<p className="studio-hint">浏览器自动验收与人工批准尚未接入，此处不会显示虚构的测试通过记录。</p>{project && <small>项目 {project.projectId}</small>}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
