import { createOrchestrator } from '../src/factory.js';
import { Task } from '../src/core/types.js';

async function main() {
  console.log('⚡ 多 Agent 框架 — 并行执行示例\n');

  const orchestrator = createOrchestrator('ParallelTask');

  // 同一任务分发给多个 Agent 同时执行
  const task: Task = {
    id: 'multi-analysis',
    type: 'analysis',
    description: '分析当前全球经济形势',
    context: {
      regions: ['US', 'CN', 'EU'],
      focus: 'trade',
    },
  };

  console.log(`📋 任务: ${task.description}`);
  console.log(`🔄 并行分发给: 研究员 + 程序员\n`);

  try {
    const results = await orchestrator.runParallel(task, ['researcher', 'coder']);

    console.log('✅ 并行执行完成\n');

    results.forEach((result, index) => {
      console.log(`[Agent ${index + 1}] ${result.agentId}`);
      console.log(`  状态: ${result.status}`);
      console.log(`  输出类型:`, typeof result.output);
      console.log();
    });

  } catch (err) {
    console.error('❌ 并行执行失败:', err);
  }
}

main().catch(console.error);
