import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { testPlanSchema } from './testPlans.js';
import { writeJsonSnapshot } from './atomicJson.js';

export type BrowserRun = {
  id: string; projectId: string; testPlanId: string; previewFile: string; previewHash: string; planHash: string;
  jobId: string; source: 'server-browser'; status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
  startedAt: string; finishedAt?: string; browserVersion?: string; error?: string;
  viewport: { width: number; height: number };
  checks: { name: string; status: 'passed' | 'failed'; actual: string; error?: string }[];
  errors: string[]; blockedRequests: string[]; screenshots: ('initial.png' | 'final.png')[];
};
export const contentHash = (content: string) => createHash('sha256').update(content).digest('hex');
export const saveBrowserRun = (root: string, run: BrowserRun) => writeJsonSnapshot(join(root, run.projectId, 'browser-runs', `${run.id}.json`), run);
export async function listBrowserRuns(root: string, projectId: string): Promise<BrowserRun[]> {
  const directory = join(root, projectId, 'browser-runs');
  let entries: string[];
  try { entries = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return (await Promise.all(entries.filter((entry) => /^[a-f0-9-]{36}\.json$/.test(entry)).map(async (entry) => JSON.parse(await readFile(join(directory, entry), 'utf8')) as BrowserRun))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Executes only bounded declarative checks; no model-provided scripts, URLs or paths. */
export async function executeBrowserRun(options: { root: string; run: BrowserRun; html: string; plan: unknown; signal: AbortSignal; executablePath?: string; timeoutMs?: number }): Promise<BrowserRun> {
  const { root, run, signal } = options;
  const plan = testPlanSchema.parse(options.plan);
  let browser: Browser | undefined;
  let closing: Promise<void> | undefined;
  const controller = new AbortController();
  const close = () => { if (browser) closing ??= browser.close().catch(() => {}); };
  const abort = () => { controller.abort(signal.reason); close(); };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { controller.abort(new Error('Browser check exceeded its time limit')); close(); }, options.timeoutMs ?? 45_000);
  const boundedPush = (array: string[], value: string) => { if (array.length < 20) array.push(value.slice(0, 2000)); };
  run.status = 'running';
  try {
    await saveBrowserRun(root, run);
    signal.throwIfAborted();
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Independent browser checks require Node 20 or later');
    if (contentHash(options.html) !== run.previewHash || contentHash(JSON.stringify(plan)) !== run.planHash) throw new Error('Browser run content hash mismatch');
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: options.executablePath, timeout: 10_000 });
    if (controller.signal.aborted) { close(); controller.signal.throwIfAborted(); }
    run.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: run.viewport, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', async (route) => { boundedPush(run.blockedRequests, route.request().url()); await route.abort(); });
    await context.routeWebSocket('**/*', (socket) => { boundedPush(run.blockedRequests, socket.url()); socket.close(); });
    const page = await context.newPage();
    context.on('page', (popup) => { if (popup !== page) void popup.close().catch(() => {}); });
    page.on('pageerror', (error) => boundedPush(run.errors, error.message));
    page.on('console', (message) => { if (message.type() === 'error') boundedPush(run.errors, message.text()); });
    page.on('dialog', (dialog) => void dialog.dismiss().catch(() => {}));
    page.setDefaultTimeout(2000);
    // Opaque sandbox prevents generated code accessing the trusted parent document.
    await page.setContent('<style>html,body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe id="app" sandbox="allow-scripts allow-forms"></iframe>');
    await page.locator('#app').evaluate((element, html) => new Promise<void>((resolve) => {
      element.addEventListener('load', () => resolve(), { once: true });
      (element as HTMLIFrameElement).srcdoc = html;
    }), options.html);
    const frame = page.frameLocator('#app');
    await frame.locator('css=body').waitFor();
    const directory = join(root, run.projectId, 'browser-runs', run.id);
    await mkdir(directory, { recursive: true });
    const screenshot = async (name: 'initial.png' | 'final.png') => {
      await page.screenshot({ path: join(directory, name), timeout: 3000, animations: 'disabled' });
      run.screenshots.push(name);
    };
    await screenshot('initial.png');
    for (const check of plan.checks) {
      controller.signal.throwIfAborted();
      let actual = '';
      try {
        for (const action of check.actions) {
          controller.signal.throwIfAborted();
          const target = frame.locator(`css=${action.selector}`);
          if (await target.count() !== 1) throw new Error(`Selector must match exactly one element: ${action.selector}`);
          if (action.type === 'click') await target.click();
          else if (action.type === 'input') {
            if (await target.evaluate((element) => element.tagName) === 'SELECT') await target.selectOption(action.value);
            else await target.fill(action.value);
          }
          else await target.press(action.key);
        }
        const target = frame.locator(`css=${check.selector}`);
        if (await target.count() !== 1) throw new Error(`Selector must match exactly one element: ${check.selector}`);
        const deadline = Date.now() + 2000;
        do {
          controller.signal.throwIfAborted();
          actual = (await target.textContent() || '').trim();
          if (actual === check.expected) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        if (actual !== check.expected) throw new Error(`Expected ${JSON.stringify(check.expected)}, observed ${JSON.stringify(actual.slice(0, 300))}`);
        run.checks.push({ name: check.name, status: 'passed', actual: actual.slice(0, 300) });
      } catch (error) {
        controller.signal.throwIfAborted();
        run.checks.push({ name: check.name, status: 'failed', actual: actual.slice(0, 300), error: (error instanceof Error ? error.message : String(error)).slice(0, 2000) });
      }
    }
    await screenshot('final.png');
    controller.signal.throwIfAborted();
    run.status = run.errors.length || run.blockedRequests.length || run.checks.some((check) => check.status === 'failed') ? 'failed' : 'passed';
  } catch (error) {
    run.status = signal.aborted ? 'cancelled' : 'failed';
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    run.error = (reason instanceof Error ? reason.message : String(reason)).slice(0, 2000);
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    close(); await closing;
    run.finishedAt = new Date().toISOString();
    await saveBrowserRun(root, run);
  }
  return run;
}
