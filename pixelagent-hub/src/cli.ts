#!/usr/bin/env node
import 'dotenv/config';
import { createOrchestrator } from './factory.js';

function printUsage() {
  console.log(`PixelAgent Hub CLI

Usage:
  npx pixelagent <mode> <description> [options]

Modes:
  pipeline     Sequential agent chain
  parallel     Multiple agents simultaneously
  debate       Multi-round structured debate
  vote         Weighted voting
  roundtable   Moderated discussion
  company      One-person company workflow

Examples:
  npx pixelagent pipeline "Write about AI safety"
  npx pixelagent debate "Is monorepo better?" --rounds 3
  npx pixelagent company "Launch the new landing page"

Environment:
  LLM_PROVIDER    LLM provider (openai|anthropic|deepseek|kimi|ollama)
  OPENAI_API_KEY  API key for your provider
`);
}

function parseArgs(args: string[]) {
  const options: Record<string, string | number | boolean> = {};
  const positional: string[] = [];

  let i = 2;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        options[key] = isNaN(Number(val)) ? val : Number(val);
        i += 2;
      } else {
        options[key] = true;
        i += 1;
      }
    } else {
      positional.push(args[i]);
      i += 1;
    }
  }

  return { mode: positional[0], description: positional.slice(1).join(' '), options };
}

async function main() {
  const args = process.argv;

  if (args.includes('--help') || args.includes('-h') || args.length < 3) {
    printUsage();
    process.exit(0);
  }

  const { mode, description, options } = parseArgs(args);

  if (!mode || !description) {
    console.error('Error: mode and description are required\n');
    printUsage();
    process.exit(1);
  }

  console.log(`PixelAgent Hub — ${mode} mode`);
  console.log(`Task: ${description}`);
  console.log('---');

  const orchestrator = createOrchestrator('CLI');

  try {
    const task = {
      id: `cli-${Date.now()}`,
      type: 'content',
      description,
      context: {},
    };

    const startTime = Date.now();
    let result: any;

    switch (mode) {
      case 'pipeline':
        result = await orchestrator.runPipeline('content-creation', task);
        console.log('\nFinal Output:');
        console.log(result.finalOutput?.content || JSON.stringify(result.finalOutput, null, 2));
        break;

      case 'parallel': {
        const agentIds = typeof options.agents === 'string'
          ? options.agents.split(',')
          : ['researcher', 'coder'];
        result = await orchestrator.runParallel(task, agentIds);
        console.log('\nParallel Results:');
        for (const r of result) {
          console.log(`\n[${r.agentId}] ${r.status}`);
          console.log(r.output?.summary || JSON.stringify(r.output, null, 2)?.slice(0, 300));
        }
        break;
      }

      case 'debate': {
        const agentIds = typeof options.agents === 'string'
          ? options.agents.split(',')
          : ['researcher', 'writer'];
        const rounds = Number(options.rounds || 3);
        result = await orchestrator.runDebate(description, agentIds, rounds);
        const lastRound = result[result.length - 1];
        console.log(`\nDebate (${rounds} rounds):`);
        for (const r of lastRound.results) {
          console.log(`[${r.agentId}] ${r.output?.position || r.output?.summary || r.reasoning}`);
        }
        break;
      }

      case 'vote': {
        const agentIds = typeof options.agents === 'string'
          ? options.agents.split(',')
          : ['researcher', 'writer', 'reviewer'];
        const threshold = Number(options.threshold || 0.6);
        result = await orchestrator.runVote(description, agentIds, { threshold });
        console.log(`\nVote Results (threshold: ${threshold}):`);
        console.log(`Winner: ${result.winner.agentId} (score: ${result.winner.score})`);
        for (const c of result.candidates) {
          console.log(`  ${c.agentId}: ${c.score} — ${c.rationale}`);
        }
        break;
      }

      case 'company': {
        const knowledgeStoreModule = await import('./core/KnowledgeStore.js');
        const memory = new knowledgeStoreModule.KnowledgeStore(description);
        result = { finalOutput: 'See records/ for full output' };

        // Manager
        const plan = await orchestrator.runTask(task, 'manager');
        console.log(`\n[Manager] Plan created: ${plan.output?.phases?.length || 0} phases`);

        // Research
        const research = await orchestrator.runTask(
          { ...task, id: `research-${task.id}` },
          'researcher'
        );
        console.log(`[Researcher] Done`);

        // Write
        const draft = await orchestrator.runTask(
          { ...task, id: `draft-${task.id}`, context: { researchData: research.output } },
          'writer'
        );
        console.log(`[Writer] Draft: ${draft.output?.wordCount || 0} chars`);

        // Review
        const review = await orchestrator.runTask(
          { ...task, id: `review-${task.id}`, context: { draft: draft.output } },
          'senior_editor'
        );
        console.log(`[Editor] ${review.output?.verdict} (score: ${review.output?.score})`);

        // Director
        const final = await orchestrator.runTask(
          { ...task, id: `final-${task.id}`, context: { draft: draft.output, reviewHistory: [review] } },
          'director'
        );
        console.log(`[Director] ${final.output?.verdict}`);

        if (final.output?.verdict === 'approved_for_delivery') {
          console.log('\nFinal draft:');
          console.log(draft.output?.content?.slice(0, 500));
        }
        break;
      }

      case 'roundtable': {
        const RoundtableRunner = (await import('./core/RoundtableRunner.js')).RoundtableRunner;
        // Prefer embedding-based retriever when Ollama is available, fall back to keyword
        let retriever: any;
        try {
          const { LocalEmbeddingRetriever } = await import('./core/embeddingRetriever.js');
          const storePath = process.env.EMBEDDING_STORE_PATH || './records/embedding-store.json';
          retriever = new LocalEmbeddingRetriever({
            storePath,
            model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
            defaultDocuments: (await import('./core/retriever.js')).DEFAULT_KNOWLEDGE_BASE,
          });
          // Build index if store doesn't exist yet
          try {
            await retriever.buildIndex();
          } catch {
            // Ollama not running — fall back to keyword retriever
            retriever = new (await import('./core/retriever.js')).LocalKeywordRetriever();
          }
        } catch {
          retriever = new (await import('./core/retriever.js')).LocalKeywordRetriever();
        }
        const participants = typeof options.agents === 'string'
          ? options.agents.split(',')
          : ['researcher', 'writer', 'reviewer'];
        const rounds = Number(options.rounds || 4);
        const runner = new RoundtableRunner(orchestrator, retriever, participants, rounds);
        result = await runner.run(description);
        console.log('\nRoundtable:');
        for (const turn of result.trace.conversation || []) {
          console.log(`[${turn.speakerRole}] ${turn.message.slice(0, 200)}`);
        }
        break;
      }

      default:
        console.error(`Unknown mode: ${mode}`);
        console.log('Available modes: pipeline, parallel, debate, vote, roundtable, company');
        process.exit(1);
    }

    const duration = Date.now() - startTime;
    console.log(`\n--- Completed in ${duration}ms ---`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
