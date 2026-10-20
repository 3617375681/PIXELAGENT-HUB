import { expect, it } from 'vitest';
import { readCheckResults, runDOMChecks } from './studioChecks';

it('reads disabled state independently of button text and detects an incorrect state', async () => {
  let disabled = false;
  const button = { textContent: '4', matches: (selector: string) => selector === ':disabled' && disabled, click: () => { disabled = true; } };
  const document = { querySelectorAll: () => [button] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Initially enabled', actions: [], selector: '#answer', assertion: 'disabled', expected: 'false' },
    { name: 'Locked after answering', actions: [{ type: 'click', selector: '#answer' }], selector: '#answer', assertion: 'disabled', expected: 'true' },
    { name: 'Incorrect enabled claim', actions: [], selector: '#answer', assertion: 'disabled', expected: 'false' },
    { name: 'Text still checked normally', actions: [], selector: '#answer', expected: '4' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'failed', 'passed']);
  expect(results.map((result) => result.actual)).toEqual(['false', 'true', 'true', '4']);
});

it('executes sequential DOM actions, distinguishes assertion failures and rejects ambiguous selectors', async () => {
  const output = { textContent: '0' };
  const button = { click: () => { output.textContent = String(Number(output.textContent) + 1); } };
  const document = { querySelectorAll: (selector: string) => selector === '#value' ? [output] : selector === '#add' ? [button] : selector === '.ambiguous' ? [output, button] : [] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Initial', actions: [], selector: '#value', expected: '0' },
    { name: 'Increment', actions: [{ type: 'click', selector: '#add' }], selector: '#value', expected: '1' },
    { name: 'Wrong expected', actions: [], selector: '#value', expected: '2' },
    { name: 'Ambiguous', actions: [], selector: '.ambiguous', expected: '' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'failed', 'failed']);
  expect(results[2].actual).toBe('1');
  expect(results[3].error).toContain('found 2');
});

it('cannot turn truncated observations or runtime faults into passing assertions', async () => {
  let errors = 0;
  const document = { querySelectorAll: (selector: string) => selector === '#value' ? [{ textContent: 'x'.repeat(301) }] : [{ click: () => { errors++; } }] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Long', actions: [], selector: '#value', expected: 'x'.repeat(300) },
    { name: 'Runtime fault', actions: [{ type: 'click', selector: '#fault' }], selector: '#value', expected: 'x'.repeat(301) },
  ], () => errors);
  expect(results.every((result) => result.status === 'failed')).toBe(true);
  expect(results[1].error).toContain('Runtime error');
  expect(readCheckResults(JSON.stringify(results))).toEqual(results);
  expect(readCheckResults('[{"name":"Fake","status":"approved","actual":""}]')).toBeNull();
  expect(readCheckResults('not json')).toBeNull();
});

it('waits up to 2 s for the expected value, like the server browser runs', async () => {
  const output = { textContent: 'Loading' };
  setTimeout(() => { output.textContent = 'Ready'; }, 300);
  const document = { querySelectorAll: () => [output] } as unknown as Document;
  const [result] = await runDOMChecks(document, [{ name: 'Eventually ready', actions: [], selector: '#status', expected: 'Ready' }]);
  expect(result).toMatchObject({ status: 'passed', actual: 'Ready' });
});

it('compares text with runs of whitespace as one space, like the server', async () => {
  const output = { textContent: '  C→F: x×9/5+32  |  F→C:\n (x−32)×5/9 ' };
  const document = { querySelectorAll: () => [output] } as unknown as Document;
  const [result] = await runDOMChecks(document, [{ name: 'Formula', actions: [], selector: '#formula', expected: 'C→F: x×9/5+32 | F→C: (x−32)×5/9' }]);
  expect(result).toMatchObject({ status: 'passed', actual: 'C→F: x×9/5+32 | F→C: (x−32)×5/9' });
});

it('in-page visible assertions follow the element box and visibility, and text prefers innerText', async () => {
  let shown = false;
  const win = { textContent: 'You won!', innerText: 'You won!', getBoundingClientRect: () => ({ width: shown ? 100 : 0, height: shown ? 20 : 0 }), matches: () => false };
  const button = { click: () => { shown = true; } };
  const intro = { textContent: 'Use the arrow keys.Eat the dot.', innerText: 'Use the arrow keys.\n\nEat the dot.' };
  const document = {
    defaultView: { getComputedStyle: () => ({ visibility: 'visible' }) },
    querySelectorAll: (selector: string) => selector === '#win' ? [win] : selector === '#show' ? [button] : [intro],
  } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Hidden', actions: [], selector: '#win', assertion: 'visible', expected: 'false' },
    { name: 'Shown', actions: [{ type: 'click', selector: '#show' }], selector: '#win', assertion: 'visible', expected: 'true' },
    { name: 'Intro', actions: [], selector: '#intro', expected: 'Use the arrow keys. Eat the dot.' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'passed']);
});

it('text matches the source text when CSS changes how it is rendered (text-transform)', async () => {
  const button = { textContent: 'Pause', innerText: 'PAUSE' };
  const document = { querySelectorAll: () => [button] } as unknown as Document;
  const [result] = await runDOMChecks(document, [{ name: 'Label', actions: [], selector: '#toggle', expected: 'Pause' }]);
  expect(result).toMatchObject({ status: 'passed', actual: 'PAUSE' });
  const [wrong] = await runDOMChecks(document, [{ name: 'Label', actions: [], selector: '#toggle', expected: 'Start' }]);
  expect(wrong.status).toBe('failed');
});

it('counts all matching cards, including zero, and polls for added cards', async () => {
  const cards = Array.from({ length: 16 }, () => ({ textContent: 'Card' }));
  const remove = { click: () => { cards.pop(); } };
  const document = { querySelectorAll: (selector: string) => selector === '.card' ? cards : selector === '#remove' ? [remove] : [] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Full board', actions: [], selector: '.card', assertion: 'count', expected: '16' },
    { name: 'Missing card', actions: [{ type: 'click', selector: '#remove' }], selector: '.card', assertion: 'count', expected: '16' },
    { name: 'Empty', actions: [], selector: '.absent', assertion: 'count', expected: '0' },
    { name: 'Ambiguous action', actions: [{ type: 'click', selector: '.card' }], selector: '.card', assertion: 'count', expected: '15' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['passed', 'failed', 'passed', 'failed']);
  expect(results.slice(0, 3).map((result) => result.actual)).toEqual(['16', '15', '0']);
  expect(results[3].error).toContain('found 15');
  setTimeout(() => cards.push({ textContent: 'Card' }), 100);
  const [added] = await runDOMChecks(document, [{ name: 'Added later', actions: [], selector: '.card', assertion: 'count', expected: '16' }]);
  expect(added).toMatchObject({ status: 'passed', actual: '16' });
});

it('reads exact attributes after clicks, polls updates and reports missing attributes as empty', async () => {
  let hunger = '100';
  const bar = { getAttribute: (name: string) => name === 'aria-valuenow' ? hunger : name === 'title' ? '  hungry  now ' : null };
  const button = { click: () => { setTimeout(() => { hunger = '90'; }, 100); } };
  const document = { querySelectorAll: (selector: string) => selector === '#hungerBar' ? [bar] : [button] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Hunger changes', actions: [{ type: 'click', selector: '#play' }], selector: '#hungerBar', assertion: 'attribute', attribute: 'aria-valuenow', expected: '90' },
    { name: 'Exact whitespace', actions: [], selector: '#hungerBar', assertion: 'attribute', attribute: 'title', expected: '  hungry  now ' },
    { name: 'Missing', actions: [], selector: '#hungerBar', assertion: 'attribute', attribute: 'data-state', expected: 'ready' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'failed']);
  expect(results.map((result) => result.actual)).toEqual(['90', '  hungry  now ', '']);
});

it('reads live input, textarea and select values after input actions', async () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const input = { tagName, value: 'initial', getAttribute: () => 'initial', dispatchEvent: () => true };
    const document = { querySelectorAll: () => [input] } as unknown as Document;
    const [result] = await runDOMChecks(document, [{ name: tagName, actions: [{ type: 'input', selector: '#input', value: '  updated ' }], selector: '#input', assertion: 'attribute', attribute: 'value', expected: '  updated ' }]);
    expect(result).toMatchObject({ status: 'passed', actual: '  updated ' });
  }
});

it.each(['element', 'ancestor', 'partial'])('visibility accounts for %s opacity', async (mode) => {
  const parent = { opacity: mode === 'ancestor' ? '0' : '1', parentElement: null };
  const target = { opacity: mode === 'element' ? '0' : '0.5', parentElement: parent, getBoundingClientRect: () => ({ width: 100, height: 20 }) };
  const document = { querySelectorAll: () => [target], defaultView: { getComputedStyle: (element: { opacity: string }) => ({ visibility: 'visible', opacity: element.opacity }) } } as unknown as Document;
  const [result] = await runDOMChecks(document, [{ name: mode, actions: [], selector: '#overlay', assertion: 'visible', expected: String(mode === 'partial') }]);
  expect(result.status).toBe('passed');
});

it('reads live checked state before and after a checkbox click', async () => {
  const input = { tagName: 'INPUT', checked: false, getAttribute: () => null, click: () => { input.checked = !input.checked; } };
  const document = { querySelectorAll: () => [input] } as unknown as Document;
  const results = await runDOMChecks(document, [
    { name: 'Before', actions: [], selector: '#check', assertion: 'attribute', attribute: 'checked', expected: 'false' },
    { name: 'After', actions: [{ type: 'click', selector: '#check' }], selector: '#check', assertion: 'attribute', attribute: 'checked', expected: 'true' },
  ]);
  expect(results.map(({ status, actual }) => ({ status, actual }))).toEqual([{ status: 'passed', actual: 'false' }, { status: 'passed', actual: 'true' }]);
});
