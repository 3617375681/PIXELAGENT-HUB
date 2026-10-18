import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, transform } from 'esbuild';
import { load } from 'cheerio';
import { strToU8, zipSync } from 'fflate';
import { inlineDocument, validateFiles, type HtmlAdapter } from './shared/inline.js';
import type { SourceFile } from './shared/schemas.js';

export { validateFiles };
export type { SourceFile };
export type BuildReport = { status: 'passed' | 'failed'; tool: 'esbuild'; errors: string[]; checkedFiles: string[]; browserVerified: false };

function cheerioDocument(html: string): HtmlAdapter {
  const $ = load(html);
  return {
    hasEmbeddedDocuments: () => $('base, iframe, object, embed').length > 0,
    scripts: () => $('script').toArray().map((element) => {
      const node = $(element);
      return {
        src: node.attr('src'), type: node.attr('type'), text: node.html() || '',
        removeIntegrity: () => { node.removeAttr('integrity'); },
        setSrc: (src: string) => { node.attr('src', src).empty(); },
        setText: (text: string) => { node.html(text); },
      };
    }),
    stylesheets: () => $('link[rel="stylesheet"]').toArray().map((element) => ({
      href: $(element).attr('href') || '',
      replaceWithStyle: (css: string) => { $(element).replaceWith($('<style>').text(css)); },
    })),
    removeMetaAndLinks: () => { $('meta[http-equiv], link').remove(); },
    prependToHead: (markup: string) => { $('head').prepend(markup); },
    serialize: () => $.html(),
  };
}

async function compileScript(content: string, sourcefile: string): Promise<string> {
  const result = await build({
    stdin: { contents: content, sourcefile, loader: 'js' },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
    plugins: [{ name: 'no-imports', setup(api) {
      api.onResolve({ filter: /.*/ }, (args) => ({ errors: [{ text: `Imports are unsupported in static projects: ${args.path}` }] }));
    } }],
  });
  return result.outputFiles[0].text;
}

/** Compile JS/CSS and inline referenced assets; no generated code executes on the host. */
export async function buildStaticProject(input: unknown, directory: string, signal?: AbortSignal): Promise<BuildReport> {
  const files = validateFiles(input);
  signal?.throwIfAborted();
  await mkdir(join(directory, 'source'), { recursive: true });
  for (const file of files) {
    signal?.throwIfAborted();
    const target = join(directory, 'source', file.path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.content, { flag: 'wx' });
  }
  const report: BuildReport = { status: 'passed', tool: 'esbuild', errors: [], checkedFiles: [], browserVerified: false };
  const compiled = new Map<string, string>();
  try {
    for (const file of files) {
      signal?.throwIfAborted();
      if (file.path.endsWith('.js')) compiled.set(file.path, await compileScript(file.content, file.path));
      if (file.path.endsWith('.css')) compiled.set(file.path, (await transform(file.content, { loader: 'css', logLevel: 'silent' })).code);
      report.checkedFiles.push(file.path);
    }
    const html = await inlineDocument(cheerioDocument(files.find((file) => file.path === 'index.html')!.content), compiled, (code) => compileScript(code, 'index.html inline script'));
    signal?.throwIfAborted();
    await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(join(directory, 'dist', 'index.html'), html);
  } catch (error) {
    signal?.throwIfAborted();
    report.status = 'failed';
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
  await writeFile(join(directory, 'build-report.json'), JSON.stringify(report, null, 2));
  return report;
}

export function createSourceArchive(files: SourceFile[], preview: string, report: BuildReport): Uint8Array {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of validateFiles(files)) entries[`source/${file.path}`] = strToU8(file.content);
  entries['preview/index.html'] = strToU8(preview);
  entries['build-report.json'] = strToU8(JSON.stringify(report, null, 2));
  entries['RUNNING.md'] = strToU8('# Run this project\n\nOpen preview/index.html in a modern browser. No installation is required.\n\nSource files are in source/. Build success is not browser interaction verification.\n');
  return zipSync(entries);
}
