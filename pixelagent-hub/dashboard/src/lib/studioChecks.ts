export type BrowserCheck = { name: string; actions: ({ type: 'click'; selector: string } | { type: 'input'; selector: string; value: string } | { type: 'key'; selector: string; key: string })[]; selector: string; expected: string; assertion?: 'text' | 'disabled' | 'visible' };
export type BrowserCheckResult = { name: string; status: 'passed' | 'failed'; actual: string; error?: string };

// This function is serialized into the sandbox. Keep all helpers local; no eval or model code.
export async function runDOMChecks(document: Document, checks: BrowserCheck[], errorCount: () => number = () => 0): Promise<BrowserCheckResult[]> {
  const results: BrowserCheckResult[] = [];
  const element = (selector: string): HTMLElement => {
    const matches = document.querySelectorAll(selector);
    if (matches.length !== 1) throw new Error(`Selector must match exactly one element: ${selector} (found ${matches.length})`);
    return matches[0] as HTMLElement;
  };
  for (const check of checks) {
    let actual = '';
    try {
      const previousErrors = errorCount();
      for (const action of check.actions) {
        const target = element(action.selector);
        if (action.type === 'click') target.click();
        else if (action.type === 'input') {
          if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) throw new Error('Input action requires an input, textarea or select');
          (target as HTMLInputElement).value = action.value;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (action.type === 'key') {
          target.focus(); target.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true }));
        } else throw new Error('Unsupported check action');
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const target = element(check.selector);
      // Same rules as the server's browser runs: rendered text with runs of whitespace as one space,
      // visibility like Playwright (a non-empty box, not visibility:hidden), and up to 2 s for the
      // expected value to appear (timers, transitions).
      const assertion = check.assertion || 'text';
      const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
      const expected = assertion === 'text' ? collapse(check.expected) : check.expected;
      const visible = () => {
        const box = target.getBoundingClientRect?.();
        const style = document.defaultView?.getComputedStyle?.(target);
        return !!box && box.width > 0 && box.height > 0 && style?.visibility !== 'hidden';
      };
      // Text matches either the rendered text (innerText: paragraph breaks, CSS casing) or the source
      // text (textContent); the rendered text is reported.
      const read = () => assertion === 'disabled' ? String(target.matches(':disabled'))
        : assertion === 'visible' ? String(visible())
          : collapse(target.innerText ?? target.textContent ?? '');
      const matches = (observed: string) => observed === expected || (assertion === 'text' && collapse(target.textContent ?? '') === expected);
      let observed = read();
      for (const deadline = Date.now() + 2000; !matches(observed) && Date.now() < deadline; observed = read()) await new Promise((resolve) => setTimeout(resolve, 50));
      actual = observed.slice(0, 300);
      if (errorCount() > previousErrors) throw new Error('Runtime error observed during this check');
      if (!matches(observed)) throw new Error(`Expected ${JSON.stringify(check.expected)}, observed ${JSON.stringify(actual)}`);
      results.push({ name: check.name, status: 'passed', actual });
    } catch (error) {
      results.push({ name: check.name, status: 'failed', actual, error: (error instanceof Error ? error.message : String(error)).slice(0, 2000) });
    }
  }
  return results;
}

export function readCheckResults(message: string): BrowserCheckResult[] | null {
  try {
    const results = JSON.parse(message);
    if (!Array.isArray(results) || results.length < 1 || results.length > 10 || results.some((result) => !result
      || typeof result.name !== 'string' || result.name.length > 120 || !['passed', 'failed'].includes(result.status)
      || typeof result.actual !== 'string' || result.actual.length > 300
      || (result.error !== undefined && (typeof result.error !== 'string' || result.error.length > 2000)))) return null;
    return results;
  } catch { return null; }
}
