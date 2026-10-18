import { z } from 'zod';
import { codeSchema, planSchema, testPlanSchema, testerReviewSchema } from './schemas.js';

/** A model reply as one JSON object: the first fenced block if present, otherwise the whole reply. */
export function parseModelObject(raw: string): Record<string, unknown> {
  // Reasoning models (qwen3, R1-style) may prefix their reply with a <think> block.
  const trimmed = raw.replace(/^\s*<think>[\s\S]*?<\/think>/, '').trim();
  const object = JSON.parse(trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? trimmed);
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Expected a JSON object');
  return object;
}

/** Schema failures read as one short sentence instead of a raw issue dump. */
function parseWith<T>(schema: z.ZodType<T>, object: unknown, what: string): T {
  const result = schema.safeParse(object);
  if (result.success) return result.data;
  throw new Error(`The ${what} did not match the expected format: ${z.prettifyError(result.error).replace(/\s*\n\s*/g, '; ').slice(0, 500)}`);
}

export const parsePlanOutput = (object: unknown) => {
  const { projectName, goal, phases, estimatedRounds, risks } = parseWith(planSchema, object, 'plan');
  return { projectName, goal, phases, estimatedRounds, risks };
};

export const parseCodeOutput = (object: unknown) => {
  const { language, files, explanation, dependencies } = parseWith(codeSchema, object, 'code');
  return { language, files, explanation, dependencies };
};

/** `limitations` is descriptive: normalise it (strings, ≤300 chars, ≤10 items) rather than reject a usable plan. */
const normaliseLimitations = (object: unknown) => {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return object;
  const { limitations, ...rest } = object as Record<string, unknown>;
  const list = Array.isArray(limitations) ? limitations : limitations === undefined || limitations === null ? [] : [limitations];
  return { ...rest, limitations: list.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)).slice(0, 300)).slice(0, 10) };
};

export const parseTestPlanOutput = (object: unknown) => parseWith(testPlanSchema, normaliseLimitations(object), 'test plan');

/**
 * Tester review: keeps only verdicts for checks that actually failed; a "check-wrong" verdict counts
 * only with a valid corrected check of the same name (otherwise the failure stands).
 */
export const parseTesterReview = (object: unknown, failing: readonly string[]) => {
  const { verdicts } = parseWith(testerReviewSchema, object, 'test review');
  return failing.map((name) => {
    const verdict = verdicts.find((item) => item.name === name);
    const corrected = verdict?.verdict === 'check-wrong' && verdict.check?.name === name ? verdict.check : undefined;
    return { name, verdict: corrected ? 'check-wrong' as const : 'app-wrong' as const, reason: verdict?.reason || '', check: corrected };
  });
};
