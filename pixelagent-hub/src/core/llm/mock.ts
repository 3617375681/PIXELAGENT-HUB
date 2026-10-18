import { LLMProvider } from './provider.js';
import { LLMMessage, LLMResponse, LLMUsage, LLMProviderId, LLMProviderOptions } from './types.js';

const MOCK_USAGE: LLMUsage = {
  prompt_tokens: 1,
  completion_tokens: 1,
  total_tokens: 2,
};

/**
 * Offline / demo LLM: returns one JSON blob compatible with all preset agents (no network).
 */
export class MockProvider implements LLMProvider {
  readonly name: LLMProviderId = 'mock';
  readonly model: string;

  /** Optional per-response delay so offline demos show each stage; aborts with the caller's signal. */
  private readonly delayMs: number;

  constructor(options: LLMProviderOptions = {}) {
    this.model = options.model?.trim() || process.env.MOCK_LLM_MODEL || 'mock-echo';
    const delay = Number(process.env.MOCK_LLM_DELAY_MS || 0);
    this.delayMs = Number.isFinite(delay) && delay > 0 ? Math.min(delay, 60_000) : 0;
  }

  private async pause(signal?: AbortSignal): Promise<void> {
    if (!this.delayMs) return;
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, this.delayMs);
      const abort = () => { clearTimeout(timer); reject(signal?.reason); };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  /**
   * Software Studio needs files it can really build and checks it can really run.
   * The first coding attempt of a new project deliberately contains a syntax error so the offline
   * demo exercises the real compile → error feedback → repair loop; the retry (which receives the
   * compiler errors as revision notes) returns working code.
   */
  private studioJson(systemPrompt: string, userPrompt: string): string | null {
    if (systemPrompt.includes('browser test planner')) {
      return JSON.stringify({
        checks: [
          { name: 'Counter starts at zero', actions: [], selector: '#count', expected: '0' },
          { name: 'Increment adds one', actions: [{ type: 'click', selector: '#increment' }], selector: '#count', expected: '1' },
          { name: 'Decrement subtracts one', actions: [{ type: 'click', selector: '#decrement' }], selector: '#count', expected: '0' },
          { name: 'Reset returns to zero', actions: [{ type: 'click', selector: '#increment' }, { type: 'click', selector: '#reset' }], selector: '#count', expected: '0' },
        ],
        limitations: ['Mock tester: fixed checks for the mock counter app, not derived from the requirements'],
      });
    }
    if (!systemPrompt.includes('professional software engineer') || !userPrompt.includes('Create an offline browser app')) return null;
    const firstAttempt = /"revisionNotes":\[\]/.test(userPrompt);
    const script = [
      "const count = document.querySelector('#count');",
      "const best = document.querySelector('#best');",
      "const set = (value) => {",
      "  count.textContent = String(value);",
      "  best.textContent = String(Math.max(Number(best.textContent), value));",
      "  count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');",
      "};",
      firstAttempt ? "document.querySelector('#increment').addEventListener('click', () => set(Number(count.textContent) + 1);" : "document.querySelector('#increment').addEventListener('click', () => set(Number(count.textContent) + 1));",
      "document.querySelector('#decrement').addEventListener('click', () => set(Number(count.textContent) - 1));",
      "document.querySelector('#reset').addEventListener('click', () => set(0));",
    ].join('\n');
    return JSON.stringify({
      language: 'javascript',
      files: [
        { path: 'index.html', description: 'Counter UI', content: "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Mock Pixel Counter</title>\n<link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n<main class=\"card\">\n<p class=\"tag\">PLAYER 1</p>\n<h1>Mock Pixel Counter</h1>\n<div class=\"screen\">\n<output id=\"count\" aria-live=\"polite\">0</output>\n<span class=\"hi\">HI <b id=\"best\">0</b></span>\n</div>\n<div class=\"buttons\">\n<button id=\"decrement\" class=\"minus\" type=\"button\">-1</button>\n<button id=\"increment\" class=\"plus\" type=\"button\">+1</button>\n<button id=\"reset\" class=\"reset\" type=\"button\">Reset</button>\n</div>\n<p class=\"note\">Built offline by the mock model.</p>\n</main>\n<script src=\"app.js\"></script>\n</body>\n</html>\n" },
        { path: 'style.css', description: 'Arcade styling', content: "* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; font-family: ui-monospace, \"Cascadia Mono\", Consolas, monospace; color: #e2e8f0; background: #0b0b14; background-image: linear-gradient(rgba(34, 197, 94, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 197, 94, 0.07) 1px, transparent 1px); background-size: 16px 16px; }\n.card { width: min(100%, 360px); padding: 22px; text-align: center; background: #171726; border: 4px solid #22c55e; box-shadow: 8px 8px 0 #000, 0 0 40px rgba(34, 197, 94, 0.25); }\n.tag { margin: 0; font-size: 12px; letter-spacing: 3px; color: #f59e0b; animation: blink 1.2s steps(2) infinite; }\nh1 { margin: 6px 0 16px; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; color: #86efac; text-shadow: 3px 3px 0 #000; }\n.screen { padding: 18px 0 12px; background: #05050a; border: 4px solid #000; box-shadow: inset 0 0 0 2px #1f2937, inset 0 0 24px rgba(34, 197, 94, 0.2); }\n#count { display: block; font-size: 72px; font-weight: 700; line-height: 1; color: #22c55e; text-shadow: 0 0 12px rgba(34, 197, 94, 0.7), 4px 4px 0 #064e3b; }\n#count.pop { animation: pop 0.18s steps(3); }\n.hi { display: block; margin-top: 8px; font-size: 12px; letter-spacing: 2px; color: #64748b; }\n.hi b { color: #f59e0b; }\n.buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }\nbutton { padding: 12px 0; font-family: inherit; font-size: 18px; font-weight: 700; color: #0b0b14; border: 0; box-shadow: 0 5px 0 rgba(0, 0, 0, 0.55), inset -3px -3px 0 rgba(0, 0, 0, 0.25), inset 3px 3px 0 rgba(255, 255, 255, 0.3); cursor: pointer; }\nbutton:hover { filter: brightness(1.12); }\nbutton:active { transform: translateY(4px); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.55), inset -3px -3px 0 rgba(0, 0, 0, 0.25), inset 3px 3px 0 rgba(255, 255, 255, 0.3); }\nbutton:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }\n.minus { background: #f87171; }\n.plus { background: #22c55e; }\n.reset { background: #f59e0b; }\n.note { margin: 16px 0 0; font-size: 12px; color: #64748b; }\n@keyframes pop { 50% { transform: scale(1.18); } }\n@keyframes blink { 50% { opacity: 0.3; } }\n@media (prefers-reduced-motion: reduce) { .tag, #count.pop { animation: none; } }\n" },
        { path: 'app.js', description: 'Counter behaviour', content: `${script}\n` },
        { path: 'README.md', description: 'Run notes', content: '# Mock Pixel Counter\n\nGenerated by the offline mock model. Open index.html; use +1, -1 and Reset.\n' },
      ],
      explanation: firstAttempt
        ? 'Mock coder: first attempt intentionally contains a syntax error to exercise the build-repair loop.'
        : 'Mock coder: repaired attempt after receiving compiler errors.',
      dependencies: [],
    });
  }

  private buildJson(systemPrompt: string, userPrompt: string): string {
    const studio = this.studioJson(systemPrompt, userPrompt);
    if (studio) return studio;
    const topicMatch = userPrompt.match(/["']([^"']{1,160})["']/);
    const topic = topicMatch?.[1]?.trim() || 'task';
    const lines = [
      `# ${topic}`,
      '',
      '## Summary',
      'MockProvider offline response — valid JSON for pipeline and company modes.',
      '',
      '## Body',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(48),
      '',
      '## Demo task context',
      userPrompt,
    ];
    const longContent = lines.join('\n');

    let verdict = 'approved_for_delivery';
    if (userPrompt.includes('Provide a structured review as JSON')) {
      verdict = 'needs_revision';
    } else if (userPrompt.includes('Review the following draft')) {
      verdict = 'approved';
    } else if (userPrompt.includes('Decide if this content is ready')) {
      verdict = 'approved_for_delivery';
    }

    return JSON.stringify({
      topic,
      summary: `Structured mock research summary for "${topic}". Round progress (mock).`,
      keyPoints: ['Fact A (mock)', 'Fact B (mock)', 'Fact C (mock)'],
      sources: [],
      projectName: topic,
      goal: `Complete: ${topic}`,
      phases: [
        { id: 'p1', name: 'Research', tasks: ['Gather facts'], assignee: 'researcher', priority: 'high' },
        { id: 'p2', name: 'Deliver', tasks: ['Draft', 'Review'], assignee: 'writer', priority: 'high' },
      ],
      estimatedRounds: 2,
      risks: [] as string[],
      title: `Mock article: ${topic}`,
      content: longContent,
      wordCount: longContent.length,
      verdict,
      score: 88,
      qualityScore: 90,
      finalAssessment: 'Ready for delivery (mock).',
      mustFixBeforeDelivery: [] as string[],
      issues: [] as unknown[],
      suggestions: ['Polish headings (mock)'],
      requiredChanges: [] as string[],
      nextAction: 'forward_to_director',
      nextSpeaker: 'writer',
      guidance: 'Proceed with draft (mock).',
      converged: false,
      language: 'typescript',
      files: [
        {
          path: 'src/mock.ts',
          content: "// mock\nexport const answer = 42;\n",
          description: 'Mock file',
        },
      ],
      explanation: 'Mock implementation.',
      dependencies: [] as string[],
      deliveryPackage: {
        content: { title: `Mock: ${topic}`, content: longContent },
        qualityReport: { rounds: 1, score: 90 },
        recommendedAction: 'Deliver (mock)',
      },
      _echo: { systemLen: systemPrompt.length, userLen: userPrompt.length },
    });
  }

  async chat(messages: LLMMessage[], temperature = 0.7): Promise<string> {
    const sys = messages.find((m) => m.role === 'system')?.content ?? '';
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return this.buildJson(String(sys), String(lastUser));
  }

  async chatWithUsage(messages: LLMMessage[], temperature = 0.7, signal?: AbortSignal): Promise<LLMResponse> {
    await this.pause(signal);
    const content = await this.chat(messages, temperature);
    return { content, usage: { ...MOCK_USAGE }, model: this.model, provider: this.name };
  }

  async ask(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
    void temperature;
    return this.buildJson(systemPrompt, userPrompt);
  }

  async askWithUsage(systemPrompt: string, userPrompt: string, temperature = 0.7, signal?: AbortSignal): Promise<LLMResponse> {
    void temperature;
    await this.pause(signal);
    const content = this.buildJson(systemPrompt, userPrompt);
    return { content, usage: { ...MOCK_USAGE }, model: this.model, provider: this.name };
  }
}
