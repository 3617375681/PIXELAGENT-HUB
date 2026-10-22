# The repair round never ships a worse app — 2026-10-22

**What changed.** When checks fail, PLAY LIVE gives the Coder one repair round, then runs the same checks again. Before this change, the repaired build shipped whenever it compiled, even when it passed fewer checks than before. Now the repaired build ships only if both hold:
- it passes at least as many checks as before;
- it has no more runtime errors than before.

Otherwise the earlier build is restored. A repair that does not build is also rolled back. The checks then run once more on the restored build, so the last recorded browser run always describes the app that ships. The repair rounds stay in the history, and the final `ready_for_review` event carries `repairReverted: true`. The timeline reads "Repair made it worse; kept the earlier build".

## Why there is no live A/B

This changes **which build ships**, not whether a run passes. Rolling back means shipping the better of two builds that both failed. Its effect can be counted exactly from the saved records, for free.

Across every saved PLAY LIVE record, **122 runs had a repair round with a check run before and after it.** In **6** of them, the repair made things worse. All 6 would now ship the earlier build:

| Record | Check runs | Would ship |
| --- | --- | --- |
| `2026-10-18-live/showcase-final/pet-run1` | 3/9 → 1/9, plus a runtime error on every click | the 3/9 build |
| `2026-10-18-live/showcase-final/snake-run1` | 6/10 → 6/10 → 5/10 | the 6/10 build |
| `2026-10-21-holdout/r8-holdout-b/light-switch-run1` | 7/9 → 7/9 → 6/9 | the 7/9 build |
| `2026-10-21-holdout/r8-holdout-b/light-switch-run2` | 8/9 → 7/9 | the 8/9 build |
| `2026-10-21-holdout/r9-holdout-b/light-switch-run1` | 7/8 → 7/8 → 6/8 | the 7/8 build |
| `2026-10-21-holdout/run/dice-run1` | 6/8 → 5/8 | the 6/8 build |

The pet case is the one [`showcase-final-failures.md`](../2026-10-18-live/showcase-final-failures.md) singled out. A correct app was rewritten to satisfy checks that could not pass, and the result threw on every click. It now ships the earlier, working app.

Held-out set K ([`config/live-holdout-k-cases.json`](../../../../config/live-holdout-k-cases.json)) was pre-registered for a live A/B before this analysis showed that one was not needed. It has not been run and remains unused.
