import { MessageBusImpl } from '../src/core/MessageBus.js';
import { WriterAgent } from '../src/agents/WriterAgent.js';
import { Task } from '../src/core/types.js';

async function main() {
  console.log('🤖 Kimi API 接入测试 — WriterAgent\n');

  const bus = new MessageBusImpl();
  const writer = new WriterAgent(bus);

  const task: Task = {
    id: 'kimi-test-001',
    type: 'write',
    description: '2026年AI发展趋势',
    context: {
      style: '深度分析',
      audience: '科技从业者',
      targetLength: '1000字左右',
    },
  };

  console.log('⏳ 调用 Kimi API 生成内容...\n');

  const start = Date.now();
  const result = await writer.execute(task);
  const duration = Date.now() - start;

  console.log(`✅ 执行完成 (${duration}ms)\n`);
  console.log('状态:', result.status);
  console.log('推理:', result.reasoning);
  console.log('\n--- 生成内容预览 ---');
  console.log(result.output?.content?.substring(0, 2000) || '无内容');
  console.log('\n--- 完整内容长度:', result.output?.content?.length, '字 ---');
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
