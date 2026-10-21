import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';

/**
 * Share links for PLAY LIVE runs: the whole finished run (request, event timeline, built preview,
 * source) compressed into the URL fragment, so the static site can replay it with no backend.
 * Fragments are never sent to the server. A decoded link is untrusted input: it is validated
 * here and its preview only ever runs in the sandboxed iframe.
 */
export const MAX_SHARE_CHARS = 120_000;

const event = z.object({ seq: z.number().int().positive(), at: z.string().max(40), type: z.string().max(40), round: z.number().int().optional(), data: z.record(z.string(), z.unknown()).optional() });
const sharedRunSchema = z.object({
  v: z.literal(1),
  description: z.string().min(1).max(4000),
  provider: z.string().max(60),
  model: z.string().max(120),
  testerModel: z.string().max(120).optional(),
  projectName: z.string().max(200).optional(),
  startedAt: z.string().max(40),
  finishedAt: z.string().max(40).optional(),
  round: z.number().int().min(1).max(10),
  events: z.array(event).max(400),
  html: z.string().max(1_500_000),
  files: z.array(z.object({ path: z.string().max(200), content: z.string().max(1_000_000) })).max(40),
  checks: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
});
export type SharedRun = z.infer<typeof sharedRunSchema>;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export function encodeSharedRun(run: SharedRun): string {
  const encoded = toBase64Url(deflateSync(strToU8(JSON.stringify(run)), { level: 9 }));
  if (encoded.length > MAX_SHARE_CHARS) throw new Error('This run is too large to fit in a share link. Download the ZIP instead.');
  return encoded;
}

export function decodeSharedRun(encoded: string): SharedRun {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(encoded) || encoded.length > MAX_SHARE_CHARS) throw new Error('This share link is malformed.');
  let json: unknown;
  try { json = JSON.parse(strFromU8(inflateSync(fromBase64Url(encoded)))); } catch { throw new Error('This share link is damaged or incomplete.'); }
  const parsed = sharedRunSchema.safeParse(json);
  if (!parsed.success) throw new Error('This share link was made by a different version or is invalid.');
  return parsed.data;
}

/** Short stable id for a link, so reopening the same link maps to the same project. */
export function shareId(encoded: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < encoded.length; index++) hash = Math.imul(hash ^ encoded.charCodeAt(index), 0x01000193) >>> 0;
  return `${hash.toString(36)}${encoded.length.toString(36)}`;
}
