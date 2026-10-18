# Real-model showcase — 2026-10-18

Six app ideas, each generated with `deepseek/deepseek-v4-pro` through the production Studio API after the Coder's constraints gained a visual brief (cohesive palette, 16px+ system fonts, hover/focus/pressed states, 360px-wide layouts). Every app then got a Tester plan, which was run in the sandboxed Chromium. There were no hand edits, and no model repair beyond the built-in compile loop. Every attempt is kept, failures included.

- First pass: `scripts/record-showcase.ts` on clean tracked commit `7292856c495b71048599bd9b6aca0d182487aecd`, recorded at 2026-10-18T02:10Z.
- Retry of the three ideas that did not fully pass: `--only timer,pet,palette` on clean tracked commit `2749026f6f62ba7fde4f66e7cd3203358506ce66` (the only change was adding that flag), recorded at 2026-10-18T02:34Z, in [`retry/`](retry/).
- A third attempt for the pixel pet, in [`retry2/`](retry2/), recorded at 2026-10-18T07:10Z on merge commit `b44c297b200c54015cb8d00c39a4282c9464290d`. The working tree had uncommitted dashboard and replay-export changes (`sourceDirty: true`), but `src/` was identical to the earlier runs.

## Result

| Idea | Attempt 1 | Attempt 2 | Attempt 3 |
| --- | --- | --- | --- |
| Snake | **passed 10/10** | — | — |
| Pomodoro timer | built, checks 5/10 — see below | **passed 9/9** | — |
| Tip calculator | **passed 10/10** | — | — |
| Pixel pet | no build: `LLM error: terminated` during coding | no build: Coder hit its 180 s limit | no build: Coder hit its 180 s limit |
| Memory match | **passed 9/9** | — | — |
| Palette generator | no build: `LLM error: terminated` during coding | **passed 10/10** | — |

**5 of 6 ideas ended with every browser check passing. That took 10 attempts.** Every finished build compiled on the first attempt, so the compile-repair loop was not needed. Reported usage was 105,871 tokens for the first pass, 51,901 for the retry and 2,539 for the third pet attempt, 160,311 in total; monetary cost was not computed.

## Failures

- **Pomodoro timer, attempt 1: the test plan was wrong, not the app.**
  - Checks run in sequence on one shared page. Check 5 clicks Start and confirms that Start becomes disabled. Checks 6–10 each begin by clicking Start again, which is now disabled, so every click times out after 2 s and the check is marked failed.
  - The final screenshot shows the timer running (24:50) with Start disabled and Pause enabled. That is the behavior the plan expected.
  - The Tester prompt already says never to click a disabled control. This plan broke that rule, and nothing currently validates plan sequencing.
  - The score is reported as recorded: 5/10.
- **Pixel pet and palette generator, attempt 1:** the HTTP stream to the model ended mid-response 122 s and 135 s into coding (`terminated`). No source was produced.
- **Pixel pet, attempts 2 and 3:** the Coder exceeded its fixed 180 s agent limit both times. No output came back, so the cause was not determined. Three failures on one prompt suggest this idea needs more than 180 s of generation with this model; the limit was not raised for this showcase.

## Evidence

Each idea folder (and `retry/<idea>`) holds:
- `project.json` and `events.jsonl`;
- `requirements.md` and `design.md`;
- when the idea built: `source.zip`, the built preview, `test-plans/`, and `browser-runs/` with initial and final screenshots.

`showcase.json` lists the ideas, the per-attempt results, the token counts and the source revision. All attempts appear in the online replay under **WHAT THE SQUAD BUILT**.

## Limits

- One attempt per idea per pass, with no repetition, so this is not a success rate. Compare [the repeated benchmark](../2026-10-15-repeated/README.md).
- Plans are model-written and cover only the behaviors they list; visual quality was not scored.
- The visual brief changes the Coder prompt, so these runs are not directly comparable with the 2026-10-09 and 2026-10-15 benchmarks.
