import { codeSchema, planSchema, testPlanSchema } from './schemas.js';

/** A model reply as one JSON object: the first fenced block if present, otherwise the whole reply. */
export function parseModelObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const object = JSON.parse(trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? trimmed);
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Expected a JSON object');
  return object;
}

export const parsePlanOutput = (object: unknown) => {
  const { projectName, goal, phases, estimatedRounds, risks } = planSchema.parse(object);
  return { projectName, goal, phases, estimatedRounds, risks };
};

export const parseCodeOutput = (object: unknown) => {
  const { language, files, explanation, dependencies } = codeSchema.parse(object);
  return { language, files, explanation, dependencies };
};

export const parseTestPlanOutput = (object: unknown) => testPlanSchema.parse(object);
