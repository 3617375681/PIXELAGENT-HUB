import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { runSoftwareStudio } from './softwareStudio.js';

class FixtureProvider extends MockProvider {
  codes = 0;
  revisionPrompt = '';
  constructor(private alwaysBroken = false) { super(); }
  async askWithUsage(system: string, user: string) {
    if (system.includes('project manager')) return super.askWithUsage(system, user);
    this.codes++;
    this.revisionPrompt = user;
    return { content: JSON.stringify({ language: 'javascript', files: [
      { path: 'index.html', content: '<html><body><button>Start</button><script src="game.js"></script></body></html>', description: 'UI' },
      { path: 'game.js', content: this.alwaysBroken || this.codes === 1 ? 'const = ;' : 'document.body.dataset.ready = "true";', description: 'Game' },
    ], explanation: 'Test fixture', dependencies: [] }), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'fixture', provider: 'mock' as const };
  }
}

for (const alwaysBroken of [false, true]) {
  test(`compiler evidence controls bounded revision flow, alwaysBroken=${alwaysBroken}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-flow-'));
    try {
      const provider = new FixtureProvider(alwaysBroken);
      const record = await runSoftwareStudio({ description: 'Create a game', root, orchestrator: createOrchestrator('fixture', provider) });
      assert.equal(record.status, alwaysBroken ? 'failed' : 'ready_for_review');
      assert.equal(record.rounds.length, alwaysBroken ? 3 : 2);
      assert.equal(record.rounds[0].build?.status, 'failed');
      assert.match(provider.revisionPrompt, /revisionNotes/);
      assert.ok(provider.revisionPrompt.includes(JSON.stringify(record.rounds[0].build!.errors[0]).slice(1, -1)));
      assert.equal(JSON.parse(await readFile(join(root, record.projectId, 'project.json'), 'utf-8')).status, record.status);
      if (!alwaysBroken) assert.ok((await readFile(join(root, record.projectId, 'source.zip'))).length);
      else assert.equal(record.archiveFile, undefined);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('pre-cancelled generation persists cancellation and never calls agents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-cancel-'));
  try {
    const provider = new FixtureProvider();
    const signal = AbortSignal.abort(new Error('Cancelled fixture'));
    const record = await runSoftwareStudio({ description: 'Create a game', root, signal, orchestrator: createOrchestrator('fixture', provider) });
    assert.equal(record.status, 'cancelled');
    assert.equal(provider.codes, 0);
    assert.equal(record.plan, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
