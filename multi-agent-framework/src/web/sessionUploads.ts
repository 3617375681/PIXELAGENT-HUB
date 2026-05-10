import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_SESSION_UPLOAD_BYTES = 12 * 1024 * 1024;

type Manifest = { version: 1; items: Record<string, { name: string; mime: string; stored: string }> };

async function readManifest(sessionDir: string): Promise<Manifest> {
  const p = join(sessionDir, 'uploads', '_manifest.json');
  try {
    const raw = await readFile(p, 'utf-8');
    const j = JSON.parse(raw) as Manifest;
    if (j && j.version === 1 && j.items && typeof j.items === 'object') return j;
  } catch {
    /* empty */
  }
  return { version: 1, items: {} };
}

async function writeManifest(sessionDir: string, m: Manifest): Promise<void> {
  const dir = join(sessionDir, 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '_manifest.json'), JSON.stringify(m, null, 2), 'utf-8');
}

function stripDataUrl(b64: string): { mime?: string; data: string } {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(b64.trim());
  if (m) return { mime: m[1], data: m[2] };
  return { data: b64.trim() };
}

export async function saveSessionAttachments(
  sessionDir: string,
  files: Array<{ name?: string; mime?: string; data?: string }>,
): Promise<Array<{ id: string; name: string; mime: string; path: string }>> {
  const manifest = await readManifest(sessionDir);
  const out: Array<{ id: string; name: string; mime: string; path: string }> = [];
  const dir = join(sessionDir, 'uploads');
  await mkdir(dir, { recursive: true });

  for (const f of files) {
    if (!f?.data || typeof f.data !== 'string') continue;
    const { mime: inferredMime, data: rawB64 } = stripDataUrl(f.data);
    let buf: Buffer;
    try {
      buf = Buffer.from(rawB64, 'base64');
    } catch {
      continue;
    }
    if (buf.length === 0 || buf.length > MAX_SESSION_UPLOAD_BYTES) continue;
    const id = randomUUID().replace(/-/g, '').slice(0, 24);
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `file-${id}`;
    const mime = typeof f.mime === 'string' && f.mime.trim() ? f.mime.trim() : inferredMime || 'application/octet-stream';
    const ext =
      mime === 'image/png'
        ? '.png'
        : mime === 'image/jpeg' || mime === 'image/jpg'
          ? '.jpg'
          : mime === 'image/webp'
            ? '.webp'
            : mime === 'image/gif'
              ? '.gif'
              : mime === 'application/pdf'
                ? '.pdf'
                : '.bin';
    const stored = `${id}${ext}`;
    await writeFile(join(dir, stored), buf);
    manifest.items[id] = { name, mime, stored };
    out.push({ id, name, mime, path: `/api/sessions/__SID__/files/${id}` });
  }
  await writeManifest(sessionDir, manifest);
  return out;
}

export async function readSessionUploadFile(
  sessionDir: string,
  fileId: string,
): Promise<{ buf: Buffer; mime: string; name: string } | null> {
  const manifest = await readManifest(sessionDir);
  const meta = manifest.items[fileId];
  if (!meta) return null;
  const buf = await readFile(join(sessionDir, 'uploads', meta.stored));
  return { buf, mime: meta.mime, name: meta.name };
}
