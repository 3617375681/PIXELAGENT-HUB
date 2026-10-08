import { expect, it } from 'vitest';
import { readCheckResults, runDOMChecks } from './studioChecks';

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
