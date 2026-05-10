import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import { workflowConfigSchema } from './workflowSchema.js';
import { WorkflowConfig } from './intelTypes.js';

export class WorkflowConfigService {
  constructor(private readonly filePath: string) {}

  async load(): Promise<WorkflowConfig> {
    const raw = await readFile(this.filePath, 'utf-8');
    const parsed = parseYaml(raw);
    const validated = workflowConfigSchema.parse(parsed);
    return validated as WorkflowConfig;
  }

  async save(config: WorkflowConfig): Promise<void> {
    const validated = workflowConfigSchema.parse(config);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, dumpYaml(validated, { lineWidth: 120 }), 'utf-8');
  }

  async validate(rawConfig: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      workflowConfigSchema.parse(rawConfig);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}

