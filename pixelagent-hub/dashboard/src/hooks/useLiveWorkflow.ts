import { useCallback, useEffect, useRef, useState } from 'react';
import { recordsApi, sessionFileUrl } from '@/lib/recordsApi';
import { sessionJsonToWorkflow } from '@/lib/sessionToWorkflow';
import type { AgentOutput, Workflow } from '@/types/agent';
import type { SessionAttachment, SessionSummary } from '@/types/recordsApi';

export type LiveRunPayload = Record<string, unknown> | null;

/**
 * 从 Records API 加载会话并映射为 {@link Workflow}；可选触发再次 `company` 运行。
 * 支持在保持「一人公司」同一 task 基线下的补充说明与附件上传。
 */
export function useLiveWorkflow(sessionId: string | undefined) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runPayload, setRunPayload] = useState<LiveRunPayload>(null);
  const baselinePayloadRef = useRef<LiveRunPayload>(null);
  const [pendingUserOutputs, setPendingUserOutputs] = useState<AgentOutput[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSessions = useCallback(async () => {
    try {
      const r = await recordsApi.listSessions();
      setSessions(r.sessions || []);
    } catch (e) {
      setSessions([]);
      setError(String(e));
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    setPendingUserOutputs([]);
    try {
      const r = await recordsApi.getSession(id);
      const session = (r.session || {}) as Record<string, unknown>;
      setWorkflow(sessionJsonToWorkflow(session));
      const task = session.task as Record<string, unknown> | undefined;
      if (task && typeof task.description === 'string') {
        const payload = {
          id: String(task.id || `live-${Date.now()}`),
          description: task.description,
          type: task.type ?? 'content_delivery',
          context: (task.context as Record<string, unknown>) || {},
        };
        setRunPayload(payload);
        baselinePayloadRef.current = payload;
      } else {
        setRunPayload(null);
        baselinePayloadRef.current = null;
      }
    } catch (e) {
      setError(String(e));
      setWorkflow(null);
      setRunPayload(null);
      baselinePayloadRef.current = null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSessions();
  }, [reloadSessions]);

  useEffect(() => {
    if (!sessionId) {
      setWorkflow(null);
      setRunPayload(null);
      baselinePayloadRef.current = null;
      setPendingUserOutputs([]);
      return;
    }
    void loadSession(sessionId);
  }, [sessionId, loadSession]);

  const refresh = useCallback(async () => {
    await reloadSessions();
    if (sessionId) await loadSession(sessionId);
  }, [reloadSessions, loadSession, sessionId]);

  const triggerCompanyRun = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!runPayload) {
      const message = 'Session missing task field, cannot re-run company mode from UI';
      setError(message);
      return { ok: false, message };
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await recordsApi.postRun('company', runPayload, { async: true });
      await reloadSessions();
      return { ok: true };
    } catch (e) {
      const message = String(e);
      setError(message);
      return { ok: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }, [runPayload, reloadSessions]);

  const submitCompanyFollowUp = useCallback(
    async (text: string, files: File[]): Promise<{ ok: boolean; message?: string }> => {
      if (!sessionId) {
        const message = 'Please select a session first';
        setError(message);
        return { ok: false, message };
      }
      const base = baselinePayloadRef.current || runPayload;
      if (!base) {
        const message = 'Session missing task, cannot submit follow-up request';
        setError(message);
        return { ok: false, message };
      }
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) {
        const message = 'Please enter text or select files';
        setError(message);
        return { ok: false, message };
      }

      setIsSubmitting(true);
      setError(null);
      try {
        let uploaded: SessionAttachment[] = [];
        if (files.length > 0) {
          const up = await recordsApi.uploadSessionAttachments(sessionId, files);
          uploaded = up.attachments || [];
        }

        const baseDesc = String((base as Record<string, unknown>).description || '');
        const fileLines = uploaded.map(
          (a) => `- ${a.name} (${a.mime}): ${sessionFileUrl(sessionId, a.id)}`,
        );
        const appendix =
          trimmed && uploaded.length
            ? `\n\n[User Supplement]\n${trimmed}\n\nAttachments (referenceable URLs):\n${fileLines.join('\n')}\n`
            : trimmed
              ? `\n\n[User Supplement]\n${trimmed}\n`
              : uploaded.length
                ? `\n\n[User Supplement — Attachments]\n${fileLines.join('\n')}\n`
                : '';

        const payload = {
          ...base,
          description: `${baseDesc}${appendix}`,
          context: {
            ...((base as Record<string, unknown>).context as Record<string, unknown> | undefined),
            uiSupplement: {
              at: new Date().toISOString(),
              text: trimmed,
              attachments: uploaded.map((a) => ({
                id: a.id,
                name: a.name,
                mime: a.mime,
                path: a.path,
              })),
            },
          },
        };

        await recordsApi.postRun('company', payload, { async: true });

        const userMsg: AgentOutput = {
          id: `user-${Date.now()}`,
          agentId: 'user',
          role: 'user',
          content: trimmed || '(Files uploaded)',
          timestamp: Date.now(),
          type: 'info',
          attachments: uploaded.map((a) => ({
            id: a.id,
            name: a.name,
            mime: a.mime,
            url: sessionFileUrl(sessionId, a.id),
          })),
        };
        setPendingUserOutputs((prev) => [...prev, userMsg]);
        await reloadSessions();
        return { ok: true };
      } catch (e) {
        const message = String(e);
        setError(message);
        return { ok: false, message };
      } finally {
        setIsSubmitting(false);
      }
    },
    [sessionId, runPayload, reloadSessions],
  );

  return {
    sessions,
    workflow,
    runPayload,
    pendingUserOutputs,
    isLoading,
    isSubmitting,
    error,
    setError,
    reloadSessions,
    loadSession,
    refresh,
    triggerCompanyRun,
    submitCompanyFollowUp,
  };
}
