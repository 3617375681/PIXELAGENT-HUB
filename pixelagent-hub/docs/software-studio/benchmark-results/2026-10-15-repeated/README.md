# Repeated strategy comparison — 2026-10-15

Does planning first (Manager → Coder) produce working apps more often than letting the Coder write directly? Five fixed cases × two strategies × three repetitions, all with `deepseek/deepseek-v4-pro`, on clean tracked commit `793240d33479a26f06b199cfb01d1a7be778d01f` (`sourceDirty: false` for every run). This is real model output, not a fixture.

The three runs executed back to back with `npm run studio:benchmark -- --timeout-ms 480000`. The fixed browser plans from [`config/studio-benchmark.json`](../../../../config/studio-benchmark.json) (cases SHA-256 `a382b364…`) were then executed once per successful build, through the production Studio browser-run endpoint (`scripts/benchmark-browser-checks.ts`), in a sandboxed Chromium 151.0.7922.34, viewport 1280×720, Node 24.21.0 on Windows. No Tester model call, retry, manual fix or approval was involved.

## Result

| Strategy | Built (≤3 compiles) | Built on first compile | All browser checks passed | Checks passed | Median generation time | Mean reported tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Manager → Coder | 14/15 | 14/14 | **13/15** | 81/83 | 125 s | 9,604 |
| Coder only | 14/15 | 14/14 | **12/15** | 84/86 | 119 s | 8,390 |

**No measurable advantage for planning on these five small apps.** Full success differs by one run out of fifteen. Every generation that finished compiled on its first attempt, so the compile-repair loop was never needed. Planning cost about 1,200 extra tokens per app on average and did not reduce generation time. Three runs per cell cannot establish a difference of this size; this is a recorded observation, not a statistical comparison.

| Case | Manager → Coder (full pass) | Coder only (full pass) |
| --- | --- | --- |
| Counter | 3/3 | 3/3 |
| Task list | 3/3 | 2/3 — one Coder timeout |
| Calculator | 3/3 | 3/3 |
| Converter | 3/3 | 1/3 — two used `type="number"` |
| Quiz | 1/3 — one wrong scoring, one Coder timeout | 3/3 |

## Every failure

| Run | Case | Strategy | What happened |
| --- | --- | --- | --- |
| 1 | Task list | Coder only | The Coder exceeded its fixed 180 s agent limit; no source was produced. |
| 2 | Quiz | Manager → Coder | Same 180 s Coder timeout after planning. |
| 1 | Quiz | Manager → Coder | Built, but answering never changed the score: "Correct first answer" and "Wrong second answer" observed `0`, expected `1`. 8/10 checks passed. A real functional defect. |
| 2, 3 | Converter | Coder only | Built, but the requirement says *text input ID temperature* and both apps used `<input type="number">`, so the invalid-text check could not type `abc`. 4/5 checks passed each. A requirement deviation in the generated code, not a harness error. |

Timeouts count as failures for the strategy that produced them; each strategy hit one. Model latency varies by day: on 2026-10-09 the same Coder-only task list finished in 104 s.

## Compared with 2026-10-09

The [earlier single run](../2026-10-09/README.md) recorded 6/10 browser passes, and two of its four failures came from a builder defect (lost `defer` order) that has since been fixed. With that defect gone, 25 of 28 finished builds here passed every check. The builder and some plans changed between the two experiments, so their numbers are reported separately rather than merged.

## Evidence

- [`series.json`](series.json): per-strategy and per-case summaries plus all 30 entries (run, project, status, compile attempts, time, tokens, browser result). Produced by `scripts/report-benchmark-series.ts`.
- `run1/`, `run2/`, `run3/`: each run's frozen `run.json`, then one directory per case and strategy with `project.json`, `events.jsonl`, `source.zip`, the fixed `test-plans/` record and the `browser-runs/` report with initial/final screenshots. Projects that failed to generate have no ZIP or browser run.

Reproduce (calls the paid model):

```sh
npm run studio:benchmark -- --timeout-ms 480000     # repeat for each run
npx tsx scripts/benchmark-browser-checks.ts <run-id> [...]
npx tsx scripts/report-benchmark-series.ts series.json <run-id> [...]
```

## Limits

- Five small offline apps; no larger projects, other models or other languages.
- Fixed checks cover listed behaviors only; visual quality, accessibility beyond the listed IDs and full requirement coverage were not judged.
- Reported tokens come from returned usage; monetary cost was not computed. Model latency, ordering and caching were not controlled.
- One browser execution per build; the same Windows machine ran generation and checks.
