import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockSearchProvider, DuckDuckGoSearchProvider, SearXNGSearchProvider, createSearchProvider } from '../search.js';

function withSearchEnv(values: Record<string, string>, check: () => void) {
  const keys = ['SEARCH_PROVIDER', 'BRAVE_SEARCH_API_KEY', 'TAVILY_API_KEY', 'SEARXNG_BASE_URL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key) => { process.env[key] = values[key] || ''; });
    check();
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

describe('Search providers', () => {
  it('MockSearchProvider should return synthetic results', async () => {
    const provider = new MockSearchProvider();
    const results = await provider.search('test query', 3);

    assert.equal(results.length, 3);
    assert.equal(results[0].source, 'mock-search');
    assert.ok(results[0].title.includes('test query'));
    assert.ok(results[0].url);
  });

  it('defaults to real key-free search and respects explicit providers', () => {
    withSearchEnv({}, () => assert.equal(createSearchProvider().name, 'duckduckgo'));
    withSearchEnv({ SEARCH_PROVIDER: 'mock', BRAVE_SEARCH_API_KEY: 'test-key' }, () => assert.equal(createSearchProvider().name, 'mock'));
    withSearchEnv({ SEARCH_PROVIDER: 'duckduckgo', BRAVE_SEARCH_API_KEY: 'test-key' }, () => assert.equal(createSearchProvider().name, 'duckduckgo'));
    withSearchEnv({ SEARCH_PROVIDER: 'unknown' }, () => assert.throws(() => createSearchProvider(), /Unknown SEARCH_PROVIDER/));
    withSearchEnv({ SEARXNG_BASE_URL: 'http://localhost:8888' }, () => assert.equal(createSearchProvider().name, 'searxng'));
  });

  it('createSearchProvider should return BraveSearchProvider when key set', () => {
    withSearchEnv({ BRAVE_SEARCH_API_KEY: 'test-key' }, () => assert.equal(createSearchProvider().name, 'brave'));
  });

  it('parses HTML links and original snippets, resolving redirects and deduplicating', async () => {
    const html = `<div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsource.test%2Fone">First &amp; source</a><a class="result__snippet">Original <b>excerpt</b> &amp; evidence</a></div>
      <div class="result__body"><a class="result__a" href="https://source.test/one">Duplicate</a><span class="result__snippet">Duplicate excerpt</span></div>
      <div class="result__body"><a class="result__a" href="javascript:alert(1)">Invalid</a><span class="result__snippet">Ignored</span></div>
      <div class="result__body"><a class="result__a" href="https://source.test/two">Second</a><span class="result__snippet">Second excerpt</span></div>`;
    const provider = new DuckDuckGoSearchProvider((async (url) => {
      assert.equal(new URL(String(url)).searchParams.get('q'), 'game accessibility');
      return new Response(html);
    }) as typeof fetch);
    const results = await provider.search('game accessibility', 2);
    assert.deepEqual(results.map(({ url, content }) => ({ url, content })), [
      { url: 'https://source.test/one', content: 'Original excerpt & evidence' },
      { url: 'https://source.test/two', content: 'Second excerpt' },
    ]);
    assert.equal(results[0].title, 'First & source');
    assert.equal(results[0].source, 'duckduckgo-html');
  });

  it('reports HTTP errors, verification pages, and unusable results without synthesis', async () => {
    for (const response of [new Response('Busy', { status: 429 }), new Response('<form id="anomaly-form"></form>', { status: 202 }), new Response('<html>No results</html>')]) {
      const provider = new DuckDuckGoSearchProvider((async () => response) as typeof fetch);
      await assert.rejects(provider.search('test'), /HTTP 429|human verification|no usable/);
    }
  });

  it('aborts an in-flight search when its task is cancelled', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new DuckDuckGoSearchProvider((async (_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true });
        controller.abort(new Error('JOB_CANCELLED'));
      });
    }) as typeof fetch);
    await assert.rejects(provider.search('test', 3, controller.signal), /JOB_CANCELLED/);
    assert.equal(requestSignal?.aborted, true);
  });

  it('reads SearXNG JSON and preserves distinct source URLs and excerpts', async () => {
    const provider = new SearXNGSearchProvider('http://localhost:8888', (async (url) => {
      assert.equal(new URL(String(url)).pathname, '/search');
      assert.equal(new URL(String(url)).searchParams.get('format'), 'json');
      return new Response(JSON.stringify({ results: [
        { title: 'One', url: 'https://source.test/one', content: 'Original excerpt' },
        { title: 'Duplicate', url: 'https://source.test/one', content: 'Same source' },
        { title: 'Invalid', url: 'javascript:alert(1)', content: 'Ignore' },
      ] }));
    }) as typeof fetch);
    assert.deepEqual((await provider.search('test')).map(({ url, content }) => ({ url, content })), [
      { url: 'https://source.test/one', content: 'Original excerpt' },
    ]);
    await assert.rejects(new SearXNGSearchProvider('http://localhost:8888', (async () => new Response('Disabled', { status: 403 })) as typeof fetch).search('test'), /JSON search/);
  });
});
