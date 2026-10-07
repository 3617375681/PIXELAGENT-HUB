import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { realAgents } from "@/data/realAgents";
import type { Workflow } from "@/types/agent";
import { recordsApi } from "@/lib/recordsApi";
import { sessionJsonToWorkflow } from "@/lib/sessionToWorkflow";
import { resolveRunSession } from "@/lib/runSession";

const SESSION_KEY = "pa.home.sessionId";

export function useWorkflowData() {
  const [roundIndex, setRoundIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runStatus, setRunStatus] = useState("Ready");
  const [demoMode, setDemoMode] = useState(false);
  const [restoredWorkflow, setRestoredWorkflow] = useState<Workflow | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const jobRef = useRef<string | null>(null);

  const baseWorkflow = useMemo<Workflow>(() => ({
    id: "company-console",
    name: "Company console (8 agents)",
    description: "Research → Draft → Review → Final review",
    currentRound: 1,
    rounds: [{
      id: "round-1", roundNumber: 1, status: "completed", timestamp: Date.now(),
      agents: realAgents.map((a) => ({ ...a, status: "idle", progress: 0, statusMessage: "Waiting..." })),
      messages: [],
    }],
  }), []);

  const loadSession = useCallback((session: Record<string, unknown>) => {
    const workflow = sessionJsonToWorkflow(session);
    if (!workflow.rounds.length) throw new Error("Session has no workflow stages");
    setRestoredWorkflow(workflow);
    setRoundIndex(0);
    if (typeof session.sessionId === "string") localStorage.setItem(SESSION_KEY, session.sessionId);
    const demo = JSON.stringify(session).includes('"llmProvider":"mock"') || JSON.stringify(session).includes('"generatedBy":"mock"');
    const status = session.status === "failed"
      ? `Run failed: ${String(session.error || "Review rejected")}`
      : session.status === "cancelled" ? "Run cancelled" : "Session loaded";
    setRunStatus(`${demo ? "DEMO / MOCK — " : ""}${status}`);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (sessionId) {
      void recordsApi.getSession(sessionId, { signal: controller.signal })
        .then(({ session }) => { if (!controller.signal.aborted) loadSession(session); })
        .catch((error) => { if (!controller.signal.aborted) setRunStatus(`Restore failed: ${error.message}`); });
    }
    return () => { controller.abort(); controllerRef.current?.abort(); };
  }, [loadSession]);

  const runWorkflow = useCallback(async (prompt?: string): Promise<void> => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;
    setRunning(true);
    setLoading(true);
    setRunStatus(`${demoMode ? "DEMO / MOCK — " : ""}Submitting request to Records API...`);
    setRestoredWorkflow(null);
    setRoundIndex(0);
    try {
      const raw = await recordsApi.postRun("company", {
        id: `task-${Date.now()}`,
        description: prompt?.trim() || "Research and draft a social media content plan for a coffee shop.",
        type: "content_delivery",
        demo: demoMode,
        context: { source: "console" },
      }, { async: true, signal });
      const response = raw as Record<string, unknown>;
      let result = response;
      if (typeof response.jobId === "string") {
        jobRef.current = response.jobId;
        for (;;) {
          signal.throwIfAborted();
          const { job } = await recordsApi.getRuntimeJob(response.jobId, { signal });
          setRunStatus(`${demoMode ? "DEMO / MOCK — " : ""}Run ${String(job.status)}...`);
          if (job.status === "failed" || job.status === "cancelled") {
            if (typeof job.sessionId === "string") {
              const { session } = await recordsApi.getSession(job.sessionId, { signal });
              signal.throwIfAborted();
              loadSession(session);
            }
            throw new Error(String(job.error || job.status));
          }
          if (job.status === "succeeded") {
            if (!job.runResult || typeof job.runResult !== "object") throw new Error("Successful job has no result");
            result = job.runResult as Record<string, unknown>;
            break;
          }
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(signal.reason); };
            const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
            signal.addEventListener("abort", abort, { once: true });
          });
        }
      }
      const session = await resolveRunSession(result, (id) => recordsApi.getSession(id, { signal }));
      signal.throwIfAborted();
      loadSession(session);
      if (result.status === "failed") throw new Error("Content was rejected; inspect the review and revise the task");
    } catch (error) {
      if (!signal.aborted) setRunStatus(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        jobRef.current = null;
        setRunning(false);
        setLoading(false);
      }
    }
  }, [loadSession, demoMode]);

  const resetWorkflow = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (jobRef.current) void recordsApi.cancelRuntimeJob(jobRef.current).catch((error) => setRunStatus(`Cancellation failed: ${error.message}`));
    jobRef.current = null;
    setRestoredWorkflow(null);
    setRoundIndex(0);
    setRunning(false);
    setLoading(false);
    localStorage.removeItem(SESSION_KEY);
    setRunStatus("Ready");
  }, []);

  const workflow = restoredWorkflow || baseWorkflow;
  return {
    workflows: [], workflow, currentWorkflowId: 0, currentRoundIndex: roundIndex,
    isRunning: running, activeAgentId: null, isLoading: loading, runStatus,
    demoMode, setDemoMode,
    selectWorkflow: resetWorkflow, runWorkflow, resetWorkflow,
    nextRound: () => setRoundIndex((i) => Math.min(i + 1, workflow.rounds.length - 1)),
    prevRound: () => setRoundIndex((i) => Math.max(i - 1, 0)),
  };
}
