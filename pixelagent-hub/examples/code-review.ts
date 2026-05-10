import { createOrchestrator } from '../src/factory.js';
import { Task } from '../src/core/types.js';

async function main() {
  console.log('🧪 Multi-Agent Demo — Code Review Pipeline\n');

  const orchestrator = createOrchestrator('CodeReviewStudio');
  const task: Task = {
    id: 'code-review-demo-001',
    type: 'code',
    description: '实现一个带重试机制的 HTTP 请求工具函数，并确保错误处理健壮',
    context: {
      language: 'typescript',
      constraints: ['可测试', '可复用', '超时可配置'],
    },
  };

  console.log(`📋 Task: ${task.description}`);
  console.log('🔄 Pipeline: code-review (coder -> reviewer)\n');

  try {
    const { results, finalOutput } = await orchestrator.runPipeline('code-review', task);
    results.forEach((result, idx) => {
      console.log(`[Step ${idx + 1}] ${result.agentId}`);
      console.log(`  status: ${result.status}`);
      console.log(`  reasoning: ${result.reasoning}`);
      console.log();
    });
    console.log('✅ Final output preview:');
    console.log(JSON.stringify(finalOutput, null, 2).slice(0, 800));
  } catch (err) {
    console.error('❌ Code review demo failed:', err);
  }
}

main().catch(console.error);
