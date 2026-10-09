import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, transform } from 'esbuild';
import { load } from 'cheerio';
import { strToU8, zipSync } from 'fflate';
import { z } from 'zod';

const filesSchema = z.array(z.object({ path: z.string(), content: z.string() })).min(1).max(40);
export type SourceFile = z.infer<typeof filesSchema>[number];
export type BuildReport = { status: 'passed' | 'failed'; tool: 'esbuild'; errors: string[]; checkedFiles: string[]; browserVerified: false };

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
    bytes += Buffer.byteLength(file.content);
  }
  if (bytes > 1_000_000) throw new Error('Project exceeds the 1 MB source limit');
  if (!files.some((file) => file.path === 'index.html')) throw new Error('Project requires index.html');
  return files;
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
    const $ = load(files.find((file) => file.path === 'index.html')!.content);
    if ($('base, iframe, object, embed').length) throw new Error('Embedded documents and base URLs are unsupported');
    for (const element of $('script').toArray()) {
      const node = $(element);
      const src = node.attr('src');
      const type = node.attr('type');
      if (type && ['application/json', 'application/ld+json'].includes(type)) continue;
      if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) throw new Error(`Unsupported script type: ${type}`);
      let code: string;
      if (src) {
        const path = src.replace(/^\.\//, '');
        if (!path.endsWith('.js') || !compiled.has(path)) throw new Error(`Missing or external script: ${src}`);
        code = compiled.get(path)!;
      } else code = await compileScript(node.html() || '', 'index.html inline script');
      node.removeAttr('integrity');
      // Local data URLs retain external-script scheduling: defer/async and module type.
      // Turning a head defer script into a classic inline script runs it before the DOM.
      if (src) node.attr('src', `data:application/javascript;base64,${Buffer.from(code).toString('base64')}`).empty();
      else node.html(code.replace(/<\/script/gi, '<\\/script'));
    }
    for (const element of $('link[rel="stylesheet"]').toArray()) {
      const href = $(element).attr('href') || '';
      const path = href.replace(/^\.\//, '');
      if (!path.endsWith('.css') || !compiled.has(path)) throw new Error(`Missing or external stylesheet: ${href}`);
      $(element).replaceWith($('<style>').text(compiled.get(path)!.replace(/<\/style/gi, '<\\/style')));
    }
    // Restrict networking even when the exported preview is opened outside the dashboard.
    $('meta[http-equiv], link').remove();
    $('head').prepend('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' data:; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">');
    signal?.throwIfAborted();
    await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(join(directory, 'dist', 'index.html'), $.html());
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
