import { useState, useCallback, useRef, useMemo } from "react";
import { mockAgents } from "@/data/mockData";
import type { Agent, AgentOutput, AgentStatus, AgentStep, Round } from "@/types/agent";
import { recordsApi } from "@/lib/recordsApi";
import { sessionJsonToWorkflow } from "@/lib/sessionToWorkflow";

/** Compute DAG depth for each agent */
function computeDepths(agents: Array<{ id: string; connections: string[] }>): Record<string, number> {
  const depths: Record<string, number> = {};
  agents.forEach((a) => (depths[a.id] = 0));

  const inDegree: Record<string, number> = {};
  agents.forEach((a) => (inDegree[a.id] = 0));
  agents.forEach((a) => a.connections.forEach((tid: string) => inDegree[tid]++));

  const queue = agents.filter((a) => inDegree[a.id] === 0).map((a) => a.id);
  queue.forEach((id) => (depths[id] = 0));

  while (queue.length) {
    const curId = queue.shift()!;
    const cur = agents.find((a) => a.id === curId)!;
    cur.connections.forEach((childId: string) => {
      depths[childId] = Math.max(depths[childId], depths[curId] + 1);
      inDegree[childId]--;
      if (inDegree[childId] === 0) queue.push(childId);
    });
  }
  return depths;
}

export function useWorkflowData() {
  const [roundIndex, setRoundIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Simulated agent states for local state machine (key = agentId)
  const [simStates, setSimStates] = useState<
    Record<string, { status: AgentStatus; progress: number; stepIdx: number }>
  >({});
  // Dynamic messages populated by real API or simulation
  const [dynamicMessages, setDynamicMessages] = useState<AgentOutput[]>([]);
  // Dynamic rounds from real API response
  const [dynamicRounds, setDynamicRounds] = useState<Round[] | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Static fallback workflow with agents but no messages initially
  const baseWorkflow = useMemo(
    () => ({
      id: "fallback",
      name: "Pixel Weather App",
      description: "Build a pixel-style React weather dashboard",
      currentRound: 1,
      totalRounds: 1,
      rounds: [
        {
          id: "round-1",
          roundNumber: 1,
          status: "completed" as const,
          timestamp: Date.now(),
          agents: mockAgents.map((a) => ({ ...a, status: "idle" as const, progress: 0, statusMessage: "Waiting..." })),
          messages: [] as AgentOutput[],
        },
      ],
    }),
    [],
  );

  // Build display workflow: prefer real API data, then simulation state, then base
  const displayWorkflow = useMemo(() => {
    // If we have real API rounds, use them
    if (dynamicRounds) {
      return {
        ...baseWorkflow,
        rounds: dynamicRounds,
      };
    }

    // Apply simulated states
    if (Object.keys(simStates).length > 0) {
      return {
        ...baseWorkflow,
        rounds: baseWorkflow.rounds.map((r, idx) => {
          if (idx !== roundIndex) return r;
          return {
            ...r,
            messages: dynamicMessages.length > 0 ? dynamicMessages : r.messages,
            agents: r.agents.map((a: Agent) => {
              const sim = simStates[a.id];
              if (!sim) return a;
              return {
                ...a,
                status: sim.status,
                progress: sim.progress,
                statusMessage:
                  sim.status === "thinking"
                    ? "Processing..."
                    : sim.status === "done"
                    ? "Complete"
                    : "Waiting...",
                thinking: {
                  ...a.thinking,
                  steps: a.thinking?.steps?.map((s: AgentStep, i: number) => ({
                    ...s,
                    status:
                      i < sim.stepIdx
                        ? "completed"
                        : i === sim.stepIdx && sim.status === "thinking"
                        ? "active"
                        : "pending",
                  })) || [],
                },
              };
            }),
          };
        }),
      };
    }

    return baseWorkflow;
  }, [baseWorkflow, dynamicRounds, simStates, dynamicMessages, roundIndex]);

  /** Run via real backend API, fall back to local simulation */
  const runWorkflow = useCallback(async () => {
    if (running) return;
    const agents = baseWorkflow.rounds[roundIndex]?.agents || [];
    if (agents.length === 0) return;

    setRunning(true);
    setLoading(true);
    setSimStates({});
    setDynamicMessages([]);
    setDynamicRounds(null);

    // Clear old timers
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    const taskBody = {
      id: `demo-${Date.now()}`,
      description: "Build a pixel-style React weather dashboard with 5-day forecast, using neon-green-on-dark aesthetic. Coordinate 4 teams: Research (API selection, market analysis), Design (pixel UI/UX), Engineering (React 19 + TypeScript), and QA (testing + security).",
      type: "content_delivery",
      context: { source: "demo-ui" },
    };

    // Try real backend first
    try {
      const raw = await recordsApi.postRun("company", taskBody);
      // postRun may return { jobId, ... } for async or session-ish data
      const sessionId =
        (raw && typeof raw === "object" && "sessionId" in raw
          ? String((raw as Record<string, unknown>).sessionId)
          : "") ||
        (raw && typeof raw === "object" && "jobId" in raw
          ? String((raw as Record<string, unknown>).jobId)
          : "");

      // If we got a jobId (async mode), poll for it
      if (sessionId) {
        // Wait a moment for the job to complete
        let session: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const jobResult = await recordsApi.getRuntimeJob(sessionId);
            const job = (jobResult && typeof jobResult === "object" && "job" in jobResult
              ? (jobResult as Record<string, unknown>).job
              : jobResult) as Record<string, unknown> | null;
            if (job && (job.status === "completed" || job.status === "failed" || job.status === "error")) {
              if (job.status === "completed" && job.sessionId) {
                const sessionResp = await recordsApi.getSession(String(job.sessionId));
                session = (sessionResp.session || {}) as Record<string, unknown>;
              }
              break;
            }
          } catch {
            // keep polling
          }
        }

        if (session) {
          const wf = sessionJsonToWorkflow(session);
          setDynamicRounds(wf.rounds);
          setDynamicMessages(wf.rounds.flatMap((r: Round) => r.messages || []));
          setRunning(false);
          setLoading(false);
          return;
        }
      }

      // Check if raw has session data directly
      if (raw && typeof raw === "object") {
        const session = (raw as Record<string, unknown>).session as Record<string, unknown> | undefined;
        if (session && typeof session === "object") {
          const wf = sessionJsonToWorkflow(session);
          setDynamicRounds(wf.rounds);
          setDynamicMessages(wf.rounds.flatMap((r: Round) => r.messages || []));
          setRunning(false);
          setLoading(false);
          return;
        }
      }

      // Direct response with agent data
      const wf = sessionJsonToWorkflow(raw as Record<string, unknown>);
      if (wf.rounds.length > 0 && wf.rounds.some((r) => r.messages.length > 0)) {
        setDynamicRounds(wf.rounds);
        setDynamicMessages(wf.rounds.flatMap((r: Round) => r.messages || []));
        setRunning(false);
        setLoading(false);
        return;
      }
    } catch {
      // Backend unavailable — fall through to local simulation
    }

    // Fallback: local DAG state machine simulation (produces real mock content)
    runLocalSimulation(agents);
    setLoading(false);
  }, [running, baseWorkflow, roundIndex]);

  /** Local simulation that animates the DAG and produces mock messages */
  const runLocalSimulation = useCallback((agents: Agent[]) => {
    const depths = computeDepths(agents);
    const maxDepth = Math.max(0, ...Object.values(depths));

    const layers: string[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      layers.push(agents.filter((a: Agent) => depths[a.id] === d).map((a: Agent) => a.id));
    }

    const addTimer = (fn: () => void, delay: number) => {
      timersRef.current.push(setTimeout(fn, delay));
    };

    // Produce a message when an agent completes
    const emitMessage = (agentId: string, content: string, type: AgentOutput["type"] = "output") => {
      setDynamicMessages((prev) => [
        ...prev,
        {
          id: `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agentId,
          content,
          timestamp: Date.now(),
          type,
        },
      ]);
    };

    layers.forEach((layer, layerIdx) => {
      const layerDelay = layerIdx * 3500;

      addTimer(() => {
        layer.forEach((agentId) => {
          const agent = agents.find((a: Agent) => a.id === agentId)!;
          const totalSteps = agent.thinking?.steps?.length || 3;
          setSimStates((prev) => ({
            ...prev,
            [agentId]: { status: "thinking", progress: 0, stepIdx: 0 },
          }));
          setActiveAgent(agentId);

          // Emit a "started thinking" message
          emitMessage(agentId, `[${agent.name}] Starting analysis...`, "info");

          for (let s = 1; s <= totalSteps; s++) {
            addTimer(() => {
              const step = agent.thinking?.steps?.[s - 1];
              setSimStates((prev) => ({
                ...prev,
                [agentId]: {
                  status: "thinking",
                  progress: Math.round((s / totalSteps) * 100),
                  stepIdx: s,
                },
              }));
              // Emit message for this step
              if (step) {
                emitMessage(agentId, `Step ${s}/${totalSteps}: ${step.title} — ${step.description}`, "info");
              }
            }, layerDelay + s * (2500 / totalSteps));
          }

          addTimer(() => {
            setSimStates((prev) => ({
              ...prev,
              [agentId]: { status: "done", progress: 100, stepIdx: totalSteps },
            }));
            // Emit completion message with the agent's summary
            const summary = agent.thinking?.rawThoughts || `${agent.name} completed successfully.`;
            emitMessage(agentId, summary, "output");
            if (layerIdx === layers.length - 1) {
              setActiveAgent(null);
              setRunning(false);
            }
          }, layerDelay + 2800);
        });
      }, layerDelay);
    });
  }, []);

  const resetWorkflow = useCallback(() => {
    setSimStates({});
    setRunning(false);
    setLoading(false);
    setActiveAgent(null);
    setDynamicMessages([]);
    setDynamicRounds(null);
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const nextRound = useCallback(() => {
    if (displayWorkflow.rounds.length > 1 && roundIndex < displayWorkflow.rounds.length - 1) {
      setRoundIndex((p) => p + 1);
    }
  }, [roundIndex, displayWorkflow]);

  const prevRound = useCallback(() => {
    if (roundIndex > 0) setRoundIndex((p) => p - 1);
  }, [roundIndex]);

  const selectWorkflow = useCallback(() => {
    setRoundIndex(0);
    setRunning(false);
    setLoading(false);
    setActiveAgent(null);
    setSimStates({});
    setDynamicMessages([]);
    setDynamicRounds(null);
  }, []);

  return {
    workflows: [],
    workflow: displayWorkflow,
    currentWorkflowId: 0,
    currentRoundIndex: roundIndex,
    isRunning: running,
    activeAgentId: activeAgent,
    isLoading: loading,
    selectWorkflow,
    runWorkflow,
    resetWorkflow,
    nextRound,
    prevRound,
  };
}
