import type { Agent, AgentOutput, AgentStep, AgentThinking, Round, Workflow } from '@/types/agent';

type Json = Record<string, unknown>;

const AGENT_META: Record<string, { name: string; role: string; icon: string; color: string }> = {
  manager: { name: 'Manager', role: 'Planning & Decomposition', icon: '📋', color: '#38bdf8' },
  researcher: { name: 'Researcher', role: 'Research & Facts', icon: '🔍', color: '#a78bfa' },
  writer: { name: 'Writer', role: 'Drafting', icon: '✍️', color: '#34d399' },
  senior_editor: { name: 'Senior Editor', role: 'Review', icon: '📝', color: '#fbbf24' },
  director: { name: 'Director', role: 'Final Review', icon: '🎬', color: '#f472b6' },
  reviewer: { name: 'Reviewer', role: 'QA', icon: '✅', color: '#fb923c' },
  coder: { name: 'Engineer', role: 'Implementation', icon: '💻', color: '#22d3ee' },
  moderator: { name: 'Moderator', role: 'Facilitation', icon: '🎤', color: '#94a3b8' },
};

function metaFor(id: string) {
  return AGENT_META[id] || { name: id, role: 'Agent', icon: '🤖', color: '#94a3b8' };
}

function parseTime(iso?: string): number {
  if (!iso || typeof iso !== 'string') return Date.now();
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function truncate(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n... (truncated)`;
}

function stepsFromReasoning(agentId: string, reasoning?: string): AgentStep[] {
  const raw = typeof reasoning === 'string' ? reasoning.trim() : '';
  if (!raw) {
    return [
      {
        id: `${agentId}-s1`,
        title: 'Complete',
        description: 'Written to session record',
        status: 'completed',
        timestamp: Date.now(),
      },
    ];
  }
  return raw.split('\n').slice(0, 12).map((line, i) => ({
    id: `${agentId}-s${i}`,
    title: `Step ${i + 1}`,
    description: line.slice(0, 240),
    status: 'completed' as const,
    timestamp: Date.now() - (12 - i) * 1000,
  }));
}

function thinkingFor(agentId: string, reasoning?: string): AgentThinking {
  return {
    agentId,
    steps: stepsFromReasoning(agentId, reasoning),
    rawThoughts: typeof reasoning === 'string' ? reasoning : '',
  };
}

function makeAgent(
  id: string,
  connections: string[],
  outputs: AgentOutput[],
  reasoning?: string
): Agent {
  const m = metaFor(id);
  return {
    id,
    name: m.name,
    role: m.role,
    icon: m.icon,
    color: m.color,
    status: 'done',
    statusMessage: 'Restored from Records',
    progress: 100,
    outputs,
    thinking: thinkingFor(id, reasoning),
    position: { x: 0, y: 0 },
    connections,
  };
}

function msg(id: string, agentId: string, content: string, ts: number, type: AgentOutput['type'] = 'output'): AgentOutput {
  return { id, agentId, content: truncate(content), timestamp: ts, type };
}

function asObj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}

function companySessionToWorkflow(session: Json): Workflow {
  const sessionId = String(session.sessionId || 'session');
  const task = asObj(session.task);
  const desc = typeof task?.description === 'string' ? task.description : 'Records session';
  const startedAt = parseTime(typeof session.startedAt === 'string' ? session.startedAt : undefined);
  const rounds: Round[] = [];

  const plan = asObj(session.plan);
  const research = asObj(session.research);
  const planOut = plan ? asObj(plan.output) : null;
  const researchOut = research ? asObj(research.output) : null;
  const planText =
    planOut && typeof planOut.project === 'string'
      ? `Project: ${planOut.project}\n\n${JSON.stringify(planOut.plan ?? planOut, null, 2)}`
      : JSON.stringify(plan?.output ?? plan ?? {}, null, 2);
  const researchText =
    researchOut && typeof researchOut.summary === 'string'
      ? `${researchOut.summary}\n\nKey Points:\n${(Array.isArray(researchOut.keyPoints) ? researchOut.keyPoints : [])
          .map((x) => `- ${String(x)}`)
          .join('\n')}`
      : JSON.stringify(research?.output ?? research ?? {}, null, 2);

  const r1Messages: AgentOutput[] = [];
  if (plan) {
    r1Messages.push(msg('m-plan', 'manager', planText, startedAt + 1));
  }
  if (research) {
    r1Messages.push(msg('m-res', 'researcher', researchText, startedAt + 2));
  }
  const r1Agents: Agent[] = [];
  if (plan) {
    r1Agents.push(makeAgent('manager', research ? ['researcher'] : [], r1Messages.filter((m) => m.agentId === 'manager'), typeof plan.reasoning === 'string' ? plan.reasoning : undefined));
  }
  if (research) {
    r1Agents.push(
      makeAgent(
        'researcher',
        [],
        r1Messages.filter((m) => m.agentId === 'researcher'),
        typeof research.reasoning === 'string' ? research.reasoning : undefined
      )
    );
  }
  if (r1Agents.length > 0) {
    rounds.push({
      id: 'round-plan-research',
      roundNumber: rounds.length + 1,
      agents: r1Agents,
      messages: r1Messages,
      timestamp: startedAt,
      status: 'completed',
    });
  }

  const drafts = Array.isArray(session.drafts) ? session.drafts : [];
  const reviews = Array.isArray(session.reviews) ? session.reviews : [];
  const n = Math.max(drafts.length, reviews.length);
  for (let i = 0; i < n; i++) {
    const d = drafts[i];
    const rv = reviews[i];
    const dObj = asObj(d);
    const rObj = asObj(rv);
    const dOut = dObj ? asObj(dObj.output) : null;
    const draftContent =
      dOut && typeof dOut.content === 'string'
        ? String(dOut.title || 'Draft') + '\n\n' + dOut.content
        : JSON.stringify(dObj?.output ?? dObj ?? {}, null, 2);
    const reviewContent = rObj
      ? typeof rObj.reasoning === 'string'
        ? rObj.reasoning
        : JSON.stringify(rObj.output ?? rObj, null, 2)
      : '';
    const meta = dObj ? asObj(dObj.metadata as unknown) : null;
    const t0 = parseTime(typeof meta?.executedAt === 'string' ? meta.executedAt : undefined) || startedAt + 1000 * (i + 1);
    const messages: AgentOutput[] = [];
    if (dObj) {
      messages.push(msg(`draft-${i}`, 'writer', draftContent, t0));
    }
    if (rObj) {
      messages.push(msg(`review-${i}`, 'senior_editor', reviewContent, t0 + 1));
    }
    const agents: Agent[] = [];
    if (dObj) {
      agents.push(
        makeAgent('writer', rObj ? ['senior_editor'] : [], messages.filter((m) => m.agentId === 'writer'), typeof dObj.reasoning === 'string' ? dObj.reasoning : undefined)
      );
    }
    if (rObj) {
      agents.push(
        makeAgent(
          'senior_editor',
          [],
          messages.filter((m) => m.agentId === 'senior_editor'),
          typeof rObj.reasoning === 'string' ? rObj.reasoning : undefined
        )
      );
    }
    if (agents.length > 0) {
      rounds.push({
        id: `round-draft-${i + 1}`,
        roundNumber: rounds.length + 1,
        agents,
        messages,
        timestamp: t0,
        status: 'completed',
      });
    }
  }

  const finalReview = asObj(session.finalReview);
  if (finalReview) {
    const frOut = asObj(finalReview.output);
    const finalText =
      typeof finalReview.reasoning === 'string'
        ? finalReview.reasoning
        : JSON.stringify(frOut ?? finalReview, null, 2);
    const messages = [msg('final-dir', 'director', finalText, parseTime(session.finishedAt as string) || Date.now())];
    rounds.push({
      id: 'round-final',
      roundNumber: rounds.length + 1,
      agents: [makeAgent('director', [], messages, typeof finalReview.reasoning === 'string' ? finalReview.reasoning : undefined)],
      messages,
      timestamp: parseTime(session.finishedAt as string),
      status: 'completed',
    });
  }

  if (rounds.length === 0) {
    rounds.push({
      id: 'round-fallback',
      roundNumber: 1,
      agents: [
        makeAgent('researcher', [], [msg('fb', 'researcher', desc, startedAt)], 'No structured phase data, showing task description only'),
      ],
      messages: [msg('fb', 'researcher', desc, startedAt)],
      timestamp: startedAt,
      status: (session.status === 'failed' ? 'error' : 'completed') as Round['status'],
    });
  }

  const mode = typeof session.mode === 'string' ? session.mode : 'company';
  return {
    id: sessionId,
    name: `${mode} · ${sessionId.slice(0, 24)}`,
    description: desc,
    rounds,
    currentRound: rounds.length,
  };
}

function roundtableSessionToWorkflow(session: Json): Workflow {
  const sessionId = String(session.sessionId || 'session');
  const task = asObj(session.task);
  const desc = typeof task?.description === 'string' ? task.description : 'Roundtable session';
  const trace = asObj(session.trace);
  const conv = trace && Array.isArray(trace.conversation) ? (trace.conversation as unknown[]) : [];
  const byRound = new Map<number, Json[]>();
  for (const turn of conv) {
    const t = asObj(turn);
    if (!t) continue;
    const r = Number(t.round) || 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(t);
  }
  const sortedRounds = [...byRound.keys()].sort((a, b) => a - b);
  const rounds: Round[] = [];
  let idx = 0;
  for (const r of sortedRounds) {
    idx += 1;
    const turns = byRound.get(r) || [];
    const speakerIds = [...new Set(turns.map((t) => String(t.speakerId || 'agent')))];
    const messages: AgentOutput[] = [];
    const agents: Agent[] = [];
    for (const t of turns) {
      const sid = String(t.speakerId || 'agent');
      const text = typeof t.message === 'string' ? t.message : JSON.stringify(t);
      const ts = parseTime(typeof t.timestamp === 'string' ? t.timestamp : undefined);
      messages.push(msg(`rt-${r}-${sid}-${messages.length}`, sid, text, ts));
    }
    for (let i = 0; i < speakerIds.length; i++) {
      const sid = speakerIds[i];
      const next = speakerIds[i + 1];
      const m = metaFor(sid);
      agents.push({
        id: sid,
        name: m.name,
        role: m.role,
        icon: m.icon,
        color: m.color,
        status: 'done',
        statusMessage: `Round ${r}`,
        progress: 100,
        outputs: messages.filter((x) => x.agentId === sid),
        thinking: thinkingFor(sid),
        position: { x: 0, y: 0 },
        connections: next ? [next] : [],
      });
    }
    if (agents.length === 0 && turns.length) {
      const sid = String(asObj(turns[0])?.speakerId || 'agent');
      agents.push(makeAgent(sid, [], messages));
    }
    rounds.push({
      id: `rt-${r}`,
      roundNumber: idx,
      agents,
      messages,
      timestamp: messages[0]?.timestamp || Date.now(),
      status: 'completed',
    });
  }
  if (rounds.length === 0) {
    return companySessionToWorkflow(session);
  }
  return {
    id: sessionId,
    name: `roundtable · ${sessionId.slice(0, 24)}`,
    description: desc,
    rounds,
    currentRound: rounds.length,
  };
}

/**
 * 将 Records API 返回的 `session.json` 映射为像素工作流 UI 所需的 {@link Workflow}。
 * 优先支持 company 与 roundtable 落盘结构，其它模式回退为最小单轮视图。
 */
export function sessionJsonToWorkflow(session: Record<string, unknown>): Workflow {
  const s = session as Json;
  if (Array.isArray(s.drafts) || s.plan || s.research) {
    return companySessionToWorkflow(s);
  }
  const trace = asObj(s.trace);
  if (trace && Array.isArray(trace.conversation) && trace.conversation.length > 0) {
    return roundtableSessionToWorkflow(s);
  }
  return companySessionToWorkflow(s);
}
