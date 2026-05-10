import { CollectedItem } from '../core/intelTypes.js';

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxItems?: number): Promise<CollectedItem[]>;
}

/** Mock search provider for development — returns synthetic results. */
export class MockSearchProvider implements SearchProvider {
  name = 'mock';

  async search(query: string, maxItems: number = 5): Promise<CollectedItem[]> {
    const now = Date.now();
    return Array.from({ length: maxItems }).map((_, idx) => ({
      id: `raw-${now}-${idx + 1}`,
      title: `${query} - result ${idx + 1}`,
      url: `https://example.com/${encodeURIComponent(query)}/${idx + 1}`,
      content: `Mock content for "${query}". This is synthetic article ${idx + 1}.`,
      publishedAt: new Date(now - idx * 60_000).toISOString(),
      source: 'mock-search',
    }));
  }
}

/** Brave Search API provider. Requires BRAVE_SEARCH_API_KEY env var. */
export class BraveSearchProvider implements SearchProvider {
  name = 'brave';
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY || '';
    this.baseUrl = 'https://api.search.brave.com/res/v1/web/search';
    if (!this.apiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY not set');
    }
  }

  async search(query: string, maxItems: number = 5): Promise<CollectedItem[]> {
    const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&count=${Math.min(maxItems, 20)}`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!resp.ok) {
      throw new Error(`Brave Search API error (${resp.status}): ${await resp.text().catch(() => '')}`);
    }

    const data = await resp.json();
    const web = data.web?.results || [];
    return web.slice(0, maxItems).map((r: any, idx: number) => ({
      id: `brave-${Date.now()}-${idx + 1}`,
      title: r.title || '',
      url: r.url || '',
      content: r.description || '',
      publishedAt: r.age ? new Date(Date.now() - Date.parse(r.age) + Date.now()).toISOString() : undefined,
      source: 'brave-search',
    }));
  }
}

/** Tavily Search API provider. Requires TAVILY_API_KEY env var. */
export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('TAVILY_API_KEY not set');
    }
  }

  async search(query: string, maxItems: number = 5): Promise<CollectedItem[]> {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: Math.min(maxItems, 20),
        include_answer: false,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Tavily API error (${resp.status}): ${await resp.text().catch(() => '')}`);
    }

    const data = await resp.json();
    const results = data.results || [];
    return results.slice(0, maxItems).map((r: any, idx: number) => ({
      id: `tavily-${Date.now()}-${idx + 1}`,
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      publishedAt: r.published_date || undefined,
      source: 'tavily-search',
    }));
  }
}

/** Creates the appropriate search provider based on environment config. */
export function createSearchProvider(): SearchProvider {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  if (provider === 'brave') return new BraveSearchProvider();
  if (provider === 'tavily') return new TavilySearchProvider();
  // Auto-detect
  if (process.env.BRAVE_SEARCH_API_KEY) return new BraveSearchProvider();
  if (process.env.TAVILY_API_KEY) return new TavilySearchProvider();
  return new MockSearchProvider();
}

/** @deprecated Use MockSearchProvider or createSearchProvider() instead. */
export const mockSearch = (query: string, maxItems?: number) =>
  new MockSearchProvider().search(query, maxItems);
