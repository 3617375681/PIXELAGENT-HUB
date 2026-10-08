import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportPanel } from './ExportPanel';
import type { Workflow } from '../../types/agent';

describe('export provenance', () => {
  for (const source of ['mock', 'records-api', 'empty', undefined] as const) {
    it(`keeps ${source || 'unknown'} source and never treats completed rounds as acceptance`, () => {
      const workflow: Workflow = { id: 'session-proof', source, name: 'Example', description: 'Example', currentRound: 1, rounds: [{ id: 'r1', roundNumber: 1, status: 'completed', timestamp: 0, agents: [], messages: [] }] };
      const html = renderToStaticMarkup(<ExportPanel workflow={workflow} isOpen onClose={() => {}} />);
      expect(html).toContain(`&quot;source&quot;: &quot;${source || 'unknown'}&quot;`);
      expect(html).toContain('&quot;acceptance&quot;: &quot;not_verified&quot;');
      expect(html).toContain('not proof of tests, deployment or acceptance');
      if (source === 'mock' || source === 'records-api') expect(html).toContain('&quot;sessionId&quot;: &quot;session-proof&quot;');
      else expect(html).toContain('&quot;sessionId&quot;: null');
    });
  }
});
