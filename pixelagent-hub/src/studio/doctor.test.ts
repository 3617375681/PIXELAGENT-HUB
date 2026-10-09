import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { studioConfigurationChecks, checkStudioEnvironment } from './doctor.js';

const check = (env: NodeJS.ProcessEnv, name: string) => studioConfigurationChecks(env, '22.12.0').find((item) => item.name === name)!;

test('doctor uses runtime routing, key precedence and per-agent overrides without echoing secrets', () => {
  const secret = 'DO-NOT-PRINT-secret';
  assert.equal(check({}, 'model:coder').status, 'fail');
  assert.equal(check({ KIMI_API_KEY: 'replace-with-kimi-api-key' }, 'model:coder').status, 'fail');
  assert.match(check({ KIMI_API_KEY: secret, OPENAI_API_KEY: secret }, 'model:coder').message, /^openai:/);
  assert.equal(check({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: secret, LLM_API_KEY: 'replace-with-generic-key' }, 'model:coder').status, 'fail');
  const env = { LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: secret, AGENT_CODER_LLM_PROVIDER: 'ollama', AGENT_TESTER_LLM_PROVIDER: 'mock' };
  assert.match(check(env, 'model:coder').message, /^ollama:/);
  assert.equal(check(env, 'model:tester').status, 'warn');
  assert.equal(check({ ...env, OFFLINE: 'true' }, 'model:manager').status, 'warn');
  assert.match(check({ ...env, OFFLINE: 'true' }, 'model:coder').message, /^ollama:/);
  assert.equal(check({ LLM_PROVIDER: 'custom-openai-compat', LLM_API_KEY: secret, LLM_BASE_URL: 'http://localhost:8080/v1' }, 'model:coder').status, 'pass');
  for (const invalid of [
    { LLM_PROVIDER: secret, NODE_ENV: secret, RECORDS_API_KEY: secret },
    { LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: secret, LLM_BASE_URL: `file:///${secret}` },
  ]) {
    const result = studioConfigurationChecks(invalid, '22.12.0');
    assert.equal(result.find((item) => item.name === 'model:coder')?.status, 'fail');
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test('doctor distinguishes full dashboard Node requirement, auth placeholders and browser configuration', () => {
  for (const version of ['18.20.0', '20.19.0', '22.11.0']) assert.equal(studioConfigurationChecks({ LLM_PROVIDER: 'mock' }, version)[0].status, 'fail');
  for (const version of ['22.12.0', '24.0.0']) assert.equal(studioConfigurationChecks({ LLM_PROVIDER: 'mock' }, version)[0].status, 'pass');
  assert.equal(check({ NODE_ENV: 'production', ALLOW_UNAUTH_IN_DEV: 'true' }, 'api-config').status, 'fail');
  assert.equal(check({ ALLOW_UNAUTH_IN_DEV: 'false', RECORDS_API_KEY: 'replace-with-strong-api-key' }, 'api-config').status, 'fail');
  assert.equal(check({ ALLOW_UNAUTH_IN_DEV: 'false', RECORDS_API_KEY: 'a-real-local-test-key' }, 'api-config').status, 'pass');
  assert.equal(check({ ENABLE_STUDIO_BROWSER_CHECKS: 'TRUE' }, 'browser-config').status, 'fail');
});

test('doctor probes builder, reports missing dashboard and skips disabled browser without creating records', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-doctor-'));
  try {
    const checks = await checkStudioEnvironment({ cwd, env: { LLM_PROVIDER: 'mock' } });
    assert.equal(checks.find((item) => item.name === 'builder')?.status, 'pass');
    assert.equal(checks.find((item) => item.name === 'dashboard')?.status, 'fail');
    assert.equal(checks.find((item) => item.name === 'browser')?.status, 'warn');
    assert.deepEqual(await readdir(cwd), []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('doctor CLI fails example credentials and rejects unknown arguments without echoing them', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-doctor-cli-'));
  try {
    const envPath = join(cwd, '.env');
    await writeFile(envPath, 'LLM_PROVIDER=kimi\nKIMI_API_KEY=replace-with-kimi-api-key\n');
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DOTENV_CONFIG_PATH: envPath, DOTENV_CONFIG_QUIET: 'true' };
    const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/doctor-software.ts'), ...args], { env, encoding: 'utf8', timeout: 20_000 });
    const invalidKey = run(['--json']);
    assert.equal(invalidKey.status, 1, invalidKey.stderr);
    assert.equal(JSON.parse(invalidKey.stdout).failed, true);
    const unknown = run(['--DO-NOT-PRINT']);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Usage:/);
    assert.ok(!unknown.stderr.includes('DO-NOT-PRINT'));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('doctor launches sandboxed browser and executes local fixture', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const checks = await checkStudioEnvironment({ cwd: process.cwd(), env: { LLM_PROVIDER: 'mock', ENABLE_STUDIO_BROWSER_CHECKS: 'true', STUDIO_BROWSER_EXECUTABLE: process.env.STUDIO_BROWSER_EXECUTABLE } });
  assert.equal(checks.find((item) => item.name === 'browser')?.status, 'pass', JSON.stringify(checks));
  const missing = await checkStudioEnvironment({ cwd: process.cwd(), browser: true, env: { LLM_PROVIDER: 'mock', STUDIO_BROWSER_EXECUTABLE: resolve('nonexistent-studio-browser') } });
  assert.equal(missing.find((item) => item.name === 'browser')?.status, 'fail');
});
