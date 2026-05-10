import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockSearchProvider, createSearchProvider } from '../search.js';

describe('Search providers', () => {
  it('MockSearchProvider should return synthetic results', async () => {
    const provider = new MockSearchProvider();
    const results = await provider.search('test query', 3);

    assert.equal(results.length, 3);
    assert.equal(results[0].source, 'mock-search');
    assert.ok(results[0].title.includes('test query'));
    assert.ok(results[0].url);
  });

  it('createSearchProvider should return MockSearchProvider by default', () => {
    const provider = createSearchProvider();
    assert.equal(provider.name, 'mock');
  });

  it('createSearchProvider should return BraveSearchProvider when key set', () => {
    const prevKey = process.env.BRAVE_SEARCH_API_KEY;
    process.env.BRAVE_SEARCH_API_KEY = 'test-key';

    const provider = createSearchProvider();
    assert.equal(provider.name, 'brave');

    if (prevKey) process.env.BRAVE_SEARCH_API_KEY = prevKey;
    else delete process.env.BRAVE_SEARCH_API_KEY;
  });
});
