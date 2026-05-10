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
import { Task, TaskResult } from './core/types.js';
import { LLMProvider } from './core/llm/provider.js';
import { createLLMProvider } from './core/llm/factory.js';

export function createOrchestrator(name: string = 'MultiAgentSystem', llmProvider?: LLMProvider | null): Orchestrator {
  const bus = new MessageBusImpl();
  const provider = llmProvider !== undefined ? llmProvider : createLLMProvider();

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

  // Register all preset agents with shared bus and LLM provider
  orchestrator.registerAgent(new ResearchAgent(bus, provider));
  orchestrator.registerAgent(new WriterAgent(bus, provider));
  orchestrator.registerAgent(new ReviewerAgent(bus, provider));
  orchestrator.registerAgent(new CodeAgent(bus, provider));
  orchestrator.registerAgent(new ManagerAgent(bus, provider));
  orchestrator.registerAgent(new SeniorEditorAgent(bus, provider));
  orchestrator.registerAgent(new DirectorAgent(bus, provider));
  orchestrator.registerAgent(new ModeratorAgent(bus, provider));

  return orchestrator;
}

export { LLMProvider, createLLMProvider };
