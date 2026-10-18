import { readCheckResults, type BrowserCheck, type BrowserCheckResult } from '../studioChecks';
import { prepareStudioPreview, readPreviewMessage } from '../studioPreview';

/**
 * PLAY LIVE checks: runs the Tester's declarative checks inside a hidden sandboxed iframe
 * (scripts only, no same-origin access) using the same bridge as the dashboard's Quick checks.
 * These are in-page checks, not the server's independent Chromium runs.
 */
export async function runInPageChecks(html: string, checks: BrowserCheck[], signal?: AbortSignal, timeoutMs = 20_000): Promise<{ results: BrowserCheckResult[]; errors: string[] }> {
  const nonce = crypto.randomUUID();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts allow-forms');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;border:0;visibility:hidden';
  const errors: string[] = [];
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(() => resolve({ results: checks.map((check) => ({ name: check.name, status: 'failed', actual: '', error: `In-page checks did not finish within ${timeoutMs / 1000} seconds` })), errors })), timeoutMs);
      const abort = () => finish(() => reject(signal?.reason));
      const finish = (done: () => void) => { clearTimeout(timer); window.removeEventListener('message', receive); signal?.removeEventListener('abort', abort); done(); };
      const receive = (event: MessageEvent) => {
        const message = readPreviewMessage(event, frame.contentWindow, nonce);
        if (!message) return;
        if (message.kind === 'error' && errors.length < 20) errors.push(message.message);
        // Let deferred scripts and first paint settle before acting on the page.
        if (message.kind === 'loaded') setTimeout(() => frame.contentWindow?.postMessage({ channel: 'studio-checks', nonce, checks }, '*'), 300);
        if (message.kind === 'checks') {
          const results = readCheckResults(message.message);
          if (results && results.length === checks.length && results.every((result, index) => result.name === checks[index].name)) finish(() => resolve({ results, errors }));
        }
      };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      window.addEventListener('message', receive);
      frame.srcdoc = prepareStudioPreview(html, nonce);
      document.body.append(frame);
    });
  } finally {
    frame.remove();
  }
}
