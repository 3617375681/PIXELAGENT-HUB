# Does a reasoning model make a better Tester? — 2026-10-21

**Question.** Rounds 8–13 of the [held-out benchmark](../2026-10-21-holdout/README.md) ended with the conclusion that most of the remaining failures are the Tester model's reasoning errors: tracing a maze, arithmetic, choosing selectors. Would a reasoning model help if it were used only for the Tester?

**Setup.**
- **Pipeline:** PLAY LIVE gained an optional **TESTER MODEL** (commit `fbedc4d`). The Tester's plan and review use it, while the Manager and the Coder keep the main model.
- **Ideas:** held-out set H, 8 new ideas pre-registered in commit `ff9d284` before any run ([`config/live-holdout-h-cases.json`](../../../../config/live-holdout-h-cases.json)).
- **Runs:** 3 runs per idea per arm, on the same build.
- **Models:** Manager and Coder used `deepseek-chat` in both arms. The arms differ only in the Tester's model.

| Tester model | Runs | Full pass | **Strict pass** | First check run all green | Reviews | Coder repairs | Median | p90 | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [`deepseek-chat`](chat/) | 24 | 22/24 | **22/24** | 18/24 | 6 | 5 | **27 s** | 52 s | 331,681 |
| [`deepseek-v4-pro`](v4-pro/) | 24 | 21/24 | 20/24 | 20/24 | 2 | 2 | 92 s | 132 s | 405,020 |

**Answer: no measurable gain.**
- The reasoning Tester's first plans were a little more often right: 20 vs 18 runs had every check pass on the first run, so it needed fewer reviews and repairs.
- But it finished no more runs: 20 vs 22 strict passes. That difference is within noise at 24 runs per arm.
- It took 3.4× as long per run and used 22% more tokens.
- One of its plans was cut off mid-JSON ("Unexpected end of JSON input"), most likely because its reasoning tokens counted against the 8,192-token output cap.

**The failures:**

| Arm | Run | Cause |
| --- | --- | --- |
| chat | keypad lock 2, 3 | **Requirement wording.** "The keypad locks for 10 seconds": the app ignores key presses during the lockout instead of disabling the keys, and the checks expect `disabled`. |
| v4-pro | invoice 2 | **A real app bug, caught.** A runtime error (`Cannot read properties of null (reading 'value')`) stops the totals from updating. |
| v4-pro | keypad lock 2 | **Tester mistake.** The check never presses Enter, so the status stays "Enter 4 digits". |
| v4-pro | elevator 1 | **No checks.** The plan was cut off (see above). |
| v4-pro | interval trainer 3 | A pass that relied on a dropped check. |

**What this shows:**
- **On this set, the default pipeline is already at 22/24 strict (92%).** That is higher than the earlier clean sets (12–14 of 16). This is set H's first and only measurement, on the latest build, so part of the difference may simply be that these ideas are easier.
- **Swapping in a stronger Tester is not a free win.** It trades speed and cost for slightly better first plans. In PLAY LIVE, where visitors watch and pay per token, the default stays `deepseek-chat`.
- The TESTER MODEL field stays in the dialog as an option. The data does not support recommending it.

Reproduce (calls the paid model):

```sh
VITE_REPLAY=1 VITE_BASE=/PIXELAGENT-HUB/ npm --prefix dashboard run build
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out>/chat --runs 3 --cases config/live-holdout-h-cases.json
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out>/v4-pro --runs 3 --tester-model deepseek-v4-pro --cases config/live-holdout-h-cases.json
```
