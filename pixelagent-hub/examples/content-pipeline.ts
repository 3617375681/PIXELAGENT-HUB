import { createOrchestrator } from '../src/factory.js';
import { Task } from '../src/core/types.js';

async function main() {
  console.log('🚀 多 Agent 框架 — 内容创作流水线示例\n');

  const orchestrator = createOrchestrator('ContentStudio');

  // 查看已注册的 Agent
  console.log('已注册 Agent:');
  orchestrator.getAgentList().forEach(agent => {
    console.log(`  - ${agent.name} (${agent.id}): ${agent.capabilities.join(', ')}`);
  });
  console.log();

  // 任务：生成一篇关于 AI 趋势的文章
  const task: Task = {
    id: 'article-ai-trends',
    type: 'content',
    description: '2026 年 AI 发展趋势分析',
    context: {
      style: 'formal',
      audience: 'tech_readers',
      keywords: ['AI', '2026', 'trends'],
    },
  };

  console.log(`📋 任务: ${task.description}`);
  console.log(`🔄 执行流水线: content-creation\n`);

  try {
    const { results, finalOutput } = await orchestrator.runPipeline('content-creation', task);

    console.log('✅ 流水线执行完成\n');

    // 展示每个步骤的结果
    results.forEach((result, index) => {
      const stepNames = ['研究员', '写手', '审校员'];
      console.log(`[步骤 ${index + 1}] ${stepNames[index]} (${result.agentId})`);
      console.log(`  状态: ${result.status}`);
      console.log(`  输出:`, JSON.stringify(result.output, null, 2).substring(0, 300) + '...');
      console.log();
    });

    console.log('📄 最终输出（审校后的文章）:');
    console.log(finalOutput);

  } catch (err) {
    console.error('❌ 流水线执行失败:', err);
  }
}

main().catch(console.error);
