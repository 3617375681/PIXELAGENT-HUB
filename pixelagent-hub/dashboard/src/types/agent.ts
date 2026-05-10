export interface AgentStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp: number;
}

export interface AgentThinking {
  agentId: string;
  steps: AgentStep[];
  rawThoughts: string;
}

export type AgentOutputAttachment = {
  id?: string;
  name: string;
  mime: string;
  /** Absolute or same-origin path to fetch the file (may require X-API-Key when auth is on). */
  url: string;
};

export interface AgentOutput {
  id: string;
  agentId: string;
  content: string;
  timestamp: number;
  type: 'output' | 'error' | 'warning' | 'info';
  /** Local UI role; workflow messages omit this and render as agent output. */
  role?: 'user' | 'assistant';
  attachments?: AgentOutputAttachment[];
}

export type AgentStatus = 'idle' | 'thinking' | 'done' | 'error';

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  status: AgentStatus;
  statusMessage: string;
  progress: number;
  outputs: AgentOutput[];
  thinking: AgentThinking;
  position: { x: number; y: number };
  connections: string[];
}

export interface Round {
  id: string;
  roundNumber: number;
  agents: Agent[];
  messages: AgentOutput[];
  timestamp: number;
  status: 'running' | 'completed' | 'error';
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  rounds: Round[];
  currentRound: number;
}
