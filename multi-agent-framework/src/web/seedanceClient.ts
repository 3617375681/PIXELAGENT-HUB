/**
 * Seedance 2.0 via AI/ML API (ByteDance model id: bytedance/seedance-2-0).
 * Docs: https://docs.aimlapi.com/api-references/video-models/bytedance/seedance-2.0
 */

export type SeedanceCreateBody = {
  prompt: string;
  image_url?: string;
  image_urls?: string[];
  aspect_ratio?: string;
  resolution?: '480p' | '720p';
  duration?: number;
  generate_audio?: boolean;
};

export async function seedanceCreateTask(env: NodeJS.ProcessEnv, body: SeedanceCreateBody): Promise<unknown> {
  const key = (env.AIMLAPI_KEY || env.SEEDANCE_API_KEY || '').trim();
  if (!key) throw new Error('SEEDANCE_NOT_CONFIGURED');
  const base = (env.AIMLAPI_BASE_URL || 'https://api.aimlapi.com').replace(/\/$/, '');
  const url = `${base}/v2/video/generations`;
  const payload = {
    model: 'bytedance/seedance-2-0',
    prompt: body.prompt,
    ...(body.image_url ? { image_url: body.image_url } : {}),
    ...(body.image_urls?.length ? { image_urls: body.image_urls } : {}),
    ...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
    ...(body.resolution ? { resolution: body.resolution } : {}),
    ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
    ...(typeof body.generate_audio === 'boolean' ? { generate_audio: body.generate_audio } : {}),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = typeof json === 'object' && json && 'message' in json ? String((json as { message: unknown }).message) : text;
    throw new Error(`SEEDANCE_HTTP_${res.status}: ${msg}`);
  }
  return json;
}

export async function seedanceGetTask(env: NodeJS.ProcessEnv, generationId: string): Promise<unknown> {
  const key = (env.AIMLAPI_KEY || env.SEEDANCE_API_KEY || '').trim();
  if (!key) throw new Error('SEEDANCE_NOT_CONFIGURED');
  const base = (env.AIMLAPI_BASE_URL || 'https://api.aimlapi.com').replace(/\/$/, '');
  const url = new URL(`${base}/v2/video/generations`);
  url.searchParams.set('generation_id', generationId);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = typeof json === 'object' && json && 'message' in json ? String((json as { message: unknown }).message) : text;
    throw new Error(`SEEDANCE_HTTP_${res.status}: ${msg}`);
  }
  return json;
}
