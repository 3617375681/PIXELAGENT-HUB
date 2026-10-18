import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { inlineDocument, validateFiles, type HtmlAdapter } from '@studio-shared/inline';

/**
 * PLAY LIVE builder: the same validation, compile and inlining rules as the Node builder
 * (src/studio/workspace.ts), with esbuild-wasm and DOMParser instead of esbuild and cheerio.
 */
export type LiveBuild = { status: 'passed' | 'failed'; tool: 'esbuild'; errors: string[]; checkedFiles: string[]; browserVerified: false; html?: string };

type Esbuild = typeof import('esbuild-wasm');
let loading: Promise<Esbuild> | undefined;
const esbuild = () => (loading ??= import('esbuild-wasm').then(async (module) => {
  await module.initialize({ wasmURL, worker: true });
  return module;
}));

async function compileScript(contents: string, sourcefile: string): Promise<string> {
  const { build } = await esbuild();
  const result = await build({
    stdin: { contents, sourcefile, loader: 'js' },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
    plugins: [{ name: 'no-imports', setup(api) {
      api.onResolve({ filter: /.*/ }, (args) => ({ errors: [{ text: `Imports are unsupported in static projects: ${args.path}` }] }));
    } }],
  });
  return result.outputFiles[0].text;
}

export function domDocument(html: string): HtmlAdapter {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return {
    hasEmbeddedDocuments: () => !!doc.querySelector('base, iframe, object, embed'),
    scripts: () => [...doc.querySelectorAll('script')].map((element) => ({
      src: element.getAttribute('src') ?? undefined, type: element.getAttribute('type') ?? undefined, text: element.textContent || '',
      removeIntegrity: () => element.removeAttribute('integrity'),
      setSrc: (src: string) => { element.setAttribute('src', src); element.textContent = ''; },
      setText: (text: string) => { element.textContent = text; },
    })),
    stylesheets: () => [...doc.querySelectorAll('link[rel="stylesheet"]')].map((element) => ({
      href: element.getAttribute('href') || '',
      replaceWithStyle: (css: string) => { const style = doc.createElement('style'); style.textContent = css; element.replaceWith(style); },
    })),
    removeMetaAndLinks: () => doc.querySelectorAll('meta[http-equiv], link').forEach((element) => element.remove()),
    prependToHead: (markup: string) => doc.head.insertAdjacentHTML('afterbegin', markup),
    serialize: () => `${doc.doctype ? '<!DOCTYPE html>\n' : ''}${doc.documentElement.outerHTML}`,
  };
}

export async function buildInBrowser(input: unknown, signal?: AbortSignal): Promise<LiveBuild> {
  const report: LiveBuild = { status: 'passed', tool: 'esbuild', errors: [], checkedFiles: [], browserVerified: false };
  try {
    const files = validateFiles(input);
    const compiled = new Map<string, string>();
    for (const file of files) {
      signal?.throwIfAborted();
      if (file.path.endsWith('.js')) compiled.set(file.path, await compileScript(file.content, file.path));
      if (file.path.endsWith('.css')) compiled.set(file.path, (await (await esbuild()).transform(file.content, { loader: 'css', logLevel: 'silent' })).code);
      report.checkedFiles.push(file.path);
    }
    report.html = await inlineDocument(domDocument(files.find((file) => file.path === 'index.html')!.content), compiled, (code) => compileScript(code, 'index.html inline script'));
  } catch (error) {
    signal?.throwIfAborted();
    report.status = 'failed';
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
  return report;
}
