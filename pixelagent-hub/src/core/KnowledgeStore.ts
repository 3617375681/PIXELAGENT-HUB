import { Citation, ConversationTurn } from './types.js';

type MemoryNode = {
  key: string;
  summary: string;
  citations: Citation[];
  updatedAt: string;
};

export class KnowledgeStore {
  private topic: string;
  private nodes: Map<string, MemoryNode> = new Map();
  private unresolved: string[] = [];
  private conflicts: string[] = [];

  constructor(topic: string) {
    this.topic = topic;
  }

  updateFromTurn(turn: ConversationTurn): void {
    const key = `${turn.speakerId}:${turn.action}`;
    const summary = turn.message.slice(0, 220);
    const citations = turn.evidence?.citations || [];
    this.nodes.set(key, {
      key,
      summary,
      citations,
      updatedAt: turn.timestamp,
    });
    if (turn.action === 'question') {
      this.unresolved.push(summary);
      this.unresolved = this.unresolved.slice(-8);
    }
  }

  addConflict(message: string): void {
    this.conflicts.push(message);
    this.conflicts = this.conflicts.slice(-8);
  }

  getSummaryPrompt(): string {
    const nodeList = Array.from(this.nodes.values()).slice(-6);
    const keyFacts = nodeList.map((n) => `- ${n.summary}`).join('\n');
    const unresolved = this.unresolved.slice(-3).map((x) => `- ${x}`).join('\n');
    return [
      `Topic: ${this.topic}`,
      'Key facts:',
      keyFacts || '- (none)',
      'Unresolved:',
      unresolved || '- (none)',
      'Conflicts:',
      this.conflicts.length ? this.conflicts.map((x) => `- ${x}`).join('\n') : '- (none)',
    ].join('\n');
  }

  snapshot(): Record<string, any> {
    return {
      topic: this.topic,
      nodes: Array.from(this.nodes.values()),
      unresolved: this.unresolved,
      conflicts: this.conflicts,
    };
  }
}
