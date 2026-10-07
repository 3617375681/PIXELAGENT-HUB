/** Resolve both sync responses and async job.runResult using the persisted full session. */
export async function resolveRunSession(
  result: Record<string, unknown>,
  getSession: (id: string) => Promise<{ session: Record<string, unknown> }>,
): Promise<Record<string, unknown>> {
  const artifacts = result.artifacts as Record<string, unknown> | undefined;
  const sessionId = artifacts?.sessionId ?? result.sessionId;
  if (typeof sessionId === 'string' && sessionId) return (await getSession(sessionId)).session;
  const session = result.session ?? result.raw;
  if (session && typeof session === 'object' && !Array.isArray(session)) return session as Record<string, unknown>;
  throw new Error('Run response has no session');
}
