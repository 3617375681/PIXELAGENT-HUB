import type { StudioEvent, StudioProject, StudioTestPlan } from '../types/studio';

type Reply = { llmModel?: unknown; llmUsage?: unknown };

/** Reviews are separate replies; plan-ready events must not count the saved plan twice. */
export function agentUsage(project: StudioProject, plans: StudioTestPlan[], events: StudioEvent[]) {
  const replies: { agent: string; outputs: (Reply | undefined)[] }[] = [
    { agent: 'Manager', outputs: [project.plan?.output] },
    { agent: 'Coder', outputs: project.rounds.map((round) => round.code.output) },
    { agent: 'Tester', outputs: [
      ...plans.map((plan) => plan.result?.output),
      ...events.filter((event) => event.type === 'test_plan_ready' && event.data?.review === true).map((event) => event.data),
    ] },
  ];
  return replies.map(({ agent, outputs }) => {
    const models = [...new Set(outputs.flatMap((output) => typeof output?.llmModel === 'string' ? [output.llmModel] : []))];
    const tokens = outputs.flatMap((output) => {
      const usage = output?.llmUsage;
      const total = usage && typeof usage === 'object' && 'total_tokens' in usage ? usage.total_tokens : undefined;
      return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? [total] : [];
    });
    return { agent, models, tokens: tokens.length ? tokens.reduce((sum, value) => sum + value, 0) : null };
  });
}
