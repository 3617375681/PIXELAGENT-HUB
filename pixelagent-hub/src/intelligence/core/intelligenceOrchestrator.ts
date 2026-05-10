import { MessageBusImpl } from '../../core/MessageBus.js';
import { Orchestrator } from '../../core/Orchestrator.js';
import { Task } from '../../core/types.js';
import { CollectorAgent } from '../agents/CollectorAgent.js';
import { AnalystAgent } from '../agents/AnalystAgent.js';
import { DecisionAgent } from '../agents/DecisionAgent.js';
import { ExecutorAgent } from '../agents/ExecutorAgent.js';
import { MonitorAgent } from '../agents/MonitorAgent.js';
import { ActionProviderRegistry } from './actionAdapter.js';
import { IntelligenceRunStore } from './runStore.js';

export function createIntelligenceOrchestrator(store: IntelligenceRunStore, providers: ActionProviderRegistry): Orchestrator {
  const bus = new MessageBusImpl();
  const orchestrator = new Orchestrator(
    {
      name: 'NanoClawIntelligencePipeline',
      agents: [],
      pipelines: {
        'intelligence-flow': [
          {
            agentId: 'intel_collector',
            taskType: 'collect',
            transform: (prev, original) => ({ ...original, id: `analyze-${original.id}`, context: { ...(original.context || {}), collectorOutput: prev.output } }),
          },
          {
            agentId: 'intel_analyst',
            taskType: 'analyze',
            transform: (prev, original) => ({ ...original, id: `decision-${original.id}`, context: { ...(original.context || {}), insight: prev.output } }),
          },
          {
            agentId: 'intel_decision',
            taskType: 'decide',
            transform: (prev, original) => ({ ...original, id: `execute-${original.id}`, context: { ...(original.context || {}), decision: prev.output } }),
          },
          {
            agentId: 'intel_executor',
            taskType: 'execute',
            transform: (prev, original) => ({ ...original, id: `monitor-${original.id}`, context: { ...(original.context || {}), execution: prev.output } }),
          },
          {
            agentId: 'intel_monitor',
            taskType: 'monitor',
          },
        ],
      },
      defaultPipeline: 'intelligence-flow',
    },
    bus
  );
  orchestrator.registerAgent(new CollectorAgent(bus));
  orchestrator.registerAgent(new AnalystAgent(bus));
  orchestrator.registerAgent(new DecisionAgent(bus));
  orchestrator.registerAgent(new ExecutorAgent(bus, providers, store));
  orchestrator.registerAgent(new MonitorAgent(bus));
  return orchestrator;
}

