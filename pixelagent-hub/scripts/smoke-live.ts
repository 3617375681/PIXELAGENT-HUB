/**
 * End-to-end check of the built static site (replay + PLAY LIVE) in Chromium, before it is published.
 * The model is answered by MockProvider through a route on api.deepseek.com, so no key or network
 * model call is needed: the browser still runs esbuild-wasm, the shared inliner and sandboxed checks.
 *
 *   npx tsx scripts/smoke-live.ts [dashboard/dist/public] [/BASE/]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { MockProvider } from '../src/core/llm/mock.js';

const dist = resolve(process.argv[2] || 'dashboard/dist/public');
const base = process.argv[3] || '/';
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  if (!path.startsWith(base)) { res.writeHead(404).end(); return; }
  let file = join(dist, path.slice(base.length));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const TEST_KEY = 'sk-smoke-0000000000000000000000000000';
const mock = new MockProvider();
const browser = await chromium.launch(process.env.STUDIO_BROWSER_EXECUTABLE ? { executablePath: process.env.STUDIO_BROWSER_EXECUTABLE } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  const external = new Set<string>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { const url = new URL(request.url()); if (url.origin !== origin) external.add(url.host); });
  await page.route('https://api.deepseek.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    assert.equal(route.request().headers().authorization, `Bearer ${TEST_KEY}`);
    const reply = await mock.askWithUsage(body.messages[0].content, body.messages[1].content);
    const chunk = { model: 'mock', choices: [{ delta: { content: reply.content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n` });
  });

  // Replay: the hero recording plays to its end and the galleries render.
  await page.goto(`${origin}${base}`);
  await page.waitForFunction(() => /All \d+ checks passed|Checks failed/.test(document.body.innerText), null, { timeout: 60_000 });
  assert.ok(await page.locator('#studio-showcase').count(), 'showcase gallery renders');
  assert.ok(await page.locator('#studio-gallery').count(), 'comparison gallery renders');

  // PLAY LIVE: key dialog → mock-backed run with a real compile failure, repair, build and checks.
  await page.getByRole('button', { name: /BUILD LIVE/ }).click();
  await page.locator('#live-key').fill(TEST_KEY);
  await page.getByRole('button', { name: /SAVE & BUILD/ }).click();
  await page.waitForURL(/studio\/live-/, { timeout: 15_000 });
  await page.waitForFunction(() => /Built\. Ready to play|Run failed/.test(document.body.innerText), null, { timeout: 120_000 });
  const stages = (await page.locator('.studio-stage').allInnerTexts()).map((text) => text.replace(/\s+/g, ' '));
  assert.match(stages[1], /Coder R2/, `the Coder repaired a real esbuild error: ${stages[1]}`);
  assert.match(stages[3], /All checks passed 4\/4/, `in-page checks passed: ${stages[3]}`);
  assert.match(await page.frameLocator('iframe[title="The built app"]').locator('body').innerText(), /MOCK PIXEL COUNTER/);

  // The key never leaves the tab except to the provider, and the run stays within allowed hosts.
  assert.ok(!page.url().includes(TEST_KEY));
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('pixelagent:live'))), []);
  for (const host of external) assert.ok(['api.deepseek.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(host), `unexpected request to ${host}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, stages, external: [...external] }));
} finally {
  await browser.close();
  server.close();
}
