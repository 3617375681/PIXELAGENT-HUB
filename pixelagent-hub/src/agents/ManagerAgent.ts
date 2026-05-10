import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

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
        system: 'You are a project manager. Output valid JSON with: projectName (string), goal (string), phases (array of {id, name, tasks: string[], assignee: string, priority: "high"|"medium"|"low"}), estimatedRounds (number), risks (string[]).',
        user: `Project: "${description}"\nContext: ${JSON.stringify(context || {})}\n\nCreate a project plan as JSON. Break into 3-5 phases.`,
      }),
      (content) => {
        const parsed = this.extractJson(content);
        return {
          projectName: parsed.projectName || description,
          goal: parsed.goal || `Complete: ${description}`,
          phases: parsed.phases || [],
          estimatedRounds: parsed.estimatedRounds || 3,
          risks: parsed.risks || [],
        };
      },
      (reason) =>
        this.createResult(
          task.id,
          'success',
          {
            projectName: description,
            goal: `Successfully complete: ${description}`,
            phases: [
              { id: 'phase-1', name: 'Research', tasks: ['Research topic', 'Gather data'], assignee: 'researcher', priority: 'high' },
              { id: 'phase-2', name: 'Create', tasks: ['Write draft', 'Generate code'], assignee: 'writer', priority: 'high' },
              { id: 'phase-3', name: 'Review', tasks: ['Quality check', 'Final review'], assignee: 'reviewer', priority: 'medium' },
            ],
            estimatedRounds: 3,
            risks: ['Scope creep', 'Resource availability'],
            generatedBy: 'mock',
          },
          `mock: ${reason}`
        )
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
