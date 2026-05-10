import { Citation } from './types.js';

export interface Retriever {
  retrieve(query: string, topK?: number): Promise<Citation[]>;
}

export const DEFAULT_KNOWLEDGE_BASE: Array<{ title: string; url: string; text: string; tags: string[] }> = [
  {
    title: 'World Economic Forum Future of Jobs',
    url: 'https://www.weforum.org/reports/the-future-of-jobs-report-2023',
    text: 'WEF discusses job displacement and creation under AI adoption and emphasizes reskilling.',
    tags: ['ai', 'jobs', 'future', 'economy', 'reskilling'],
  },
  {
    title: 'McKinsey Global Institute Automation Report',
    url: 'https://www.mckinsey.com/mgi',
    text: 'Automation changes task composition; many occupations are transformed rather than fully replaced.',
    tags: ['automation', 'jobs', 'productivity', 'workforce'],
  },
  {
    title: 'NIST AI Risk Management Framework',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework',
    text: 'AI governance needs transparency, safety controls, and continuous monitoring.',
    tags: ['ai', 'governance', 'risk', 'ethics', 'safety'],
  },
  {
    title: 'OECD AI Principles',
    url: 'https://oecd.ai/en/ai-principles',
    text: 'Responsible AI principles include fairness, accountability, and human-centered values.',
    tags: ['oecd', 'ethics', 'fairness', 'accountability'],
  },
];

export class LocalKeywordRetriever implements Retriever {
  async retrieve(query: string, topK: number = 3): Promise<Citation[]> {
    const terms = query
      .toLowerCase()
      .split(/[\s,.;:!?()\-_/]+/)
      .map((x) => x.trim())
      .filter(Boolean);

    const ranked = DEFAULT_KNOWLEDGE_BASE.map((item) => {
      const score = item.tags.reduce((acc, tag) => (terms.includes(tag) ? acc + 1 : acc), 0);
      return { item, score };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return ranked.map((x, idx) => ({
      id: `cit-${Date.now()}-${idx}`,
      sourceTitle: x.item.title,
      sourceUrl: x.item.url,
      snippet: x.item.text,
      score: x.score,
    }));
  }
}
