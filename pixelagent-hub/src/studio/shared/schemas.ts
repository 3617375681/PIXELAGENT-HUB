import { z } from 'zod';

/**
 * Output contracts shared by the Node agents and the in-browser Studio (dashboard PLAY LIVE).
 * Keep this module free of Node APIs.
 */
export const planSchema = z.object({
  projectName: z.string().min(1), goal: z.string().min(1),
  phases: z.array(z.object({ id: z.string(), name: z.string(), tasks: z.array(z.string()), assignee: z.string(), priority: z.enum(['high', 'medium', 'low']) })).min(1),
  estimatedRounds: z.number().positive(), risks: z.array(z.string()),
});

export const codeSchema = z.object({
  language: z.string().min(1),
  files: z.array(z.object({ path: z.string().min(1), content: z.string().min(1), description: z.string() })).min(1),
  explanation: z.string(), dependencies: z.array(z.string()),
});

const selector = z.string().min(1).max(160);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector }).strict(),
  z.object({ type: z.literal('input'), selector, value: z.string().max(300) }).strict(),
  z.object({ type: z.literal('key'), selector, key: z.string().min(1).max(32) }).strict(),
]);
export const browserCheckSchema = z.object({ name: z.string().min(1).max(120), actions: z.array(action).max(8), selector, expected: z.string().max(300), assertion: z.enum(['text', 'disabled']).optional() }).strict()
  .refine((check) => check.assertion !== 'disabled' || ['true', 'false'].includes(check.expected), 'Disabled assertions require expected "true" or "false"');
export const testPlanSchema = z.object({ checks: z.array(browserCheckSchema).min(1).max(10), limitations: z.array(z.string().max(300)).max(10) }).strict().refine((plan) => new Set(plan.checks.map((check) => check.name)).size === plan.checks.length, 'Check names must be unique');

export const filesSchema = z.array(z.object({ path: z.string(), content: z.string() })).min(1).max(40);
export type SourceFile = z.infer<typeof filesSchema>[number];
