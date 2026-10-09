import { createRequire } from 'node:module';
import { join } from 'node:path';
import { detectProviderId, readAgentLlmEnv } from '../core/llm/factory.js';
import { loadWebServerConfig } from '../web/config.js';

export type DoctorCheck = { name: string; status: 'pass' | 'warn' | 'fail'; message: string };
const placeholder = (value: string) => !value.trim() || /^replace-with-/i.test(value.trim());

/** Reuse runtime routing; report only fixed messages, never credentials or raw errors. */
export function studioConfigurationChecks(env: NodeJS.ProcessEnv, nodeVersion: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const add = (name: string, status: DoctorCheck['status'], message: string) => checks.push({ name, status, message });
  const [major, minor] = nodeVersion.split('.').map(Number);
  const dashboardNode = major > 22 || (major === 22 && minor >= 12);
  add('node', dashboardNode ? 'pass' : 'fail', dashboardNode ? 'Node supports the full Studio and dashboard.' : 'Install Node 22.12+ for the full Studio and dashboard.');

  for (const agent of ['manager', 'coder', 'tester']) {
    const name = `model:${agent}`;
    try {
      const provider = readAgentLlmEnv(agent, env).llmProvider ?? detectProviderId(env);
      if (provider === 'mock') {
        add(name, 'warn', 'mock: offline workflow demonstration; not real model generation.');
        continue;
      }
      const keyName = provider === 'custom-openai-compat' ? 'OPENAI_API_KEY' : `${provider.toUpperCase()}_API_KEY`;
      if (provider !== 'ollama' && placeholder(env.LLM_API_KEY || env[keyName] || '')) {
        add(name, 'fail', `${provider}: set a real LLM_API_KEY or ${keyName}; example placeholders are not credentials.`);
        continue;
      }
      const endpoint = env.LLM_BASE_URL || (provider === 'custom-openai-compat' ? undefined : env[`${provider.toUpperCase()}_BASE_URL`]);
      if (endpoint) {
        const url = new URL(endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid endpoint');
      }
      add(name, 'pass', `${provider}: local configuration present; credentials, model availability and connectivity are not verified.`);
    } catch {
      add(name, 'fail', `Check LLM_PROVIDER, AGENT_${agent.toUpperCase()}_LLM_PROVIDER and the selected provider base URL.`);
    }
  }

  try {
    const config = loadWebServerConfig(env);
    if (config.allowUnauthInDev) add('api-config', 'warn', 'Development API authentication is disabled.');
    else if (placeholder(config.recordsApiKey)) add('api-config', 'fail', 'Replace RECORDS_API_KEY with a real key before using authenticated API access.');
    else add('api-config', 'pass', 'API configuration parses and authentication is enabled; server is not started by this check.');
  } catch {
    add('api-config', 'fail', 'Check API port, limits, timeouts, NODE_ENV and authentication settings in .env.');
  }
  if (env.ENABLE_STUDIO_BROWSER_CHECKS && !['true', 'false'].includes(env.ENABLE_STUDIO_BROWSER_CHECKS)) {
    add('browser-config', 'fail', 'Set ENABLE_STUDIO_BROWSER_CHECKS to true or false.');
  }
  return checks;
}

export async function checkStudioEnvironment(options: { env: NodeJS.ProcessEnv; cwd: string; browser?: boolean }): Promise<DoctorCheck[]> {
  const checks = studioConfigurationChecks(options.env, process.versions.node);
  try {
    const { transform } = await import('esbuild');
    await transform('const studio: number = 1;', { loader: 'ts' });
    checks.push({ name: 'builder', status: 'pass', message: 'esbuild binary compiled a local TypeScript fixture.' });
  } catch {
    checks.push({ name: 'builder', status: 'fail', message: 'Run npm ci in pixelagent-hub to install the matching esbuild binary.' });
  }
  try {
    createRequire(join(options.cwd, 'dashboard', 'package.json')).resolve('vite');
    checks.push({ name: 'dashboard', status: 'pass', message: 'Vite is installed; run npm --prefix dashboard run check and run build to verify the dashboard.' });
  } catch {
    checks.push({ name: 'dashboard', status: 'fail', message: 'Run npm --prefix dashboard ci to install dashboard dependencies.' });
  }

  const enabled = options.env.ENABLE_STUDIO_BROWSER_CHECKS === 'true';
  if (!enabled && !options.browser) {
    checks.push({ name: 'browser', status: 'warn', message: 'Independent browser checks are disabled. Install Chromium and set ENABLE_STUDIO_BROWSER_CHECKS=true, or probe with --browser.' });
  } else if (Number(process.versions.node.split('.')[0]) < 20) {
    checks.push({ name: 'browser', status: 'fail', message: 'Independent browser checks require Node 20+; full dashboard requires 22.12+.' });
  } else {
    let browser: import('playwright').Browser | undefined;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: options.env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined, timeout: 10_000 });
      const page = await browser.newPage();
      await page.setContent('<button id="check" onclick="this.disabled=true">Studio</button>', { timeout: 2000 });
      await page.locator('#check').click({ timeout: 2000 });
      if (!await page.locator('#check').isDisabled()) throw new Error('Browser fixture did not execute');
      checks.push({ name: 'browser', status: 'pass', message: enabled ? 'Sandboxed Chromium launched and clicked a local fixture.' : 'Sandboxed Chromium probe passed; API browser checks remain disabled until ENABLE_STUDIO_BROWSER_CHECKS=true.' });
    } catch {
      checks.push({ name: 'browser', status: 'fail', message: 'Run npx playwright install chromium (Linux: --with-deps), or check STUDIO_BROWSER_EXECUTABLE and host sandbox support. See docs/software-studio/environment-check.md.' });
    } finally {
      if (browser) {
        try { await browser.close(); } catch {
          checks.push({ name: 'browser-cleanup', status: 'fail', message: 'Browser cleanup failed; inspect local browser processes before retrying.' });
        }
      }
    }
  }
  return checks;
}
