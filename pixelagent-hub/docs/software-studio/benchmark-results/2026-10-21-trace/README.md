# Does a written trace make the Tester more accurate? — 2026-10-21 (preliminary)

**Question.** The [held-out rounds](../2026-10-21-holdout/README.md) left mostly the Tester's own reasoning errors:
- miscounted clicks;
- a maze traced wrongly;
- an `expected` value that contradicts the app's starting state.

Making the review write its reason before its verdict ended its self-contradictions. Does the same help the plan?

**Change.** Commit `f1c1d6e` adds an optional `trace` to each check (at most 300 characters), placed right after `name`. The Tester is told to write it first: the starting state read from the source, each action's effect in order, and the arithmetic that gives `expected`. Then it writes the actions and an `expected` that match. The review sees the traces; the Coder never does.

**Setup.**
- Two builds: [baseline](holdout-i/dist-baseline/) (`main` at `d91d1cf`) and [trace](holdout-i/dist-trace/).
- **Interleaved run by run** with `benchmark-live.ts --arms "dist=…;dist=…"`, so both arms see the same provider conditions.
- Held-out set I: 8 new ideas, pre-registered in commit `26c69f8`. Most of them need arithmetic or step tracing (a combination dial, change-making, a robot on a grid, an RPN calculator…).
- `deepseek-chat`, 3 runs per idea per arm.

**The run was cut short.** Partway through set I, the DeepSeek key ran out of balance. From then on, every request in both arms failed with HTTP 402.
- These failures are kept in the records, with status `failed` and error `insufficient balance`. They say nothing about either build.
- A second set (H) that was queued after set I failed entirely with 402, and its output was removed.

## Result on the runs both arms completed

10 pairs (the same idea and run number, interleaved):

| | Strict pass | Tokens (completed runs) |
| --- | ---: | ---: |
| Baseline | 5/10 | 163,229 |
| **Trace** | **8/10** | 133,059 |

| Pair | Baseline | Trace |
| --- | --- | --- |
| dial 1 | fail (6/8 → 6/6, a check dropped) | fail (6/7 → 6/6, a check dropped) |
| dial 2 | fail (7/9, repair did not help) | **pass 8/8** |
| dial 3 | fail (6/8) | fail (6/8 → 6/6, a check dropped) |
| scoreboard 1–3 | pass ×3 | pass ×3 |
| change maker 1 | pass | pass |
| change maker 2 | fail (8/10 → 9/10) | **pass 8/8** |
| change maker 3 | pass | pass |
| robot 1 | fail (9/10, repair did not help) | **pass 9/9** |

- Every trace-arm plan wrote a trace: 92 of 92 checks.
- In no pair was the trace arm worse. In 3 pairs it passed where the baseline failed.
- It also used 18% fewer tokens, because fewer runs went through review and repair.

**Read this carefully.** Ten pairs is a small sample. A 3–0 split has a two-sided sign-test p of about 0.25 (one-sided 0.125), so this is a promising direction, not a measured gain. The remaining set-I ideas (RPN calculator, ticket queue, date difference, inventory) never ran in either arm. The experiment needs to be repeated with a funded key.

Reproduce (calls the paid model):

```sh
# build the baseline (main) and the change into two directories, then:
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts <baseline> <out> --runs 3 --cases config/live-holdout-i-cases.json --arms "dist=<baseline>;dist=<trace>"
```
