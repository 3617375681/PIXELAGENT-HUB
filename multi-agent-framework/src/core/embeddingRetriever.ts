import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Citation } from './types.js';
import { Retriever } from './retriever.js';
import { defaultScorerWeights, loadScorerWeights, scoreChunk } from './retrievalScorer.js';

export type KnowledgeDocument = {
  id?: string;
  title: string;
  text: string;
  sourceUrl?: string;
  tags?: string[];
};

type StoredChunk = {
  id: string;
  docId: string;
  title: string;
  sourceUrl?: string;
  text: string;
  tags: string[];
  embedding: number[];
};

type VectorStore = {
  version: 1;
  model: string;
  dim: number;
  updatedAt: string;
  chunks: StoredChunk[];
};

type EmbeddingRetrieverOptions = {
  storePath: string;
  ollamaBaseUrl?: string;
  model?: string;
  chunkSize?: number;
  overlap?: number;
  defaultDocuments?: KnowledgeDocument[];
  fetchImpl?: typeof fetch;
  /** Optional linear rerank weights (JSON), tuned via POST /api/intelligence/self-improve. */
  scorerWeightsPath?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  const step = Math.max(1, chunkSize - overlap);
  while (start < clean.length) {
    const end = Math.min(clean.length, start + chunkSize);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start += step;
  }
  return chunks;
}

class OllamaEmbeddingClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, model: string, fetchImpl: typeof fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async embed(input: string): Promise<number[]> {
    // Prefer /api/embed (new), fallback to /api/embeddings (old).
    const endpoints = ['/api/embed', '/api/embeddings'];
    let lastErr = 'unknown';
    for (const ep of endpoints) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${ep}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, input, prompt: input }),
        });
        if (!res.ok) {
          lastErr = `${ep} ${res.status}`;
          continue;
        }
        const body = (await res.json()) as any;
        const fromEmbed = body?.embeddings?.[0];
        const fromEmbeddings = body?.embedding;
        const vector = Array.isArray(fromEmbed) ? fromEmbed : Array.isArray(fromEmbeddings) ? fromEmbeddings : null;
        if (!vector) {
          lastErr = `${ep} invalid response`;
          continue;
        }
        return vector.map((x: unknown) => Number(x) || 0);
      } catch (err) {
        lastErr = String(err);
      }
    }
    throw new Error(`OLLAMA_EMBED_FAILED_${lastErr}`);
  }
}

export class LocalEmbeddingRetriever implements Retriever {
  private readonly storePath: string;
  private readonly model: string;
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly defaultDocuments: KnowledgeDocument[];
  private readonly embedClient: OllamaEmbeddingClient;
  private readonly scorerWeightsPath?: string;
  private store: VectorStore | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: EmbeddingRetrieverOptions) {
    this.storePath = options.storePath;
    this.scorerWeightsPath = options.scorerWeightsPath;
    this.model = options.model || 'qwen3:14b';
    this.chunkSize = Math.max(100, options.chunkSize ?? 500);
    this.overlap = Math.max(0, Math.min(this.chunkSize - 1, options.overlap ?? 80));
    this.defaultDocuments = options.defaultDocuments || [];
    this.embedClient = new OllamaEmbeddingClient(
      options.ollamaBaseUrl || 'http://127.0.0.1:11434',
      this.model,
      options.fetchImpl || fetch
    );
  }

  async retrieve(query: string, topK: number = 3): Promise<Citation[]> {
    await this.ensureInitialized();
    const store = this.store!;
    if (store.chunks.length === 0) return [];
    const q = await this.embedClient.embed(query);
    const weights = this.scorerWeightsPath
      ? await loadScorerWeights(this.scorerWeightsPath)
      : defaultScorerWeights();
    const scored = store.chunks
      .map((c) => {
        const cos = cosineSimilarity(q, c.embedding);
        return {
          chunk: c,
          score: scoreChunk(weights, cos, c.text.length),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
    return scored.map((x, idx) => ({
      id: `emb-${Date.now()}-${idx}`,
      sourceTitle: x.chunk.title,
      sourceUrl: x.chunk.sourceUrl,
      snippet: x.chunk.text,
      score: Number(x.score.toFixed(6)),
    }));
  }

  async buildIndex(documents: KnowledgeDocument[]): Promise<{ chunks: number; dim: number }> {
    const chunks: StoredChunk[] = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const docId = doc.id || `doc-${Date.now()}-${i}`;
      const pieces = splitIntoChunks(doc.text, this.chunkSize, this.overlap);
      for (let j = 0; j < pieces.length; j++) {
        const text = pieces[j];
        const embedding = await this.embedClient.embed(text);
        chunks.push({
          id: `${docId}-chunk-${j + 1}`,
          docId,
          title: doc.title,
          sourceUrl: doc.sourceUrl,
          text,
          tags: doc.tags || [],
          embedding,
        });
      }
    }
    const dim = chunks[0]?.embedding.length || 0;
    this.store = {
      version: 1,
      model: this.model,
      dim,
      updatedAt: nowIso(),
      chunks,
    };
    await this.persist();
    return { chunks: chunks.length, dim };
  }

  async stats(): Promise<{ model: string; chunks: number; dim: number; updatedAt?: string }> {
    await this.ensureInitialized();
    const s = this.store!;
    return { model: s.model, chunks: s.chunks.length, dim: s.dim, updatedAt: s.updatedAt };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.store) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const raw = await readFile(this.storePath, 'utf-8');
          this.store = JSON.parse(raw) as VectorStore;
          if (this.store.model !== this.model) {
            // Model changed -> rebuild to avoid mixing dimensions.
            await this.buildIndex(this.defaultDocuments);
          }
          return;
        } catch {
          // no store
        }
        if (this.defaultDocuments.length > 0) {
          await this.buildIndex(this.defaultDocuments);
          return;
        }
        this.store = {
          version: 1,
          model: this.model,
          dim: 0,
          updatedAt: nowIso(),
          chunks: [],
        };
        await this.persist();
      })();
    }
    await this.initPromise;
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }
}

