import { describe, expect, it } from 'vitest';
import { prepareStudioPreview, readPreviewMessage } from './studioPreview';

describe('sandbox preview diagnostics', () => {
  it('installs listeners before generated scripts and escapes script-closing tokens', () => {
    const html = prepareStudioPreview('<html><head><script>throw Error("broken")</script></head></html>', '</script>');
    expect(html.indexOf("addEventListener('error'")).toBeLessThan(html.indexOf('throw Error'));
    expect(html).toContain('nonce:"\\u003c/script>"');
    expect(html).toContain("addEventListener('unhandledrejection'");
  });

  it('accepts only bounded messages from the current iframe and current preview', () => {
    const frame = {} as Window;
    const data = { channel: 'studio-preview', nonce: 'current', kind: 'error', message: 'Runtime failed' };
    const event = (source: Window, payload: unknown) => ({ source, data: payload }) as MessageEvent;
    expect(readPreviewMessage(event(frame, data), frame, 'current')).toEqual(data);
    expect(readPreviewMessage(event({} as Window, data), frame, 'current')).toBeNull();
    expect(readPreviewMessage(event(frame, data), frame, 'previous')).toBeNull();
    expect(readPreviewMessage(event(frame, { ...data, kind: 'approved' }), frame, 'current')).toBeNull();
    expect(readPreviewMessage(event(frame, { ...data, message: 'x'.repeat(2001) }), frame, 'current')).toBeNull();
    expect(readPreviewMessage(event(frame, null), frame, 'current')).toBeNull();
  });
});
