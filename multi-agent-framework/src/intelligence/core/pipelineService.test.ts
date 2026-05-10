import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowConfigService } from './workflowConfig.js';
import { IntelligenceRunStore } from './runStore.js';
import { IntelligencePipelineService } from './pipelineService.js';
import { LocalKeywordRetriever } from '../../core/retriever.js';

test('pipeline service triggers workflow and stores run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'intel-pipeline-'));
  try {
    const cfg = new WorkflowConfigService(join(dir, 'workflows.yaml'));
    await cfg.save({
      version: 1,
      workflows: [
        {
          id: 'w1',
          name: 'W1',
          enabled: true,
          trigger: { type: 'event', eventType: 'news' },
          sources: [{ kind: 'search', query: 'competitor update' }],
          analysis: { maxItems: 5, riskThreshold: 'medium' },
          decision: { autoExecuteBelow: 'high' },
          actions: [{ type: 'send_message', target: 'group', params: { text: 'notify' } }],
        },
      ],
    } as any);
    const store = new IntelligenceRunStore(join(dir, 'runs.json'));
    const svc = new IntelligencePipelineService(cfg, store);
    await svc.init();
    const run = await svc.triggerWorkflow('w1', 'manual');
    assert.equal(run.workflowId, 'w1');
    const runs = await svc.listRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status === 'completed' || runs[0].status === 'waiting_approval', true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runSelfImprove writes round artifacts and updates weights file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'intel-self-'));
  try {
    const evalDir = join(dir, 'eval');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, 'qa.json'),
      JSON.stringify({
        items: [{ query: 'NIST governance transparency', mustContain: ['governance'] }],
      }),
      'utf-8'
    );
    const cfg = new WorkflowConfigService(join(dir, 'workflows.yaml'));
    await cfg.save({
      version: 1,
      workflows: [
        {
          id: 'w1',
          name: 'W1',
          enabled: false,
          trigger: { type: 'event', eventType: 'x' },
          sources: [{ kind: 'search', query: 'x' }],
          analysis: { maxItems: 5, riskThreshold: 'medium' },
          decision: { autoExecuteBelow: 'high' },
          actions: [{ type: 'send_message', target: 'g', params: {} }],
        },
      ],
    } as any);
    const store = new IntelligenceRunStore(join(dir, 'runs.json'));
    const weightsPath = join(dir, 'intelligence', 'retrieval-scorer.json');
    const svc = new IntelligencePipelineService(cfg, store, {
      recordsRoot: dir,
      retriever: new LocalKeywordRetriever(),
      evalDatasetPath: join(evalDir, 'qa.json'),
      scorerWeightsPath: weightsPath,
    });
    await svc.init();
    const { rounds } = await svc.runSelfImprove({ rounds: 3 });
    assert.equal(rounds.length, 3);
    assert.ok(rounds[0].metric >= 0);
    const { readFile } = await import('node:fs/promises');
    const w = JSON.parse(await readFile(weightsPath, 'utf-8'));
    assert.equal(w.version, 1);
    const hist = await svc.listSelfImproveHistory(10);
    assert.ok(hist.length >= 1);
    const scorer = await svc.getRetrievalScorerWeights();
    assert.equal(scorer.path, weightsPath);
    assert.equal(scorer.weights.version, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

