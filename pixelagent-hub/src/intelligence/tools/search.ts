import { CollectedItem } from '../core/intelTypes.js';
import { load } from 'cheerio';

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxItems?: number, signal?: AbortSignal): Promise<CollectedItem[]>;
}

/** Key-free search through DuckDuckGo's public HTML results page. */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async search(query: string, maxItems: number = 5, signal?: AbortSignal): Promise<CollectedItem[]> {
    signal?.throwIfAborted();
    if (!query.trim()) throw new Error('Search query is empty');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('DuckDuckGo search timed out')), 20_000);
    try {
      const response = await this.fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error(`DuckDuckGo search HTTP ${response.status}`);
      const html = await response.text();
      controller.signal.throwIfAborted();
      const $ = load(html);
      if (response.status === 202 || $('#challenge-form, #anomaly-form').length) {
        throw new Error('DuckDuckGo requires human verification; search was not completed');
      }
      const results: CollectedItem[] = [];
      const seen = new Set<string>();
      $('.result__body').each((_index, element) => {
        if (results.length >= maxItems) return;
        const link = $(element).find('.result__a');
        const title = link.text().trim();
        const content = $(element).find('.result__snippet').text().replace(/\s+/g, ' ').trim();
        const href = link.attr('href');
        if (!href || !title || !content) return;
        try {
          const redirect = new URL(href, 'https://html.duckduckgo.com');
          const target = new URL(redirect.searchParams.get('uddg') || redirect.href);
          if (!['http:', 'https:'].includes(target.protocol) || target.hostname === 'duckduckgo.com' || target.hostname.endsWith('.duckduckgo.com') || seen.has(target.href)) return;
          seen.add(target.href);
          results.push({ id: `ddg-${Date.now()}-${results.length + 1}`, title, url: target.href, content, source: 'duckduckgo-html' });
        } catch {
          // A malformed result link is not a usable source.
        }
      });
      if (!results.length) throw new Error('DuckDuckGo returned no usable search results');
      return results;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

/** Search through a user-configured SearXNG instance; no paid search key is required. */
export class SearXNGSearchProvider implements SearchProvider {
  readonly name = 'searxng';
  private readonly endpoint: URL;

  constructor(baseUrl = process.env.SEARXNG_BASE_URL || '', private readonly fetchImpl: typeof fetch = fetch) {
    if (!baseUrl) throw new Error('SEARXNG_BASE_URL not set');
    this.endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/search`);
    if (!['http:', 'https:'].includes(this.endpoint.protocol)) throw new Error('SEARXNG_BASE_URL must use HTTP or HTTPS');
  }

  async search(query: string, maxItems: number = 5, signal?: AbortSignal): Promise<CollectedItem[]> {
    signal?.throwIfAborted();
    const url = new URL(this.endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('SearXNG search timed out')), 20_000);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`SearXNG search HTTP ${response.status}; ensure JSON search is enabled`);
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (!Array.isArray(data.results)) throw new Error('SearXNG returned invalid search results');
      const seen = new Set<string>();
      const results: CollectedItem[] = [];
      for (const item of data.results) {
        if (results.length >= maxItems) break;
        if (typeof item.title !== 'string' || typeof item.content !== 'string' || !item.content.trim() || typeof item.url !== 'string') continue;
        try {
          const target = new URL(item.url);
          if (!['http:', 'https:'].includes(target.protocol) || seen.has(target.href)) continue;
          seen.add(target.href);
          results.push({ id: `searxng-${Date.now()}-${results.length + 1}`, title: item.title, url: target.href, content: item.content, source: 'searxng' });
        } catch {
          // Ignore malformed source links.
        }
      }
      if (!results.length) throw new Error('SearXNG returned no usable search results');
      return results;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

/** Mock search provider for development — returns synthetic results. */
export class MockSearchProvider implements SearchProvider {
  name = 'mock';

  async search(query: string, maxItems: number = 5, signal?: AbortSignal): Promise<CollectedItem[]> {
    signal?.throwIfAborted();
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

  async search(query: string, maxItems: number = 5, signal?: AbortSignal): Promise<CollectedItem[]> {
    const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&count=${Math.min(maxItems, 20)}`;
    const resp = await fetch(url, {
      signal,
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

  async search(query: string, maxItems: number = 5, signal?: AbortSignal): Promise<CollectedItem[]> {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal,
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
  const provider = (process.env.SEARCH_PROVIDER || '').trim().toLowerCase();
  if (provider === 'duckduckgo') return new DuckDuckGoSearchProvider();
  if (provider === 'searxng') return new SearXNGSearchProvider();
  if (provider === 'mock') return new MockSearchProvider();
  if (provider === 'brave') return new BraveSearchProvider();
  if (provider === 'tavily') return new TavilySearchProvider();
  if (provider && provider !== 'auto') throw new Error(`Unknown SEARCH_PROVIDER: ${provider}`);
  // Auto-detect
  if (process.env.SEARXNG_BASE_URL) return new SearXNGSearchProvider();
  if (process.env.BRAVE_SEARCH_API_KEY) return new BraveSearchProvider();
  if (process.env.TAVILY_API_KEY) return new TavilySearchProvider();
  return new DuckDuckGoSearchProvider();
}

/** @deprecated Use MockSearchProvider or createSearchProvider() instead. */
export const mockSearch = (query: string, maxItems?: number) =>
  new MockSearchProvider().search(query, maxItems);
