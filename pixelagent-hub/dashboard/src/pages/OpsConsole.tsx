import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { recordsApi } from '@/lib/recordsApi';
import type {
  AgentRunMode,
  ApprovalRecord,
  HealthOk,
  KnowledgeStats,
  PipelineRunRecord,
  RuntimeJob,
  SessionSummary,
  WorkflowDefinition,
} from '@/types/recordsApi';

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-[11px] leading-snug overflow-auto max-h-48 bg-slate-950 border border-slate-800 rounded p-2">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export default function OpsConsole() {
  const [health, setHealth] = useState<HealthOk | null>(null);
  const [readiness, setReadiness] = useState<HealthOk | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [runtimeJobs, setRuntimeJobs] = useState<RuntimeJob[]>([]);
  const [runtimeMetrics, setRuntimeMetrics] = useState<Record<string, unknown>>({});
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<PipelineRunRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending');
  const [intelMetrics, setIntelMetrics] = useState<Record<string, number>>({});
  const [workflowId, setWorkflowId] = useState('');
  const [message, setMessage] = useState('');
  const [yamlText, setYamlText] = useState('{"version":1,"workflows":[]}');
  const [rounds, setRounds] = useState(5);
  const [improveRows, setImproveRows] = useState<Array<{ round: number; metric: number; path?: string }>>([]);
  const [historyRows, setHistoryRows] = useState<Array<{ round: number; metric: number }>>([]);
  const [scorer, setScorer] = useState<Record<string, unknown> | null>(null);
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [docsText, setDocsText] = useState('[{"title":"Sample","text":"hello"}]');
  const [eventType, setEventType] = useState('competitor.update');
  const [selectedRun, setSelectedRun] = useState<PipelineRunRecord | null>(null);
  const [jobLookupId, setJobLookupId] = useState('');
  const [jobLookupResult, setJobLookupResult] = useState<Record<string, unknown> | null>(null);
  const [runMode, setRunMode] = useState<AgentRunMode>('pipeline');
  const [runTaskJson, setRunTaskJson] = useState('{"id":"ui-demo","description":"NanoClaw smoke task","context":{}}');
  const [runAsync, setRunAsync] = useState(false);
  const [runStream, setRunStream] = useState(false);
  const [runLastOut, setRunLastOut] = useState<unknown>(null);

  const knowledgeEmbedReady = Boolean(knowledgeStats?.enabled && knowledgeStats.retriever === 'embedding');

  const reload = useCallback(async () => {
    try {
      const [h, rd, s, rm, rj, wf, r, a, im, hs, sc, hi] = await Promise.all([
        recordsApi.getHealth().catch(() => ({ ok: false } as HealthOk)),
        recordsApi.getReadiness().catch((e) => ({ ok: false, error: String(e) } as HealthOk)),
        recordsApi.listSessions(),
        recordsApi.getRuntimeMetrics(),
        recordsApi.listRuntimeJobs(30),
        recordsApi.listWorkflows(),
        recordsApi.listRuns(30),
        recordsApi.listApprovals(approvalFilter),
        recordsApi.getIntelMetrics(),
        recordsApi.getKnowledgeStats(),
        recordsApi.getRetrievalScorer(),
        recordsApi.getSelfImproveHistory(30),
      ]);
      setHealth(h);
      setReadiness(rd);
      setSessions(s.sessions || []);
      setRuntimeMetrics(rm.runtime || {});
      setRuntimeJobs(rj.jobs || []);
      setWorkflows(wf.workflows || []);
      setRuns(r.runs || []);
      setApprovals(a.approvals || []);
      setIntelMetrics(im.metrics || {});
      setKnowledgeStats(hs);
      setScorer((sc as unknown as Record<string, unknown>) || null);
      setHistoryRows(hi.history || []);
      if ((wf.workflows || []).length > 0) setWorkflowId((prev) => prev || wf.workflows![0].id);
      setMessage('');
    } catch (err) {
      setMessage(String(err));
    }
  }, [approvalFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const chartRows = useMemo(() => (improveRows.length > 0 ? improveRows : historyRows), [improveRows, historyRows]);

  const btn =
    'px-2.5 py-1 rounded text-xs border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
  const details = 'rounded border border-slate-700 bg-slate-900/80 mb-3';

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 p-4 max-w-5xl mx-auto font-sans text-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">NanoClaw</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Lightweight console · Maps 1:1 to Records API</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className={btn}>
            ← Home
          </Link>
          <Link to="/live" className={btn}>
            Live UI
          </Link>
          <button type="button" className={btn} onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </header>

      {message && <div className="text-xs text-amber-300 mb-3">{message}</div>}

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          API Status
        </summary>
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">GET /health</div>
            <JsonBlock value={health} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">GET /health/readiness</div>
            <JsonBlock value={readiness} />
          </div>
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Intelligence · workflows / trigger / reload / event
        </summary>
        <div className="px-3 pb-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  const out = await recordsApi.triggerWorkflow(workflowId);
                  setMessage(`Triggered: ${out.run?.runId || 'ok'}`);
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST /api/intelligence/trigger
            </button>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  await recordsApi.reloadWorkflows();
                  setMessage('Workflows reloaded');
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST …/workflows/reload
            </button>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  const parsed = JSON.parse(yamlText);
                  const out = await recordsApi.validateWorkflowJson(parsed);
                  setMessage(out.ok ? 'validate: ok' : `validate: ${out.error || 'fail'}`);
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST …/workflows/validate
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[11px] text-slate-500 flex flex-col gap-1">
              eventType
              <input
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs w-48"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  const out = await recordsApi.postIntelligenceEvent(eventType);
                  setMessage(`Event ${out.eventType}: matched=${out.matched}`);
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST /api/intelligence/events
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-[11px] text-slate-500 flex items-center gap-2">
              self-improve rounds
              <input
                type="number"
                min={1}
                max={20}
                className="w-14 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs"
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value) || 5)}
              />
            </label>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  const out = await recordsApi.runSelfImprove(rounds);
                  setImproveRows(out.rounds || []);
                  setMessage(`Self-improve: ${out.rounds?.length || 0} rounds`);
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST …/self-improve
            </button>
          </div>
          <textarea
            className="w-full h-20 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono"
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
          />
          {Object.keys(intelMetrics).length > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {Object.entries(intelMetrics).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {k}: <b>{String(v)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Self-improve · scorer · knowledge
        </summary>
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-slate-500 mb-1">metric trend (history or last run)</div>
            <div className="space-y-1">
              {chartRows.length === 0 && <div className="text-xs text-slate-500">No rows</div>}
              {chartRows.map((row, idx) => (
                <div className="flex items-center gap-2 text-[11px]" key={`${row.round}-${idx}`}>
                  <span className="w-8 text-slate-500">R{row.round}</span>
                  <div className="h-1.5 bg-slate-800 rounded flex-1 overflow-hidden">
                    <div
                      className="h-full bg-violet-500"
                      style={{ width: `${Math.max(0, Math.min(100, Math.round(row.metric * 100)))}%` }}
                    />
                  </div>
                  <span className="w-10 text-right">{(row.metric * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1">GET /api/knowledge/stats · GET …/retrieval-scorer</div>
            <JsonBlock value={knowledgeStats} />
            <div className="text-[10px] text-slate-500 mt-2 mb-1">scorer</div>
            <JsonBlock value={scorer} />
            {!knowledgeEmbedReady && (
              <p className="text-[11px] text-amber-300/90 mt-2">
                Index requires embedding: ENABLE_EMBEDDING_RETRIEVER + Ollama (see server .env.example).
              </p>
            )}
            <textarea
              className="w-full h-16 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono mt-2"
              value={docsText}
              onChange={(e) => setDocsText(e.target.value)}
            />
            <button
              type="button"
              className={`${btn} mt-1`}
              disabled={!knowledgeEmbedReady}
              onClick={async () => {
                try {
                  const docs = JSON.parse(docsText);
                  const out = await recordsApi.indexKnowledge(Array.isArray(docs) ? docs : []);
                  setMessage(`Indexed docs=${out.documents} chunks=${out.chunks}`);
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              POST /api/knowledge/index
            </button>
          </div>
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          POST /api/run/:mode — Classic orchestration (pipeline / parallel / debate / vote / roundtable / company)
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
              value={runMode}
              onChange={(e) => setRunMode(e.target.value as AgentRunMode)}
            >
              {(['pipeline', 'parallel', 'debate', 'vote', 'roundtable', 'company'] as const).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              <input type="checkbox" checked={runAsync} onChange={(e) => setRunAsync(e.target.checked)} />
              async=1
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              <input type="checkbox" checked={runStream} onChange={(e) => setRunStream(e.target.checked)} />
              stream=1
            </label>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                try {
                  const body = JSON.parse(runTaskJson) as Record<string, unknown>;
                  const out = await recordsApi.postRun(runMode, body, { async: runAsync, stream: runStream });
                  setRunLastOut(out);
                  setMessage(runAsync ? '202 async — poll job URL from response' : 'Run finished');
                  await reload();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              Run
            </button>
          </div>
          <textarea
            className="w-full h-28 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono"
            value={runTaskJson}
            onChange={(e) => setRunTaskJson(e.target.value)}
          />
          <div className="text-[10px] text-slate-500">Last response</div>
          <JsonBlock value={runLastOut} />
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Intelligence runs · GET /api/intelligence/runs/:runId
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <div className="max-h-52 overflow-auto space-y-1">
            {runs.map((r) => (
              <div key={r.runId} className="flex flex-wrap items-center gap-2 text-[11px] border border-slate-800 rounded px-2 py-1">
                <span className="font-mono text-slate-300">{r.runId}</span>
                <span className="text-slate-500">{r.workflowId}</span>
                <span className="text-slate-500">{r.status}</span>
                <button
                  type="button"
                  className="text-cyan-400 hover:underline"
                  onClick={async () => {
                    try {
                      const o = await recordsApi.getIntelligenceRun(r.runId);
                      setSelectedRun(o.run);
                    } catch (e) {
                      setMessage(String(e));
                    }
                  }}
                >
                  Load
                </button>
              </div>
            ))}
          </div>
          {selectedRun && (
            <div>
              <div className="text-[10px] text-slate-500 mb-1">selected run</div>
              <JsonBlock value={selectedRun} />
            </div>
          )}
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Approvals · GET /api/intelligence/approvals?status=
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <select
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)}
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="">all</option>
          </select>
          <div className="max-h-48 overflow-auto space-y-2">
            {approvals.map((a) => (
              <div key={a.approvalId} className="border border-slate-800 rounded p-2 text-[11px] space-y-1">
                <div className="font-mono">{a.approvalId}</div>
                <div className="text-slate-500">
                  {a.workflowId} · {a.status}
                </div>
                {a.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={async () => {
                        try {
                          await recordsApi.resolveApproval(a.approvalId, { decision: 'approved', operator: 'ui' });
                          await reload();
                        } catch (e) {
                          setMessage(String(e));
                        }
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={async () => {
                        try {
                          await recordsApi.resolveApproval(a.approvalId, {
                            decision: 'rejected',
                            operator: 'ui',
                            reason: 'ui',
                          });
                          await reload();
                        } catch (e) {
                          setMessage(String(e));
                        }
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Runtime jobs · GET /api/runtime/jobs/:jobId
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <JsonBlock value={runtimeMetrics} />
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono flex-1 min-w-[12rem]"
              placeholder="jobId"
              value={jobLookupId}
              onChange={(e) => setJobLookupId(e.target.value)}
            />
            <button
              type="button"
              className={btn}
              onClick={async () => {
                if (!jobLookupId.trim()) return;
                try {
                  const o = await recordsApi.getRuntimeJob(jobLookupId.trim());
                  setJobLookupResult((o.job && typeof o.job === 'object' ? o.job : {}) as Record<string, unknown>);
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              GET job
            </button>
          </div>
          {jobLookupResult != null ? <JsonBlock value={jobLookupResult} /> : null}
          <div className="max-h-40 overflow-auto space-y-1 text-[11px]">
            {runtimeJobs.map((j) => (
              <div key={j.jobId} className="border border-slate-800 rounded px-2 py-1 flex flex-wrap justify-between gap-2">
                <span className="font-mono">{j.jobId}</span>
                <span className="text-slate-500">
                  {j.mode} {j.status}
                </span>
                {(j.status === 'queued' || j.status === 'running') && (
                  <button
                    type="button"
                    className="text-red-400 hover:underline"
                    onClick={async () => {
                      try {
                        await recordsApi.cancelRuntimeJob(j.jobId);
                        await reload();
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </details>

      <details open className={details}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">
          Sessions · GET/DELETE /api/sessions/:id · GET /api/memory · GET /api/export
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            className={btn}
            onClick={async () => {
              try {
                const out = await recordsApi.exportSessionIndex();
                setMessage(`Exported → ${out.file}`);
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            GET /api/export
          </button>
          <div className="max-h-64 overflow-auto space-y-2 text-[11px]">
            {sessions.map((s) => (
              <div key={s.sessionId} className="border border-slate-800 rounded p-2 space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="font-mono">{s.sessionId}</span>
                  <Link className="text-cyan-400 hover:underline" to={`/ops/session/${encodeURIComponent(s.sessionId)}`}>
                    View
                  </Link>
                  <button
                    type="button"
                    className={btn}
                    onClick={async () => {
                      try {
                        const out = await recordsApi.exportSessionIndex(s.sessionId);
                        setMessage(`Export (scoped) → ${out.file}`);
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    export
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={async () => {
                      try {
                        const m = await recordsApi.getMemory(s.sessionId);
                        setMessage(`memory keys: ${JSON.stringify(m.memory).slice(0, 120)}…`);
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    memory
                  </button>
                  <button
                    type="button"
                    className="text-red-400/90 text-xs hover:underline"
                    onClick={async () => {
                      if (!confirm(`Delete session ${s.sessionId}?`)) return;
                      try {
                        await recordsApi.deleteSession(s.sessionId);
                        await reload();
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    delete
                  </button>
                </div>
                <div className="text-slate-500">
                  {s.status} · {s.taskDescription}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
