import type { Agent, AgentStep, AgentThinking } from "@/types/agent";
import { AGENT_META } from "@/lib/sessionToWorkflow";

/** English placeholder so ThinkingDrawer matches real-session shape before a run. */
function thinkingPlaceholder(agentId: string): AgentThinking {
  const step: AgentStep = {
    id: `${agentId}-standby`,
    title: "Standby",
    description: "Waiting for task...",
    status: "pending",
    timestamp: Date.now(),
  };
  return {
    agentId,
    steps: [step],
    rawThoughts: "Waiting for task...",
  };
}

function metaFor(id: string) {
  return AGENT_META[id] || { name: id, role: "Agent", icon: "🤖", color: "#94a3b8" };
}

/**
 * Idle canvas: 8 backend agents + clean layered DAG (matches Records session ids).
 * Top row = core production chain; bottom row = support lane.
 * Coordinates leave a small gap between 240px cards and stay clear of the chat panel at default zoom.
 */
export const realAgents: Agent[] = (() => {
  const ids = [
    "director",
    "manager",
    "researcher",
    "writer",
    "senior_editor",
    "reviewer",
    "moderator",
    "coder",
  ] as const;

  const positions: Record<(typeof ids)[number], { x: number; y: number }> = {
    manager: { x: -40, y: 120 },
    researcher: { x: 220, y: 120 },
    writer: { x: 480, y: 120 },
    senior_editor: { x: 740, y: 120 },
    moderator: { x: -40, y: 340 },
    reviewer: { x: 220, y: 340 },
    coder: { x: 480, y: 340 },
    director: { x: 740, y: 340 },
  };

  const connections: Record<(typeof ids)[number], string[]> = {
    manager: ["researcher"],
    researcher: ["writer"],
    writer: ["senior_editor"],
    senior_editor: ["director"],
    moderator: ["reviewer"],
    reviewer: ["coder"],
    coder: ["senior_editor"],
    director: [],
  };

  return ids.map((id) => {
    const m = metaFor(id);
    return {
      id,
      name: m.name,
      role: m.role,
      icon: m.icon,
      color: m.color,
      status: "idle",
      statusMessage: "Waiting...",
      progress: 0,
      outputs: [],
      thinking: thinkingPlaceholder(id),
      position: positions[id],
      connections: connections[id],
    };
  });
})();
