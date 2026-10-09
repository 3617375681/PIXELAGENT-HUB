export type BrowserCheck = { name: string; actions: ({ type: 'click'; selector: string } | { type: 'input'; selector: string; value: string } | { type: 'key'; selector: string; key: string })[]; selector: string; expected: string; assertion?: 'text' | 'disabled' };
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
      const observed = check.assertion === 'disabled' ? String(target.matches(':disabled')) : (target.textContent || '').trim();
      actual = observed.slice(0, 300);
      if (errorCount() > previousErrors) throw new Error('Runtime error observed during this check');
      if (observed !== check.expected) throw new Error(`Expected ${JSON.stringify(check.expected)}, observed ${JSON.stringify(actual)}`);
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
