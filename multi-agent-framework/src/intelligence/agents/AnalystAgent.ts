import { BaseAgent } from '../../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../../core/types.js';
import { CollectedItem, Insight, RiskLevel } from '../core/intelTypes.js';

function scoreRisk(items: CollectedItem[]): RiskLevel {
  const text = items.map((x) => `${x.title} ${x.content}`).join(' ').toLowerCase();
  if (/(breaking|urgent|critical|lawsuit|breach|融资|收购)/.test(text)) return 'high';
  if (/(release|launch|funding|竞争|更新)/.test(text)) return 'medium';
  return 'low';
}

export class AnalystAgent extends BaseAgent {
  constructor(bus: MessageBus) {
    super(
      {
        id: 'intel_analyst',
        name: 'Analyst',
        role: 'analyst',
        capabilities: ['summarize', 'extract', 'risk_score'],
      },
      bus
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const raw = task.context?.collectorOutput;
    const collected = (Array.isArray(raw) ? raw : Array.isArray(raw?.collected) ? raw.collected : []) as CollectedItem[];
    const risk = scoreRisk(collected);
    const keywords = Array.from(new Set(collected.flatMap((x) => x.title.toLowerCase().split(/[\s\-_:,./]+/)).filter((x) => x.length > 3))).slice(0, 8);
    const insight: Insight = {
      summary: collected.map((x) => x.title).slice(0, 5).join('; ') || 'No major updates',
      keywords,
      risk,
      priority: risk === 'high' ? 'P0' : risk === 'medium' ? 'P1' : 'P2',
      evidence: collected.slice(0, 5),
    };
    return this.createResult(task.id, 'success', insight, `Generated insight with risk=${risk}`);
  }
}

