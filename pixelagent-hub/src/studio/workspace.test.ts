import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { buildStaticProject, createSourceArchive, validateFiles } from './workspace.js';

const files = [
  { path: 'index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body><button id="start">Start</button><script src="game.js"></script></body></html>' },
  { path: 'style.css', content: 'body { color: green; font-family: "Courier New", monospace; }' },
  { path: 'game.js', content: 'document.querySelector("#start").addEventListener("click", () => { document.body.dataset.started = "true"; });' },
];

test('build produces real compiled preview and a recoverable source archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-build-'));
  try {
    const report = await buildStaticProject(files, directory);
    assert.equal(report.status, 'passed');
    assert.equal(report.browserVerified, false);
    const preview = await readFile(join(directory, 'dist/index.html'), 'utf-8');
    assert.match(preview, /src="data:application\/javascript;base64,/);
    assert.match(Buffer.from(preview.match(/src="data:application\/javascript;base64,([^"]+)"/)![1], 'base64').toString(), /dataset.started/);
    assert.match(preview, /Content-Security-Policy/);
    assert.match(preview, /font-family: "Courier New"/);
    assert.doesNotMatch(preview, /src="game.js"|href="style.css"/);
    assert.equal(await readFile(join(directory, 'source/game.js'), 'utf-8'), files[2].content);
    const archive = unzipSync(createSourceArchive(files, preview, report));
    assert.equal(strFromU8(archive['source/game.js']), files[2].content);
    assert.equal(strFromU8(archive['preview/index.html']), preview);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const path of ['../escape.js', '/escape.js', 'C:/escape.js', 'a\\escape.js', 'CON.js', 'a/../escape.js', '.env', 'game.ts']) {
  test(`reject unsafe or unsupported source path: ${path}`, () => {
    assert.throws(() => validateFiles([...files, { path, content: 'x' }]));
  });
}

test('reject duplicates, missing entrypoint and excessive source sizes before writing', () => {
  assert.throws(() => validateFiles([...files, { path: 'GAME.js', content: '' }]), /Duplicate/);
  assert.throws(() => validateFiles(files.slice(1)), /index.html/);
  assert.throws(() => validateFiles([{ path: 'index.html', content: 'x'.repeat(1_000_001) }]), /limit/);
});

for (const [name, broken] of [
  ['syntax error', [{ path: 'index.html', content: '<script src="game.js"></script>' }, { path: 'game.js', content: 'const = ;' }]],
  ['host import', [{ path: 'index.html', content: '<script src="game.js"></script>' }, { path: 'game.js', content: 'import x from "node:fs"; console.log(x);' }]],
  ['missing asset', [{ path: 'index.html', content: '<script src="missing.js"></script>' }]],
] as const) {
  test(`build failure is saved and no preview is published: ${name}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-failed-'));
    try {
      const report = await buildStaticProject(broken, directory);
      assert.equal(report.status, 'failed');
      assert.ok(report.errors.length);
      assert.equal(JSON.parse(await readFile(join(directory, 'build-report.json'), 'utf-8')).status, 'failed');
      await assert.rejects(stat(join(directory, 'dist/index.html')));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
