import { useState, useCallback, useRef, useMemo } from "react";
import { mockAgents } from "@/data/mockData";
import type { Agent, AgentOutput, AgentStatus, AgentStep } from "@/types/agent";

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
  // Simulated agent states for local state machine (key = agentId)
  const [simStates, setSimStates] = useState<
    Record<string, { status: AgentStatus; progress: number; stepIdx: number }>
  >({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Static fallback workflow with one round (stable identity + timestamp)
  const workflow = useMemo(
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
          agents: mockAgents,
          messages: mockAgents.flatMap((a: Agent) => a.outputs || []).map((o: AgentOutput, i: number) => ({
            id: `msg-${i}`,
            agentId: o.agentId,
            content: o.content,
            timestamp: o.timestamp,
            type: o.type,
          })),
        },
      ],
    }),
    [],
  );

  // Apply simulated states to current round's agents
  let displayWorkflow = workflow;
  if (Object.keys(simStates).length > 0) {
    displayWorkflow = {
      ...workflow,
      rounds: workflow.rounds.map((r, idx) => {
        if (idx !== roundIndex) return r;
        return {
          ...r,
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

  /** Local DAG state machine — runs layer by layer */
  const runWorkflow = useCallback(() => {
    if (running) return;
    const agents = displayWorkflow.rounds[roundIndex]?.agents || [];
    if (agents.length === 0) return;

    setRunning(true);
    setSimStates({});

    // Clear old timers
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    const depths = computeDepths(agents);
    const maxDepth = Math.max(0, ...Object.values(depths));

    const layers: string[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      layers.push(agents.filter((a: Agent) => depths[a.id] === d).map((a: Agent) => a.id));
    }

    const addTimer = (fn: () => void, delay: number) => {
      timersRef.current.push(setTimeout(fn, delay));
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

          for (let s = 1; s <= totalSteps; s++) {
            addTimer(() => {
              setSimStates((prev) => ({
                ...prev,
                [agentId]: {
                  status: "thinking",
                  progress: Math.round((s / totalSteps) * 100),
                  stepIdx: s,
                },
              }));
            }, layerDelay + s * (2500 / totalSteps));
          }

          addTimer(() => {
            setSimStates((prev) => ({
              ...prev,
              [agentId]: { status: "done", progress: 100, stepIdx: totalSteps },
            }));
            if (layerIdx === layers.length - 1) {
              setActiveAgent(null);
              setRunning(false);
            }
          }, layerDelay + 2800);
        });
      }, layerDelay);
    });
  }, [running, displayWorkflow, roundIndex]);

  const resetWorkflow = useCallback(() => {
    setSimStates({});
    setRunning(false);
    setActiveAgent(null);
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const nextRound = useCallback(() => {
    if (roundIndex < displayWorkflow.rounds.length - 1) setRoundIndex((p) => p + 1);
  }, [roundIndex, displayWorkflow]);

  const prevRound = useCallback(() => {
    if (roundIndex > 0) setRoundIndex((p) => p - 1);
  }, [roundIndex]);

  const selectWorkflow = useCallback(() => {
    setRoundIndex(0);
    setRunning(false);
    setActiveAgent(null);
    setSimStates({});
  }, []);

  return {
    workflows: [],
    workflow: displayWorkflow,
    currentWorkflowId: 0,
    currentRoundIndex: roundIndex,
    isRunning: running,
    activeAgentId: activeAgent,
    isLoading: false,
    selectWorkflow,
    runWorkflow,
    resetWorkflow,
    nextRound,
    prevRound,
  };
}
