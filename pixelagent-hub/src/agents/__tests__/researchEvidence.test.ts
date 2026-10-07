import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchAgent } from '../ResearchAgent.js';
import { MessageBusImpl } from '../../core/MessageBus.js';
import { OpenAIProvider } from '../../core/llm/openai.js';
import { SearchProvider } from '../../intelligence/tools/search.js';

const task = { id: 'evidence', type: 'research', description: 'Browser game accessibility' };
const sources = Array.from({ length: 3 }, (_, i) => ({ id: String(i), title: `Source ${i}`, url: `https://source${i}.org/article`, content: `Original excerpt ${i}`, source: 'test-search' }));

test('research preserves retrieved sources and ignores model-invented URLs', async () => {
  let prompt = '';
  const llm = new OpenAIProvider({ apiKey: 'test', fetchImpl: (async (_url, init) => {
    prompt = String(init?.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ topic: task.description, summary: 'Summary', keyPoints: ['Finding'], sources: [{ url: 'https://example.com/fake' }] }) } }] }));
  }) as typeof fetch });
  const controller = new AbortController();
  const search: SearchProvider = { name: 'test-search', search: async (query, count, signal) => {
    assert.equal(query, task.description);
    assert.equal(count, 5);
    assert.equal(signal, controller.signal);
    return sources;
  } };
  const result = await new ResearchAgent(new MessageBusImpl(), llm, search).execute({ ...task, _exec: { signal: controller.signal } });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.output.sources.map((source: { url: string }) => source.url), sources.map((source) => source.url));
  assert.equal(result.output.citations[0].snippet, sources[0].content);
  assert.equal(result.metadata?.toolCalls[0].status, 'success');
  assert.ok(prompt.includes('Original excerpt 0'));
});

test('missing retrieval, duplicate sources, and placeholder sources fail before model generation', async () => {
  let modelCalls = 0;
  const llm = new OpenAIProvider({ apiKey: 'test', fetchImpl: (async () => { modelCalls++; throw new Error('Should not be called'); }) as typeof fetch });
  for (const search of [
    { name: 'mock', search: async () => sources },
    { name: 'test', search: async () => [sources[0], sources[0], sources[0]] },
    { name: 'test', search: async () => sources.map((source) => ({ ...source, url: 'https://example.com/fake' })) },
    { name: 'test', search: async () => { throw new Error('Search unavailable'); } },
  ]) {
    const result = await new ResearchAgent(new MessageBusImpl(), llm, search).execute(task);
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
    assert.match(result.reasoning || '', /Retrieval failed/);
  }
  assert.equal(modelCalls, 0);
});
