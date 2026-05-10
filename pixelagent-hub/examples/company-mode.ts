import { createOrchestrator } from '../src/factory.js';
import { Task } from '../src/core/types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SessionRecord = {
  sessionId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed';
  task: Task;
  plan?: any;
  research?: any;
  drafts: any[];
  reviews: any[];
  finalReview?: any;
  finalDraft?: any;
  notes: string[];
};

function createSessionId(taskId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${ts}_${taskId}`;
}

async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = join(process.cwd(), 'records', 'company-mode', sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function persistSession(sessionDir: string, record: SessionRecord): Promise<void> {
  await writeFile(join(sessionDir, 'session.json'), JSON.stringify(record, null, 2), 'utf-8');
}

async function persistMarkdown(sessionDir: string, record: SessionRecord): Promise<void> {
  const draft = record.finalDraft;
  if (!draft?.content) return;
  const md = `# ${draft.title || '未命名交付'}\n\n` +
    `- Session ID: ${record.sessionId}\n` +
    `- Started At: ${record.startedAt}\n` +
    `- Finished At: ${record.finishedAt || ''}\n` +
    `- Status: ${record.status}\n` +
    `- Word Count: ${draft.wordCount || draft.content.length}\n\n` +
    `---\n\n${draft.content}\n`;
  await writeFile(join(sessionDir, 'output.md'), md, 'utf-8');
}

// 一人公司模式：严格层级 + 审核循环 + 最终交付
async function runCompany() {
  console.log('🏢 一人公司模式 — 内容生产流水线\n');

  const orchestrator = createOrchestrator('OnePersonCompany');

  // 查看组织架构
  console.log('【组织架构】');
  orchestrator.getAgentList().forEach(agent => {
    const level = agent.id === 'director' ? 'C-level' :
                  agent.id === 'manager' ? '管理层' :
                  agent.id === 'senior_editor' ? '审核层' :
                  '执行层';
    console.log(`  [${level}] ${agent.name} (${agent.id})`);
  });
  console.log();

  // 项目：交付给用户的内容
  const task: Task = {
    id: 'company-project-001',
    type: 'content_delivery',
    description: '撰写一篇关于「AI 替代焦虑」的深度分析文章',
    context: {
      targetLength: '3000字',
      style: '深度分析',
      audience: '公众号读者',
      deadline: '今天',
    },
  };

  console.log(`📋 项目需求: ${task.description}`);
  console.log(`🎯 交付标准: ${task.context?.targetLength || '未指定'}, 风格: ${task.context?.style || '未指定'}\n`);

  const sessionId = createSessionId(task.id);
  const sessionDir = await ensureSessionDir(sessionId);
  const notes: string[] = [];
  const record: SessionRecord = {
    sessionId,
    startedAt: new Date().toISOString(),
    status: 'running',
    task,
    drafts: [],
    reviews: [],
    notes,
  };
  await persistSession(sessionDir, record);
  console.log(`🗂️ 本次记录目录: ${sessionDir}\n`);

  try {
    // 阶段 1：项目经理拆解
    console.log('━━━ 阶段 1: 项目经理拆解 ━━━');
    const plan = await orchestrator.runTask(task, 'manager');
    record.plan = plan;
    notes.push('manager_planning_done');
    await persistSession(sessionDir, record);
    console.log(`✅ ${plan.reasoning}`);
    console.log(`📐 计划: ${plan.output.plan.map((s: any) => s.type).join(' → ')}\n`);

    // 阶段 2：研究
    console.log('━━━ 阶段 2: 研究员调研 ━━━');
    const research = await orchestrator.runTask({
      ...task,
      id: 'research-001',
    }, 'researcher');
    record.research = research;
    notes.push('research_done');
    await persistSession(sessionDir, record);
    console.log(`✅ 调研完成: ${research.output.summary}\n`);

    // 阶段 3-5：写作 → 审核 → 修改（循环直到通过）
    let round = 1;
    let approved = false;
    let currentDraft: any = null;
    const reviewHistory: any[] = [];

    while (!approved && round <= 5) {
      console.log(`━━━ 阶段 3: 写手撰写 (第 ${round} 轮) ━━━`);
      const draft = await orchestrator.runTask({
        ...task,
        id: `draft-${round}`,
        context: {
          ...task.context,
          researchData: research.output,
          revisionNotes: round > 1 ? reviewHistory[reviewHistory.length - 1]?.output?.requiredChanges : null,
        },
      }, 'writer');
      currentDraft = draft.output;
      record.drafts.push(draft);
      record.finalDraft = currentDraft;
      await persistSession(sessionDir, record);
      console.log(`✅ 初稿完成: ${draft.output.wordCount} 字\n`);

      console.log(`━━━ 阶段 4: 资深编辑审核 (第 ${round} 轮) ━━━`);
      const review = await orchestrator.runTask({
        ...task,
        id: `review-${round}`,
        context: {
          ...task.context,
          draft: currentDraft,
          round,
        },
      }, 'senior_editor');
      reviewHistory.push(review);
      record.reviews.push(review);
      await persistSession(sessionDir, record);

      if (review.status === 'success') {
        approved = true;
        console.log(`✅ ${review.reasoning}\n`);
      } else {
        console.log(`❌ ${review.reasoning}`);
        console.log(`📝 需要修改: ${review.output?.requiredChanges?.join(', ')}\n`);
        round++;
      }
    }

    if (!approved) {
      console.log('⚠️ 超过最大审核轮数，项目终止\n');
      record.status = 'failed';
      record.finishedAt = new Date().toISOString();
      notes.push('max_round_exceeded');
      await persistSession(sessionDir, record);
      await persistMarkdown(sessionDir, record);
      return;
    }

    // 阶段 6：总监终审
    console.log('━━━ 阶段 5: 内容总监终审 ━━━');
    const final = await orchestrator.runTask({
      ...task,
      id: 'final-review',
      context: {
        draft: currentDraft,
        reviewHistory,
      },
    }, 'director');
    record.finalReview = final;

    if (final.status === 'success') {
      console.log(`✅ ${final.reasoning}`);
      console.log(`📊 质量评分: ${final.output.qualityScore}/100`);
      console.log(`🔄 打磨轮数: ${final.output.totalRounds}\n`);

      // 交付
      console.log('━━━ 🎁 交付物 ━━━');
      console.log(`标题: ${currentDraft.title}`);
      console.log(`字数: ${currentDraft.wordCount}`);
      console.log(`质量: 已通过 ${final.output.totalRounds} 轮审核`);
      console.log('\n--- 正文预览 ---');
      console.log(currentDraft.content.substring(0, 500) + '...');
      console.log('\n--- 交付完成 ---');
      record.status = 'success';
      notes.push('final_approved');
    } else {
      console.log(`❌ ${final.reasoning}`);
      console.log('项目终止，内容未通过终审。');
      record.status = 'failed';
      notes.push('final_rejected');
    }
    record.finishedAt = new Date().toISOString();
    await persistSession(sessionDir, record);
    await persistMarkdown(sessionDir, record);
    await writeFile(join(sessionDir, 'notes.txt'), notes.join('\n'), 'utf-8');

  } catch (err) {
    console.error('❌ 项目失败:', err);
    record.status = 'failed';
    record.finishedAt = new Date().toISOString();
    notes.push(`runtime_error:${(err as Error).message}`);
    await persistSession(sessionDir, record);
    await writeFile(join(sessionDir, 'error.txt'), String(err), 'utf-8');
  }
}

runCompany().catch(console.error);
