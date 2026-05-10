import { Citation } from './types.js';

export interface Retriever {
  retrieve(query: string, topK?: number): Promise<Citation[]>;
}

export const DEFAULT_KNOWLEDGE_BASE: Array<{ title: string; url: string; text: string; tags: string[] }> = [
  {
    title: 'World Economic Forum Future of Jobs',
    url: 'https://www.weforum.org/reports/the-future-of-jobs-report-2023',
    text: 'WEF discusses job displacement and creation under AI adoption and emphasizes reskilling. Analytical thinking and creative thinking are the most important skills for workers. 44% of workers\' core skills are expected to change by 2027.',
    tags: ['ai', 'jobs', 'future', 'economy', 'reskilling', 'skills'],
  },
  {
    title: 'McKinsey Global Institute Automation Report',
    url: 'https://www.mckinsey.com/mgi',
    text: 'Automation changes task composition; many occupations are transformed rather than fully replaced. By 2030, up to 30% of hours worked globally could be automated. Generative AI accelerates automation potential for knowledge work.',
    tags: ['automation', 'jobs', 'productivity', 'workforce', 'generative-ai'],
  },
  {
    title: 'NIST AI Risk Management Framework',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework',
    text: 'AI governance needs transparency, safety controls, and continuous monitoring. The AI RMF 1.0 provides a structured approach to manage AI risks across the lifecycle. Trustworthy AI characteristics include: valid & reliable, safe, secure & resilient, accountable & transparent, explainable & interpretable, privacy-enhanced, and fair with harmful bias managed.',
    tags: ['ai', 'governance', 'risk', 'ethics', 'safety', 'framework'],
  },
  {
    title: 'OECD AI Principles',
    url: 'https://oecd.ai/en/ai-principles',
    text: 'Responsible AI principles include fairness, accountability, and human-centered values. Inclusive growth, sustainable development, and well-being. Human-centered values and fairness. Transparency and explainability. Robustness, security, and safety. Accountability.',
    tags: ['oecd', 'ethics', 'fairness', 'accountability', 'governance'],
  },
  {
    title: 'EU AI Act',
    url: 'https://artificialintelligenceact.eu/',
    text: 'The European Union AI Act classifies AI systems by risk level: unacceptable risk (prohibited), high risk (strict requirements), limited risk (transparency obligations), and minimal risk (no regulation). General-purpose AI models face additional requirements including transparency and systemic risk assessment.',
    tags: ['regulation', 'eu', 'risk', 'governance', 'compliance'],
  },
  {
    title: 'Stanford AI Index Report 2024',
    url: 'https://aiindex.stanford.edu/report/',
    text: 'AI beats humans on some benchmarks but trails on complex reasoning and planning. Industry produces 51 notable ML models while academia produces 15. Frontier model training costs reach tens of millions. Generative AI investment surges to $25.2 billion.',
    tags: ['ai', 'research', 'benchmarks', 'industry', 'investment'],
  },
  {
    title: 'Anthropic Constitutional AI',
    url: 'https://www.anthropic.com/research',
    text: 'Constitutional AI trains language models using a set of principles rather than human feedback alone. The approach uses AI-generated feedback guided by a constitution to train safer, more helpful models. RLHF plus constitutional principles yields more robust alignment.',
    tags: ['alignment', 'safety', 'training', 'rlhf', 'anthropic'],
  },
  {
    title: 'OpenAI GPT-4 Technical Report',
    url: 'https://arxiv.org/abs/2303.08774',
    text: 'GPT-4 is a multimodal model exhibiting human-level performance on professional benchmarks. It passes the bar exam in the top 10% and achieves strong results on academic benchmarks. The report discusses safety mitigations including adversarial testing and red-teaming.',
    tags: ['gpt-4', 'benchmarks', 'openai', 'multimodal', 'safety'],
  },
  {
    title: 'Google DeepMind AlphaFold',
    url: 'https://deepmind.google/technologies/alphafold/',
    text: 'AlphaFold predicts protein structures with atomic accuracy, solving a 50-year grand challenge. Over 200 million protein structures predicted and released. Applications in drug discovery, disease understanding, and synthetic biology.',
    tags: ['science', 'biology', 'deepmind', 'breakthrough', 'protein'],
  },
  {
    title: 'RAG: Retrieval-Augmented Generation Survey',
    url: 'https://arxiv.org/abs/2312.10997',
    text: 'Retrieval-Augmented Generation combines LLMs with external knowledge bases to reduce hallucination and improve factual accuracy. The RAG pipeline includes indexing, retrieval, reranking, and generation. Advanced techniques include self-RAG, corrective RAG, and agentic RAG.',
    tags: ['rag', 'retrieval', 'llm', 'knowledge-base', 'accuracy'],
  },
  {
    title: 'Multi-Agent Systems: A Survey',
    url: 'https://arxiv.org/abs/2308.11432',
    text: 'LLM-based multi-agent systems enable collaborative problem-solving through role specialization, debate, and consensus mechanisms. Key patterns include centralized orchestration, decentralized collaboration, and hierarchical teams. Applications span software development, content creation, scientific research, and decision support.',
    tags: ['multi-agent', 'collaboration', 'orchestration', 'llm', 'survey'],
  },
  {
    title: 'Chain-of-Thought Prompting Elicits Reasoning',
    url: 'https://arxiv.org/abs/2201.11903',
    text: 'Chain-of-thought prompting significantly improves LLM performance on arithmetic, commonsense, and symbolic reasoning tasks. By generating intermediate reasoning steps, models achieve state-of-the-art results on GSM8K, SVAMP, and other benchmarks.',
    tags: ['prompting', 'reasoning', 'cot', 'benchmarks', 'technique'],
  },
  {
    title: 'Tree of Thoughts: Deliberate Problem Solving',
    url: 'https://arxiv.org/abs/2305.10601',
    text: 'Tree of Thoughts extends chain-of-thought by exploring multiple reasoning paths simultaneously. The approach uses BFS/DFS search with self-evaluation to find optimal solutions. Shows 4x improvement over chain-of-thought on tasks requiring planning and search.',
    tags: ['prompting', 'reasoning', 'planning', 'technique', 'cot'],
  },
  {
    title: 'Effective Prompt Engineering Guide',
    url: 'https://www.promptingguide.ai/',
    text: 'Prompt engineering techniques include zero-shot, few-shot, chain-of-thought, self-consistency, generated knowledge prompting, and automatic prompt engineering. Effective prompts are clear, specific, provide context, use delimiters, and specify output format.',
    tags: ['prompting', 'technique', 'guide', 'best-practices'],
  },
  {
    title: 'AI Agents: A Comprehensive Introduction',
    url: 'https://lilianweng.github.io/posts/2023-06-23-agent/',
    text: 'AI agents combine LLMs with planning, memory, and tool use. Key components: planning (task decomposition, self-reflection), memory (short-term, long-term), and tool use (API calls, code execution). ReAct and MRKL are foundational agent architectures.',
    tags: ['agent', 'planning', 'memory', 'tools', 'architecture'],
  },
  {
    title: 'Software 2.0 and the Future of Programming',
    url: 'https://karpathy.medium.com/software-2-0-a64152b37c35',
    text: 'Software 2.0 is written in neural network weights rather than explicit code. The programming paradigm shifts from writing instructions to collecting datasets and defining architectures. Software engineering will increasingly involve prompt engineering, data curation, and model evaluation.',
    tags: ['software', 'programming', 'neural-networks', 'future', 'paradigm-shift'],
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
