import { Orchestrator } from './Orchestrator.js';
import { ConversationTurn, EvidenceBundle, RunTrace, Task, TaskRunControl } from './types.js';
import { Retriever } from './retriever.js';
import { KnowledgeStore } from './KnowledgeStore.js';

export class RoundtableRunner {
  private orchestrator: Orchestrator;
  private retriever: Retriever;
  private participants: string[];
  private maxRounds: number;

  constructor(orchestrator: Orchestrator, retriever: Retriever, participants: string[], maxRounds: number = 4) {
    this.orchestrator = orchestrator;
    this.retriever = retriever;
    this.participants = participants;
    this.maxRounds = maxRounds;
  }

  async run(topic: string, control?: TaskRunControl): Promise<{ trace: RunTrace; final: any; memory: Record<string, any> }> {
    const memory = new KnowledgeStore(topic);
    const conversation: ConversationTurn[] = [];
    const actions: RunTrace['actions'] = [];
    const startedAt = new Date().toISOString();
    let converged = false;

    for (let round = 1; round <= this.maxRounds; round++) {
      try {
      if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
      control?.emit?.({ type: 'roundtable_round_start', round });
      const moderation = await this.orchestrator.runTask(
        {
          id: `moderate-${round}`,
          type: 'moderate',
          description: topic,
          context: { participants: this.participants, round, maxRounds: this.maxRounds, memory: memory.getSummaryPrompt() },
        },
        'moderator',
        control
      );
      const speakerId = moderation.output?.nextSpeaker || this.participants[(round - 1) % this.participants.length];
      actions.push({
        agentId: 'moderator',
        action: 'select_next_speaker',
        reasoning: moderation.reasoning,
        payload: moderation.output,
      });

      const evidence = await this.buildEvidence(topic, round);
      const task: Task = {
        id: `roundtable-${round}-${speakerId}`,
        type: 'roundtable',
        description: topic,
        context: {
          round,
          evidence,
          memorySummary: memory.getSummaryPrompt(),
          previousConversation: conversation.slice(-6),
          style: '结构化辩论',
        },
      };
      const result = await this.orchestrator.runTask(task, speakerId, control);
      control?.emit?.({ type: 'roundtable_speaker_done', round, agentId: speakerId, status: result.status });
      const message = this.pickMessage(result.output);
      const turn: ConversationTurn = {
        turnId: `turn-${round}`,
        round,
        speakerId,
        speakerRole: speakerId,
        message,
        action: round === this.maxRounds ? 'decision' : 'analysis',
        evidence,
        timestamp: new Date().toISOString(),
      };
      conversation.push(turn);
      memory.updateFromTurn(turn);
      actions.push({
        agentId: speakerId,
        action: 'speak',
        reasoning: result.reasoning,
      });
      if (moderation.output?.converged === true || round >= this.maxRounds) {
        converged = true;
        break;
      }
      } catch (err) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'roundtable.round_failed',
          topic,
          round,
          participants: this.participants,
          error: String(err),
          at: new Date().toISOString(),
        }));
        throw err;
      }
    }

    const trace: RunTrace = {
      mode: 'roundtable',
      startedAt,
      finishedAt: new Date().toISOString(),
      rounds: conversation.length,
      converged,
      actions,
      conversation,
    };

    return {
      trace,
      final: {
        topic,
        summary: conversation.map((x) => `R${x.round}/${x.speakerId}: ${x.message.slice(0, 120)}`).join('\n'),
      },
      memory: memory.snapshot(),
    };
  }

  private async buildEvidence(topic: string, round: number): Promise<EvidenceBundle> {
    const query = `${topic} round ${round} evidence`;
    const citations = await this.retriever.retrieve(query, 3);
    return { query, citations };
  }

  private pickMessage(output: any): string {
    if (!output) return 'No output';
    if (typeof output === 'string') return output;
    if (typeof output.content === 'string') return output.content;
    if (typeof output.summary === 'string') return output.summary;
    if (typeof output.verdict === 'string') return `${output.verdict} (score: ${output.score ?? 'n/a'})`;
    return JSON.stringify(output).slice(0, 240);
  }
}
