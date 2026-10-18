import { filesSchema, type SourceFile } from './schemas.js';

/**
 * Turns validated source files into one offline preview document. Shared by the Node builder
 * (cheerio + esbuild) and the in-browser Studio (DOMParser + esbuild-wasm); each side supplies the
 * HTML adapter and compiler. Keep this module free of Node APIs.
 */
export type ScriptNode = { src?: string; type?: string; text: string; removeIntegrity(): void; setSrc(src: string): void; setText(text: string): void };
export type StylesheetNode = { href: string; replaceWithStyle(css: string): void };
export interface HtmlAdapter {
  hasEmbeddedDocuments(): boolean;
  scripts(): ScriptNode[];
  stylesheets(): StylesheetNode[];
  /** Remove every `meta[http-equiv]` and every remaining `link`. */
  removeMetaAndLinks(): void;
  prependToHead(html: string): void;
  serialize(): string;
}

export const PREVIEW_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' data:; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';

const utf8Length = (text: string) => new TextEncoder().encode(text).length;
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

// The model controls file contents, never workspace paths or shell commands.
export function validateFiles(input: unknown): SourceFile[] {
  const files = filesSchema.parse(input);
  const seen = new Set<string>();
  let bytes = 0;
  for (const file of files) {
    if (!/^[a-zA-Z0-9_./-]+\.(html|css|js|md)$/.test(file.path)
      || file.path.split('/').some((part) => !part || part === '.' || part === '..' || part.endsWith('.')
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
      throw new Error(`Unsupported or unsafe source path: ${file.path}`);
    }
    const key = file.path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate source path: ${file.path}`);
    seen.add(key);
    bytes += utf8Length(file.content);
  }
  if (bytes > 1_000_000) throw new Error('Project exceeds the 1 MB source limit');
  if (!files.some((file) => file.path === 'index.html')) throw new Error('Project requires index.html');
  return files;
}

/** Inline compiled scripts and styles into the parsed index.html; throws on unsupported markup. */
export async function inlineDocument(doc: HtmlAdapter, compiled: Map<string, string>, compileInlineScript: (code: string) => Promise<string>): Promise<string> {
  if (doc.hasEmbeddedDocuments()) throw new Error('Embedded documents and base URLs are unsupported');
  for (const node of doc.scripts()) {
    const { src, type } = node;
    if (type && ['application/json', 'application/ld+json'].includes(type)) continue;
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) throw new Error(`Unsupported script type: ${type}`);
    let code: string;
    if (src) {
      const path = src.replace(/^\.\//, '');
      if (!path.endsWith('.js') || !compiled.has(path)) throw new Error(`Missing or external script: ${src}`);
      code = compiled.get(path)!;
    } else code = await compileInlineScript(node.text || '');
    node.removeIntegrity();
    // Local data URLs retain external-script scheduling: defer/async and module type.
    // Turning a head defer script into a classic inline script runs it before the DOM.
    if (src) node.setSrc(`data:application/javascript;base64,${utf8ToBase64(code)}`);
    else node.setText(code.replace(/<\/script/gi, '<\/script'));
  }
  for (const link of doc.stylesheets()) {
    const path = link.href.replace(/^\.\//, '');
    if (!path.endsWith('.css') || !compiled.has(path)) throw new Error(`Missing or external stylesheet: ${link.href}`);
    link.replaceWithStyle(compiled.get(path)!.replace(/<\/style/gi, '<\/style'));
  }
  // Restrict networking even when the exported preview is opened outside the dashboard.
  doc.removeMetaAndLinks();
  doc.prependToHead(PREVIEW_CSP);
  return doc.serialize();
}
