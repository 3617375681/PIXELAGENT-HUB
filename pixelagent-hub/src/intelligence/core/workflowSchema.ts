import { z } from 'zod';

const riskSchema = z.enum(['low', 'medium', 'high']);
const actionTypeSchema = z.enum([
  'send_message',
  'create_task',
  'add_to_bitable',
  'schedule_meeting',
  'local_read_file',
  'local_write_file',
  'local_shell',
  'local_http_get',
  'local_notify',
]);

const sourceSchema = z.object({
  kind: z.enum(['search', 'feed', 'webhook']),
  query: z.string().min(1),
  maxItems: z.number().int().positive().optional(),
});

const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  trigger: z.object({
    type: z.enum(['cron', 'event']),
    cron: z.string().optional(),
    eventType: z.string().optional(),
  }).superRefine((v, ctx) => {
    if (v.type === 'cron' && !v.cron) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'trigger.cron is required for cron trigger' });
    if (v.type === 'event' && !v.eventType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'trigger.eventType is required for event trigger' });
  }),
  sources: z.array(sourceSchema).min(1),
  analysis: z.object({
    maxItems: z.number().int().positive().default(10),
    riskThreshold: riskSchema.default('medium'),
  }),
  decision: z.object({
    autoExecuteBelow: riskSchema.default('medium'),
  }),
  actions: z.array(z.object({
    type: actionTypeSchema,
    target: z.string().min(1),
    params: z.record(z.string(), z.unknown()).default({}),
  })).min(1),
});

export const workflowConfigSchema = z.object({
  version: z.literal(1),
  workflows: z.array(workflowSchema).min(1),
});

export type WorkflowConfigInput = z.input<typeof workflowConfigSchema>;
export type WorkflowConfigParsed = z.output<typeof workflowConfigSchema>;

