import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalEmbeddingRetriever } from './embeddingRetriever.js';

function fakeFetch(): typeof fetch {
  return (async (_input: any, init?: any) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const text = String(body.input || body.prompt || '');
    const len = text.length;
    const vowels = (text.match(/[aeiou]/gi) || []).length;
    const consonants = (text.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
    return {
      ok: true,
      json: async () => ({ embeddings: [[len, vowels, consonants]] }),
    } as any;
  }) as typeof fetch;
}

test('LocalEmbeddingRetriever builds index and retrieves nearest chunks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'emb-retriever-'));
  try {
    const retriever = new LocalEmbeddingRetriever({
      storePath: join(dir, 'vector-store.json'),
      model: 'qwen3:14b',
      fetchImpl: fakeFetch(),
    });
    await retriever.buildIndex([
      { id: 'a', title: 'Doc A', text: 'AI jobs and workforce transition' },
      { id: 'b', title: 'Doc B', text: 'Kubernetes cluster operations and networking' },
    ]);
    const out = await retriever.retrieve('jobs transition', 1);
    assert.equal(out.length, 1);
    assert.equal(typeof out[0].sourceTitle, 'string');
    assert.equal(typeof out[0].snippet, 'string');
    const stats = await retriever.stats();
    assert.equal(stats.model, 'qwen3:14b');
    assert.equal(stats.chunks > 0, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

