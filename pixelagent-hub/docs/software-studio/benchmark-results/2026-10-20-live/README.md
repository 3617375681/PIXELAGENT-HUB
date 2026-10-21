# PLAY LIVE benchmark — 2026-10-20

The same harness as [2026-10-18](../2026-10-18-live/README.md):
- `scripts/benchmark-live.ts` drives the built static site in Chromium, exactly as a visitor runs it;
- `deepseek-chat`, a fresh browser profile per run, Tester plans with fresh isolation;
- one review and one repair round when a check fails.

Every run's events, plan, rounds and final source are saved here.

**Source:** `86a0a14` (clean). Since the 2026-10-18 rounds, this source adds:
- `changed` / `unchanged` assertions, which compare an element's text with its own text before the check's actions;
- the round-5 changes (transparent means hidden, live `checked`, the `unsupported` review verdict).

## Result

| Set | Runs | Full pass | Reviews (checks revised) | Checks dropped | Coder repairs | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [`fixed/`](fixed/) (counter, task list, calculator, converter, quiz) | 15 | **15/15** | 2 (2) | 0 | 0 | 20 s | 123,311 |
| [`showcase/`](showcase/) (snake, timer, tip calc, pet, memory, palette) | 18 | **15/18** | 6 (10) | 2 | 3 | 26 s | 245,041 |

For comparison, on 2026-10-18 the fixed cases' best round was 14/15 and the showcase reached 17/18 in round 5.

| Idea | 10-18 round 5 | **10-20** |
| --- | --- | --- |
| Snake | 3/3 | 2/3 |
| Pomodoro timer | 3/3 | 3/3 |
| Tip calculator | 3/3 | 3/3 |
| Pixel pet | 3/3 | 3/3 |
| Memory match | 3/3 | 2/3 |
| Palette generator | 2/3 | 2/3 |

**The fixed cases pass 15/15 for the first time.** Both reviews there corrected a check, and each corrected check then passed. Each time the Tester had demanded 4 labelled controls where the requirement only says the controls are labelled.

**The showcase drops from 17 to 15.** With three runs per idea, that is within the swings seen before; snake went 2/3 → 0/3 → 3/3 over three rounds. No pass came from dropping a check: the only run with dropped checks still failed.

## The new assertions

The Tester used `changed` and `unchanged` only where they belong. There were 6 such checks, all in the palette plans, and all passed:
- "Generate changes the palette";
- "Locked color stays the same after generating";
- "Unlocked swatches change after generating".

The palette check that failed on 2026-10-18 needed exactly these. Palette is still 2/3 because of a different check (below).

Assertions used across the 18 showcase plans: 83 `text`, 32 `attribute`, 20 `count`, 15 `visible`, 4 `disabled`, 4 `changed`, 2 `unchanged`.

## The 3 failures

| Run | Final checks | Cause |
| --- | ---: | --- |
| palette 3 | 8/9 | **The language has no pattern.** "Hex codes are displayed in #RRGGBB format" compares the text with `"#"`, but text checks only test equality. The review explained exactly this and still answered `app-wrong`, not `unsupported`. The app is correct. |
| memory 2 | 5/6 | **The language cannot pick "the other card of this colour".** On a shuffled board, the checks clicked `.card[data-color="0"]`, which matches two cards. The review fixed two checks and dropped two as `unsupported` (the cap for an 8-check plan). The third, "Win message appears after all 8 pairs matched", has the same problem, and the cap kept it as a failure. This is the first real use of `unsupported`, and the cap did its job. |
| snake 1 | 8/10 | **Wording the requirement does not fix.** Two checks expect a pause overlay titled "Paused", but the app shows "How to Play" whenever it is paused. "Start paused and show how to play" does not say what a later pause must say. The review called one check wrong and the other an app bug, for the same behaviour. The repair round did not change it. |

## What this shows

- **The `changed`/`unchanged` gap is closed.** The randomness problem behind the last 2026-10-18 failure did not come back.
- **The failures that remain are narrower each round.** This time: a missing pattern assertion, the language's single-element rule on a shuffled board, and a requirement open to two readings.
- **The review's recurring weakness is unchanged.** It still sometimes explains that a check is at fault and then blames the app (palette 3, and one of the two snake checks). `unsupported` was used for the first time, once, for 2 checks.

Reproduce (calls the paid model):

```sh
VITE_REPLAY=1 VITE_BASE=/PIXELAGENT-HUB/ npm --prefix dashboard run build
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out>/showcase --runs 3 --cases config/live-showcase-cases.json
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out>/fixed --runs 3
```

In Git Bash on Windows, set `MSYS_NO_PATHCONV=1` first.
