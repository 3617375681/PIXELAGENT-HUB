import { createOrchestrator } from '../src/factory.js';

async function main() {
  console.log('🗳️ Multi-Agent Demo — Vote Mode\n');
  const orchestrator = createOrchestrator('VoteModeDemo');
  const topic = '是否优先投入资源开发内置评测系统，而不是继续扩展 Agent 数量？';
  const result = await orchestrator.runVote(topic, ['researcher', 'writer', 'reviewer'], {
    threshold: 0.6,
    tieBreakBy: 'highest_score',
    weights: {
      reviewer: 1.1,
    },
  });
  console.log('Winner:', result.winner.agentId, 'score=', result.winner.score);
  console.log('Confidence:', result.confidence);
  console.log('Score breakdown:', result.scoreBreakdown);
}

main().catch(console.error);
