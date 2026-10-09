import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const reserved = (path: string) => /^\/(api|health)(?:\/|$)/.test(path);
const inside = (root: string, path: string) => {
  const difference = relative(root, path);
  return !isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
};

/** Serves only a trusted dashboard build. API and health requests remain with Records. */
export async function createDashboardHandler(directory: string) {
  let root: string;
  try {
    root = await realpath(directory);
    const index = await realpath(join(root, 'index.html'));
    if (!inside(root, index) || !(await stat(index)).isFile()) throw new Error('Invalid dashboard index');
  } catch { throw new Error('Dashboard build is unavailable. Run npm run build:all before npm start.'); }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const raw = (req.url || '').split('?')[0];
    if (reserved(raw)) return false;
    const end = (status: number, text: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    let path: string;
    try { path = decodeURIComponent(raw); } catch { end(400, 'Invalid path'); return true; }
    if (reserved(path)) return false;
    if (!path.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some((part) => part === '.' || part === '..')) {
      end(400, 'Invalid path'); return true;
    }
    if (path.split('/').some((part) => part.startsWith('.'))) { end(404, 'Not found'); return true; }
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.setHeader('Allow', 'GET, HEAD'); end(405, 'Method not allowed'); return true;
    }
    const extension = extname(path).toLowerCase();
    const asset = path === '/assets' || path.startsWith('/assets/');
    if (extension && !mimeTypes[extension]) { end(404, 'Not found'); return true; }
    try {
      let target: string;
      try { target = await realpath(join(root, path)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
        if (extension || asset) { end(404, 'Not found'); return true; }
        target = await realpath(join(root, 'index.html'));
      }
      if (path === '/') target = await realpath(join(root, 'index.html'));
      if (!inside(root, target) || relative(root, target).split(/[\\/]/).some((part) => part.startsWith('.'))
        || !mimeTypes[extname(target).toLowerCase()] || !(await stat(target)).isFile()) { end(404, 'Not found'); return true; }
      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length, 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { end(500, 'Unable to read dashboard build'); }
    return true;
  };
}
