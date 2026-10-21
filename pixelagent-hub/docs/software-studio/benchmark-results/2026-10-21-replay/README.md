# Offline check replay — 2026-10-21

`npm run checks:replay` re-runs every saved PLAY LIVE plan against its saved app source with the **current** check runner, and compares the verdicts with the ones that were recorded. It calls no model and costs nothing.

**How it works.**
- It bundles the production `dashboard/src/lib/live/checks.ts` itself: the same bridge, the same transparent in-viewport frame, isolation and time budgets.
- It rebuilds each record's source with the Studio builder used by the replay export.
- It runs up to 4 records at a time in one Chromium.
- A changed record is replayed a second time, and marked flaky if the two replays disagree.

```sh
npm run checks:replay                                   # every record under docs/software-studio/benchmark-results
npm run checks:replay -- --only 2026-10-21 --limit 50 --out report.json
```

## First full run (commit `a087a1f`)

| | Records |
| --- | ---: |
| Replayed | 742 |
| Identical verdicts | **720 (97%)** |
| Changed | 21 |
| Flaky | 1 |
| Skipped (29 with no saved source, 10 with no plan) | 39 |

It took 13 min 39 s. Across the changed records, 38 checks went **failed → passed** and 1 went **passed → failed**. [`changed.json`](changed.json) lists each of them.

**The 38 failed → passed checks are the fixes made since those runs were recorded.** For example:
- **snake overlays** (9 records): `visible` now treats `opacity: 0` as hidden;
- **timer labels** (3): text checks ignore CSS `text-transform`;
- **traffic light and metronome**: `attribute: "class"` now means "has this class";
- **colour mixer**: a pattern also matches its own text literally;
- **task timer**: `changed` on an element the actions create;
- **memory, palette, light puzzle**: class and `checked` reads.

In other words, the runs these fixes targeted now pass offline, without a new model run.

**The 1 passed → failed check is not a regression.** In set B, coin flipper 2's "Flip increments total count" checks that `#headsCount` changes after one flip. That is a coin toss. The recorded run got heads; both replays got tails.

The tool also flags checks that depend on randomness, which is useful in itself. The light puzzle run was marked flaky for the same reason: its board starts randomly.

**Use it before every change to the check language or the runners.** It tells you, for free and in about 14 minutes, which recorded runs the change would flip.
