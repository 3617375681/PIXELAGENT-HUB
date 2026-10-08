import { Orchestrator } from './core/Orchestrator.js';
import { MessageBusImpl } from './core/MessageBus.js';
import { ResearchAgent } from './agents/ResearchAgent.js';
import { WriterAgent } from './agents/WriterAgent.js';
import { ReviewerAgent } from './agents/ReviewerAgent.js';
import { CodeAgent } from './agents/CodeAgent.js';
import { ManagerAgent } from './agents/ManagerAgent.js';
import { SeniorEditorAgent } from './agents/SeniorEditorAgent.js';
import { DirectorAgent } from './agents/DirectorAgent.js';
import { ModeratorAgent } from './agents/ModeratorAgent.js';
import { TesterAgent } from './agents/TesterAgent.js';
import { Task, TaskResult } from './core/types.js';
import type { LLMProvider } from './core/llm/provider.js';
import { createLLMProvider, createLLMProviderFor } from './core/llm/factory.js';

export function createOrchestrator(name: string = 'MultiAgentSystem', llmProvider?: LLMProvider | null, options: { includeTester?: boolean } = {}): Orchestrator {
  const bus = new MessageBusImpl();
  const providerFor = (agentId: string) => (llmProvider !== undefined ? llmProvider : createLLMProviderFor({ id: agentId }));

  const orchestrator = new Orchestrator({
    name,
    agents: [],
    pipelines: {
      'content-creation': [
        { agentId: 'researcher', taskType: 'research' },
        {
          agentId: 'writer',
          taskType: 'write',
          transform: (prevResult: TaskResult, originalTask: Task) => ({
            ...originalTask,
            id: `write-${originalTask.id}`,
            context: {
              ...originalTask.context,
              previousRound: [prevResult],
            },
          }),
        },
        {
          agentId: 'reviewer',
          taskType: 'review',
          transform: (prevResult: TaskResult, originalTask: Task) => ({
            ...originalTask,
            id: `review-${originalTask.id}`,
            context: {
              ...originalTask.context,
              previousRound: [prevResult],
            },
          }),
        },
      ],
      'code-review': [
        { agentId: 'coder', taskType: 'code' },
        {
          agentId: 'reviewer',
          taskType: 'review',
          transform: (prevResult: TaskResult, originalTask: Task) => ({
            ...originalTask,
            id: `review-code-${originalTask.id}`,
            context: {
              ...originalTask.context,
              previousRound: [prevResult],
            },
          }),
        },
      ],
    },
    defaultPipeline: 'content-creation',
  }, bus);

  // Enable concurrency control for parallel operations (debate, vote, parallel modes)
  orchestrator.enableQueue(5, 50);

  // Register all preset agents with shared bus and per-agent LLM routing (env / AgentConfig)
  orchestrator.registerAgent(new ResearchAgent(bus, providerFor('researcher')));
  orchestrator.registerAgent(new WriterAgent(bus, providerFor('writer')));
  orchestrator.registerAgent(new ReviewerAgent(bus, providerFor('reviewer')));
  orchestrator.registerAgent(new CodeAgent(bus, providerFor('coder')));
  orchestrator.registerAgent(new ManagerAgent(bus, providerFor('manager')));
  orchestrator.registerAgent(new SeniorEditorAgent(bus, providerFor('senior_editor')));
  orchestrator.registerAgent(new DirectorAgent(bus, providerFor('director')));
  orchestrator.registerAgent(new ModeratorAgent(bus, providerFor('moderator')));
  if (options.includeTester) orchestrator.registerAgent(new TesterAgent(bus, providerFor('tester')));

  return orchestrator;
}

export type { LLMProvider };
export { createLLMProvider, createLLMProviderFor };
