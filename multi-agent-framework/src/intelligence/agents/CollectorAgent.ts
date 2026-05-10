import { BaseAgent } from '../../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../../core/types.js';
import { CollectedItem, WorkflowDefinition } from '../core/intelTypes.js';
import { mockSearch } from '../tools/search.js';

export class CollectorAgent extends BaseAgent {
  constructor(bus: MessageBus) {
    super(
      {
        id: 'intel_collector',
        name: 'Collector',
        role: 'collector',
        capabilities: ['search', 'fetch', 'monitor'],
      },
      bus
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const workflow = task.context?.workflow as WorkflowDefinition;
    const maxItems = Number(workflow?.analysis?.maxItems || 10);
    const collected: CollectedItem[] = [];
    for (const src of workflow.sources) {
      if (src.kind === 'search') {
        const hits = await mockSearch(src.query, Math.min(src.maxItems || maxItems, maxItems));
        collected.push(...hits);
      } else {
        collected.push({
          id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: `${src.kind}:${src.query}`,
          content: `Mock collected from ${src.kind} ${src.query}`,
          source: src.kind,
          publishedAt: new Date().toISOString(),
        });
      }
    }
    return this.createResult(task.id, 'success', { collected: collected.slice(0, maxItems) }, `Collected ${collected.length} items`);
  }
}

