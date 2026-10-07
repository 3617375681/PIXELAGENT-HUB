import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';
import { z } from 'zod';

const planSchema = z.object({
  projectName: z.string().min(1), goal: z.string().min(1),
  phases: z.array(z.object({ id: z.string(), name: z.string(), tasks: z.array(z.string()), assignee: z.string(), priority: z.enum(['high', 'medium', 'low']) })).min(1),
  estimatedRounds: z.number().positive(), risks: z.array(z.string()),
});

export class ManagerAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'manager',
        name: 'Manager',
        role: 'project_planner',
        capabilities: ['plan', 'decompose', 'prioritize', 'assign'],
        systemPrompt: 'You are a project manager. Break down complex tasks into actionable steps with clear assignments.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { description, context } = task;

    return this.llmOrMock(
      task,
      () => ({
        system: 'You are a project manager. Output valid JSON with: projectName (string), goal (string), phases (array of {id: string such as "p1", name: string, tasks: string[], assignee: string, priority: "high"|"medium"|"low"}), estimatedRounds (positive integer), risks (string[]). Phase IDs must be strings, never numbers.',
        user: `Project: "${description}"\nContext: ${JSON.stringify(context || {})}\n\nCreate a project plan as JSON. Break into 3-5 phases.`,
      }),
      (content) => {
        const parsed = planSchema.parse(this.extractJson(content));
        return {
          projectName: parsed.projectName || description,
          goal: parsed.goal || `Complete: ${description}`,
          phases: parsed.phases || [],
          estimatedRounds: parsed.estimatedRounds || 3,
          risks: parsed.risks || [],
        };
      }
    );
  }

  private extractJson(raw: string): Record<string, any> {
    try {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
      return { goal: raw };
    } catch {
      return { goal: raw };
    }
  }
}
