import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createLLMProvider } from '../src/core/llm/factory.js';
import { MessageBusImpl } from '../src/core/MessageBus.js';
import { SeniorEditorAgent } from '../src/agents/SeniorEditorAgent.js';
import { WriterAgent } from '../src/agents/WriterAgent.js';

async function verifyLiveReview() {
  // Explicit, paid live verification; never part of the automatic test suite.
  const provider = createLLMProvider();
  if (!provider || provider.name === 'mock') throw new Error('Configure a real LLM provider before running live verification');
  const sourceRecord = 'docs/software-studio/search-authoritative-verification.json';
  const search = JSON.parse(await readFile(sourceRecord, 'utf-8'));
  assert.equal(search.status, 'success');
  assert.ok(search.results.length >= 3);
  const bus = new MessageBusImpl();
  const editor = new SeniorEditorAgent(bus, provider);
  const writer = new WriterAgent(bus, provider);
  const task = { id: 'live-review', type: 'content_delivery', description: search.query, _exec: { signal: AbortSignal.timeout(360_000) } };
  const report: Record<string, any> = { startedAt: new Date().toISOString(), provider: provider.name, model: provider.model, sourceRecord, drafts: [], reviews: [] };
  try {
    // This intentionally bad input is a test draft, not fabricated model output.
    const first = await editor.execute({ ...task, context: { draft: {
      title: 'Bad draft', content: 'Browser games must use only mouse control. Accessibility is unnecessary. There is nothing to test.', wordCount: 18,
    } } });
    report.reviews.push(first);
    assert.equal(first.output?.verdict, 'rejected');
    assert.equal(first.status, 'partial');
    console.log(JSON.stringify({ phase: 'initial_review', verdict: first.output.verdict, score: first.output.score }));
    let review = first;
    for (let round = 1; round <= 3; round++) {
      const draft = await writer.execute({ ...task, context: {
        researchData: { topic: search.query, summary: 'Use the following real search excerpts; distinguish reported claims from implementation suggestions.', sources: search.results },
        revisionNotes: review.output.requiredChanges,
      targetLength: '500 words', audience: 'browser game developers', style: 'Practical, accurate guidance with source URLs and actionable checks. Distinguish published WCAG 2.x from draft WCAG 3 guidance; do not imply compliance guarantees.',
      } });
      report.drafts.push(draft);
      assert.equal(draft.status, 'success');
      review = await editor.execute({ ...task, context: { draft: draft.output, round } });
      report.reviews.push(review);
      console.log(JSON.stringify({ phase: 'revision_review', round, verdict: review.output?.verdict, status: review.status }));
      assert.notEqual(review.status, 'failed');
      if (review.output.verdict === 'approved') break;
    }
    assert.equal(review.output.verdict, 'approved', 'Live model did not approve within the bounded revision rounds');
    report.status = 'success';
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile('docs/software-studio/review-live-verification.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, error: report.error, record: 'docs/software-studio/review-live-verification.json' }));
  }
}

void verifyLiveReview().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
