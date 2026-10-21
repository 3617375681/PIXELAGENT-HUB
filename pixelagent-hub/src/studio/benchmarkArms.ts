import { basename, resolve } from 'node:path';

export type ArmSettings = { strategy: string; model: string; testerModel: string; dist: string };
export type BenchmarkArm = ArmSettings & { arm: string };

export function parseArms(value: string | undefined, defaults: ArmSettings): BenchmarkArm[] {
  const used = new Set<string>();
  return (value === undefined ? [undefined] : value.split(';')).map((source) => {
    const settings = { ...defaults };
    const labels: string[] = [];
    if (source !== undefined) for (const setting of source.split(',')) {
      const index = setting.indexOf('=');
      if (index < 1) throw new Error(`Invalid arm setting: ${setting}`);
      const key = setting.slice(0, index).trim().replace(/^tester-model$/, 'testerModel');
      if (key !== 'strategy' && key !== 'model' && key !== 'testerModel' && key !== 'dist') throw new Error(`Unknown arm key: ${key}`);
      const value = setting.slice(index + 1).trim();
      if (!value) throw new Error(`Empty arm setting: ${key}`);
      settings[key] = value;
      labels.push(`${key}-${key === 'dist' ? basename(resolve(value)) : value}`);
    }
    settings.dist = resolve(settings.dist);
    settings.testerModel ||= settings.model;
    const slug = (labels.join('-') || `strategy-${settings.strategy}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    let arm = slug;
    for (let suffix = 2; used.has(arm); suffix++) arm = `${slug}-${suffix}`;
    used.add(arm);
    return { arm, ...settings };
  });
}

export function rotateArms<T>(arms: T[], run: number): T[] {
  const offset = (run - 1) % arms.length;
  return [...arms.slice(offset), ...arms.slice(0, offset)];
}
