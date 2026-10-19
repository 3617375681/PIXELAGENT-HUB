/**
 * Repair notes from a failed browser-check run: the exact text the Coder receives, shared by the
 * server (repair from a saved browser run) and PLAY LIVE (automatic repair round).
 */
type PlannedCheck = { name: string; selector: string; expected: string; assertion?: 'text' | 'disabled' | 'visible'; actions: unknown[] };
type CheckResult = { name: string; status: 'passed' | 'failed'; actual: string; error?: string };

export function browserFailureNotes(planned: PlannedCheck[], results: CheckResult[], runtimeErrors: string[] = [], blockedRequests: string[] = []): string[] {
  return [
    ...results.filter((check) => check.status === 'failed').map((check) => {
      const plan = planned.find((item) => item.name === check.name)!;
      return `Browser check ${JSON.stringify(check.name)}: selector=${JSON.stringify(plan.selector)}, assertion=${JSON.stringify(plan.assertion || 'text')}, expected=${JSON.stringify(plan.expected)}, actual=${JSON.stringify(check.actual)}, failure=${JSON.stringify(check.error || 'Assertion failed')}, actions=${JSON.stringify(plan.actions)}`;
    }),
    ...runtimeErrors.map((error) => `Browser runtime/console error: ${error}`),
    ...blockedRequests.map((request) => `Blocked network request from offline app: ${request}`),
  ].slice(0, 20).map((note) => note.slice(0, 2000));
}
