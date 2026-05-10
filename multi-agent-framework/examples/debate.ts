import { createOrchestrator } from '../src/factory.js';

async function main() {
  console.log('🎭 多 Agent 框架 — 辩论模式示例\n');

  const orchestrator = createOrchestrator('DebateClub');

  // 辩论主题
  const topic = '人工智能是否会取代大部分人类工作？';

  console.log(`📢 辩题: ${topic}`);
  console.log(`👥 参与 Agent: 研究员 vs 写手\n`);

  try {
    const rounds = await orchestrator.runDebate(topic, ['researcher', 'writer'], 3);

    console.log('✅ 辩论结束\n');

    rounds.forEach(({ round, results }) => {
      console.log(`━━━ 第 ${round} 轮 ━━━`);
      results.forEach(r => {
        console.log(`  [${r.agentId}] 立场: ${r.output?.position || '分析中'}`);
        console.log(`  推理: ${r.reasoning?.substring(0, 100)}...`);
      });
      console.log();
    });

  } catch (err) {
    console.error('❌ 辩论失败:', err);
  }
}

main().catch(console.error);
