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
  return <figure>{url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name === 'initial.png' ? '浏览器检查前截图' : '浏览器检查后截图'} /></a>}<figcaption>{name === 'initial.png' ? '检查前' : '检查后'}{error && ` · ${error}`}</figcaption></figure>;
}

export default function StudioBrowserPanel({ projectId, previewFile, plans }: { projectId: string; previewFile?: string; plans: StudioTestPlan[] }) {
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
  return <section className="studio-tester" aria-label="独立浏览器验证"><h3>独立浏览器验证</h3><p className="studio-hint">服务端使用临时 Chromium 浏览器执行真实点击、输入和按键，保存截图与异常。检查范围由 Tester 计划决定，人工验收仍需单独进行。</p>{state && !state.enabled && <p>服务端尚未启用。请按 docs/software-studio/browser-verification.md 配置浏览器。</p>}{error && <p role="alert">{error}</p>}{state?.enabled && plans.filter((plan) => plan.status === 'ready' && plan.previewFile === previewFile).map((plan) => <button key={plan.id} disabled={busy || active} onClick={() => void perform(() => studioApi.startBrowserRun(projectId, plan.id))}>运行独立浏览器检查 · {plan.id.slice(0, 8)}</button>)}{state?.enabled && !plans.some((plan) => plan.status === 'ready' && plan.previewFile === previewFile) && <p>请先生成当前版本的 Tester 检查计划。</p>}{state?.runs.map((run) => <details key={run.id} onToggle={(event) => { if (event.currentTarget.open) setExpanded(run.id); else setExpanded((current) => current === run.id ? null : current); }}><summary>{run.status} · {new Date(run.startedAt).toLocaleString()} · {run.id.slice(0, 8)}</summary><p>来源：服务端浏览器 · Chromium {run.browserVersion || '尚未启动'} · {run.checks.filter((check) => check.status === 'passed').length}/{run.checks.length} 项通过</p><p>预览 SHA-256：<code>{run.previewHash}</code></p>{run.error && <pre>{run.error}</pre>}{run.errors.map((error, index) => <pre key={index}>{error}</pre>)}{run.blockedRequests.length > 0 && <p>已阻断 {run.blockedRequests.length} 个网络请求，检查失败。</p>}<ul>{run.checks.map((check, index) => <li key={index}>{check.name} · {check.status} · 实际 {JSON.stringify(check.actual)}{check.error && <pre>{check.error}</pre>}</li>)}</ul>{['queued', 'running'].includes(run.status) && <button disabled={busy} onClick={() => void perform(() => studioApi.cancelBrowserRun(projectId, run.id))}>取消浏览器检查</button>}<div className="studio-browser-screenshots">{expanded === run.id && run.screenshots.map((name) => <Screenshot key={name} projectId={projectId} runId={run.id} name={name} />)}</div></details>)}</section>;
}
