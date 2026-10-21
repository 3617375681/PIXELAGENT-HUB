# Held-out ideas — 2026-10-21

The six showcase ideas have been used to tune the check language for four rounds, so their scores may overfit. This folder tests ideas that were not used for tuning.

**Pre-registration.** Each set of ideas was committed before any of its runs:
- **Set A:** 8 ideas, [`config/live-holdout-cases.json`](../../../../config/live-holdout-cases.json), commit `9a1b332`.
- **Set B:** 8 more ideas, [`config/live-holdout-b-cases.json`](../../../../config/live-holdout-b-cases.json), commit `18b476a`. It was committed after set A's failures were known, but before any fix based on them was run.

Set A's failures were then used to change the pipeline, so **set A is no longer clean after round 8. Set B is.**

**Harness.** The same harness as [2026-10-18](../2026-10-18-live/README.md):
- the built static site in Chromium, run as a visitor would run it;
- `deepseek-chat`, 2 runs per held-out idea;
- one review and one repair round.

**Metrics.**
- **Full pass:** the last check run passed every check.
- **Strict pass:** a full pass with no check dropped by the review. Since round 5 the review may drop a check it cannot express (`unsupported`), so the strict pass is the honest number.

## Baseline: set A on `4062096` (v2.4.0)

Records: [`run/`](run/).

**11/16 full passes (10/16 strict).** The showcase reached 16/18 on the same source, so the held-out gap is real.

| Run | Cause |
| --- | --- |
| dice 1, 2 | **The runner could not select a radio button.** An `input` action on `<input type="radio">` set its `value` and never checked it, so the correct app always rolled one die. |
| tictactoe 2 | **The review blamed the app while explaining the check's mistake.** Its reason said the check placed "only 8 marks, so the game is not over", and its verdict was `app-wrong`. This is the fourth round in a row. |
| habit 2 | **No checks.** The Tester's plan was invalid JSON twice in a row (the retry also failed). |
| flashcards 2 | **The review's correction was wrong.** |
| password 2 | **A pass that relied on a dropped check.** Correctly dropped as `unsupported`: the app keeps at least one character set on. |

## Round 8 on `262b610`

The round-8 changes (commit `262b610`):
- An `input` action clicks a checkbox or radio into the wanted state; Playwright uses `check()`.
- The review answers one factual question, `correctAppPasses`, and the code derives the verdict from it.
- PLAY LIVE asks DeepSeek, OpenAI and Qwen for JSON mode.
- The Tester plans and reviews at temperature 0.2.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Reviews (revised) | Coder repairs | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Set A](r8-holdout-a/) (used for tuning) | 16 | 16/16 | 15/16 | 1 | 3 (4) | 0 | 23 s | 186,851 |
| [**Set B**](r8-holdout-b/) (clean) | 16 | 12/16 | **10/16** | 4 | 9 (8) | 5 | 36 s | 271,617 |
| [Showcase](r8-showcase/) | 18 | 14/18 | 12/18 | 8 | 7 (5) | 4 | 25 s | 238,800 |
| [Fixed cases](r8-fixed/) | 15 | **15/15** | 15/15 | 0 | 0 | 0 | 20 s | 122,738 |

**What improved:**
- **Set A went from 10/16 to 15/16 strict.** Every set-A cause above is gone: the dice apps roll the chosen number of dice, and the tictactoe miscount is now dropped instead of blamed on the app. This is the set the fixes were made from, so the gain is expected.
- **The review is consistent now.** Every `app-wrong` whose reason blamed the check came from the drop cap (at most a third of a plan), not from the model.
- **The fixed cases passed 15/15 for the third round running,** with no review needed.

**What did not:**
- **Set B, the clean test, reaches 10/16 strict.** That is about where set A started (10/16), so the round-8 fixes did not raise performance on ideas they were not built from.
- **The showcase fell from 16/18 to 14/18 (12/18 strict).** All three pet runs fail the same way. The Tester reads the `style` attribute of a progress bar and expects `"90%"`, but the attribute is `"width: 90%;"`. The review now drops those checks as uncheckable, which costs coverage, and the cap keeps the rest as failures.
- **More checks are dropped:** 13 across the 50 non-fixed runs. A drop is honest when no valid check exists, but here most drops are a language gap.

**Failures and drops by cause (set B and showcase):**

| Cause | Runs | Example |
| --- | --- | --- |
| No way to read an inline style value | pet 1, 3; showcase drops | `attribute: "style"` expected `"90%"`, actual `"width: 90%;"` |
| CSS `text-transform` | temperature 2 (3 drops) | expected "Min 10.0°C …", rendered "MIN 10.0°C …"; the source text has no spaces between the spans |
| No "stays the same after the actions" | countdown 1 | "Pause stops countdown" used `unchanged`, whose baseline is taken before the actions |
| An overlong plan, cut off | word-count 1 (no checks) | the reply ended mid-string at character 40,775 |
| Tester assumptions about a random start | light puzzle 1, 2 | expected a fixed number of lit cells on a randomly generated board |
| Ambiguous requirement | snake 2, pet 2 | "Paused" wording; a mood threshold that is not specified |

The first four are general gaps in the language or the pipeline, and they are next.

## Round 9 on `7483f82`

The round-9 changes (commit `7483f82`):
- `attribute: "style.width"` reads one inline style value.
- Text checks also accept the rendered text with `text-transform` switched off.
- New assertion `stable`: the text must not change for 1.5 s after the actions.
- The Tester keeps every string under 100 characters.

Set C (8 new ideas, commit `1365e3f`) is the clean set this round.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Reviews (revised) | Coder repairs | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [**Set C**](r9-holdout-c/) (clean) | 16 | 12/16 | **12/16** | 0 | 6 (3) | 4 | 25 s | 224,199 |
| [Set B](r9-holdout-b/) (used for round 9) | 16 | 14/16 | 13/16 | 2 | 7 (6) | 4 | 33 s | 260,600 |
| [Showcase](r9-showcase/) | 18 | 16/18 | **16/18** | 0 | 3 (4) | 1 | 23 s | 199,251 |
| [Fixed cases](r9-fixed/) | 15 | **15/15** | 15/15 | 0 | 0 | 0 | 19 s | 122,447 |

**What moved:**
- **Clean held-out sets, strict:** round 8's clean set (B) passed 10/16, and this round's clean set (C) passes 12/16. These are different ideas, so this is a rough comparison, not a controlled one.
- **Set B:** 10/16 → 13/16 strict.
- **Showcase:** 12/18 → 16/18 strict. All three pet runs pass now that progress bars are read with `style.width`, and the round dropped no checks.
- **Fixed cases:** 15/15 for the fourth round running.

**Set C's 4 failures:**

| Run | Cause |
| --- | --- |
| mortgage 2 | **A real app bug, caught.** Reset sets `results.hidden = true`, but `.results { display: flex }` overrides the `hidden` attribute, so the results stay on screen. |
| expense 2 | **The browser's own validation.** The amount input has `min="0.01" required`, so the browser blocks the submit of 0 with its own popup, and the app's error message is never reached. The requirement does not say which one should appear. |
| task timer 1 | **`changed` on an element the actions create.** The timer row does not exist before "Add task", so there is no baseline to compare with. |
| simon 1 | **The review's reply was invalid JSON**, so it changed nothing. Its check presses pads without knowing the random sequence. |

**Elsewhere:**
- Word counter: a plan was cut off at 16,853 characters again. DeepSeek's default output cap is 4,096 tokens, and the 100-character rule did not stop the Tester from writing long sample texts.
- Memory 1: a plan failed validation twice.
- Memory 3: a check needed a pattern on an attribute, `aria-label` `"Card 1, revealed"`, but `matches` only reads text.

## Round 10 on `a1c8986`

The round-10 changes (commit `a1c8986`):
- DeepSeek replies may run to 8,192 tokens.
- A review reply that is not valid JSON gets one retry.
- `changed` on an element that the actions create takes its baseline right after the actions.
- `matches` can test an attribute.

Set D (8 new ideas, commit `bb1cafe`) is this round's clean set.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Reviews (revised) | Coder repairs | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [**Set D**](r10-holdout-d/) (clean) | 16 | 15/16 | **14/16** | 3 | 3 (0) | 2 | 23 s | 174,310 |
| [Set C](r10-holdout-c/) (used for round 10) | 16 | 14/16 | 13/16 | 5 | 7 (7) | 2 | 29 s | 220,275 |
| [Showcase](r10-showcase/) | 18 | 16/18 | **16/18** | 0 | 5 (4) | 2 | 23 s | 213,136 |
| [Fixed cases](r10-fixed/) | 15 | **15/15** | 15/15 | 0 | 0 | 0 | 20 s | 121,579 |

**The clean held-out score, strict:**

| Round | Clean set | Score |
| --- | --- | --- |
| 8 | B | 10/16 |
| 9 | C | 12/16 |
| 10 | D | **14/16** |

Each round is measured on ideas its fixes never saw. The showcase holds at 16/18 strict, and the fixed cases pass 15/15 for the fifth round running.

**The remaining failures:**

| Run | Cause |
| --- | --- |
| seat picker 1 (D) | **Tester mistake.** The check selects B4, but the app's source lists B4 as already taken. The review answered that a correct app would pass. |
| streak clicker 1 (D, a pass only with drops) | **Tester arithmetic.** Three checks click 8 times and expect a purchase that costs 10. The review dropped them as `unsupported`. |
| mortgage 2 (C) | **Real app bug, caught.** Total paid is $10,789.52, but the amortization gives $10,789.56. Two further checks expected an error message that the browser's own `min` validation pre-empts; the review corrected them. |
| reaction 1 (C) | **No way to wait.** The box turns green after a random 1–5 s delay, and checks act immediately. Three checks were dropped as `unsupported`, and the cap kept two. |
| tip calculator 1 (showcase) | **Real app bug, caught.** $55.55 split 2 ways shows $27.77; floating-point rounding of 27.775 should give $27.78. |
| pet 3 (showcase) | **The review's correction asserted a change the requirement does not cause.** |

Two of the six are real app bugs that a person would notice. That is the job of the checks. The rest are model judgement errors (arithmetic, not reading the source) plus one language gap: there is no action that waits.

## Round 11 on `cedcf63`

The round-11 changes (commit `cedcf63`):
- A `wait` action, from 50 to 6,000 ms, with at most 8 s of waiting per check.
- The Tester is told to read fixed data from the source, such as taken seats, starting values and prices.

Set E (8 new ideas, commit `41780e8`) is this round's clean set.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Checks with a wait | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [**Set E**](r11-holdout-e/) (clean) | 16 | 15/16 | **13/16** | 2 | 27 | 33 s | 200,750 |
| [Set D](r11-holdout-d/) (used for round 11) | 16 | 15/16 | 14/16 | 3 | 33 | 27 s | 172,406 |
| [Set C](r11-holdout-c/) | 16 | 13/16 | 13/16 | 0 | 35 | 39 s | 249,848 |
| [Showcase](r11-showcase/) | 18 | 16/18 | **16/18** | 0 | 69 | 29 s | 237,369 |
| [Fixed cases](r11-fixed/) | 15 | **15/15** | 15/15 | 0 | 3 | 21 s | 124,766 |

**The `wait` action was adopted widely.** 167 checks use it. The reaction test (set C) passes 2/2, after 1/2 last round. The breathing guide and traffic light (sets D and E) are checked through their timed changes. Medians rose by a few seconds as a result.

**Clean set, strict:**

| Round | Clean set | Strict pass |
| --- | --- | --- |
| 8 | B | 10/16 |
| 9 | C | 12/16 |
| 10 | D | 14/16 |
| 11 | E | 13/16 |

Set E had 15/16 full passes. The dip from 14 to 13 strict comes from two passes that relied on dropped checks, and is within run-to-run noise. Showcase strict holds at 16/18, and the fixed cases passed 15/15 for the sixth round running.

**What remains, by class:**

| Class | Runs | Example |
| --- | --- | --- |
| A whole `class` attribute compared with one class | traffic light 2, beat sequencer 1 (drop), metronome 1 | expected `"on"`, actual `"lamp red on"` |
| A visual change checked as a text change | sort visualizer 1 (drop), breathing guide 1 (drop) | bars change `style.height`, but `changed` only compares text |
| Tester arithmetic | streak clicker 1 | clicks the coin 8 times for a 10-point purchase. This is the same idea and the same mistake as round 10 |
| Requirements that leave details open | pet 2, pet 3, expense 1 | an invented mood threshold; an error message the requirement never asks for |
| Random sequences | simon 2 | clicks every pad, "hoping one is wrong" |

The first two are language gaps and are next. The rest are model judgement errors.

## Round 12 on `e769484`

The round-12 changes (commit `e769484`):
- `attribute: "class"` now passes when the element has the listed classes.
- `changed`, `unchanged` and `stable` can compare an attribute, such as `style.height`.

Set F (8 new ideas, commit `7f0d675`) is this round's clean set.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Coder repairs | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [**Set F**](r12-holdout-f/) (clean) | 16 | 13/16 | **12/16** | 1 | 3 | 24 s | 218,658 |
| [Set E](r12-holdout-e/) (used for round 12) | 16 | 15/16 | 14/16 | 2 | 1 | 27 s | 200,365 |
| [Showcase](r12-showcase/) | 18 | **17/18** | **17/18** | 0 | 2 | 24 s | 208,658 |
| [Fixed cases](r12-fixed/) | 15 | **15/15** | 15/15 | 0 | 0 | 19 s | 132,456 |

**Results:**
- The showcase reaches its best strict score: 17/18.
- The fixed cases pass 15/15 for the seventh round running.
- On the clean sets, strict passes over rounds 8–12 were 10, 12, 14, 13, 12. **They have plateaued at 12–14 of 16.**

**Most remaining failures are no longer gaps in the language.**

| Run | Cause |
| --- | --- |
| typing trainer 2 (E) | **Real app bug, caught.** `.result { display: flex }` overrides the `hidden` attribute, so the result panel shows before the user has typed anything. This is the fourth app with this bug. The others were the memory win message, the loan results and the mortgage results. |
| accordion 1 (F) | **App behaviour, as judged by the review.** Opening a second question leaves the first one open, which is the opposite of what the requirement asks. |
| accordion 2 (F), memory 1 | **No way to read a computed style.** The arrow rotates through a CSS class, so the inline `style.transform` stays empty. |
| dice race 2 (F) | **Ambiguous key handling.** Space pressed on the page body is ignored when focus is on the roll button. |
| sort visualizer 2 (E, pass only with drops) | **Tester arithmetic.** The check expects one bubble-sort step to change a bar, and 8 steps to sort 10 bars. |

So the next round changes the app side as well as the checks:
- the Coder is told to make `hidden` always hide;
- checks can read computed styles.

## Round 13 on `7d3e8d9`

The round-13 changes (commit `7d3e8d9`):
- **Apps:** the Coder's constraints ask for `[hidden] { display: none !important; }`. This is the first change in these rounds aimed at the apps rather than the checks.
- **Checks:** `attribute: "css.<property>"` reads computed styles.

Set G (8 new ideas, commit `49961f9`) is this round's clean set.

| Set | Runs | Full pass | **Strict pass** | Checks dropped | Apps with the `[hidden]` rule | Median | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [**Set G**](r13-holdout-g/) (clean) | 16 | 13/16 | **13/16** | 0 | 16/16 | 36 s | 249,718 |
| [Set F](r13-holdout-f/) (used for round 13) | 16 | 15/16 | 14/16 | 1 | 16/16 | 25 s | 209,678 |
| [Showcase](r13-showcase/) | 18 | 16/18 | 15/18 | 1 | 18/18 | 28 s | 225,451 |
| [Fixed cases](r13-fixed/) | 15 | **15/15** | 15/15 | 0 | 15/15 | 20 s | 134,596 |

**The app-side fix held.** Every app of the round includes the rule, and no failure came from a `display` rule overriding `hidden`. In rounds 9–12, four apps had failed that way.

**The remaining failures are model reasoning errors:**
- **Maze 1 and 2:** the Tester traced a path through the maze and miscounted the steps. The review re-traced it and still miscounted.
- **Focus log 2:** counted `#entries-list`, the list itself, instead of its items.
- **Colour mixer 2:** wrote the pattern `rgb(255, 255, 255)` without escaping the parentheses. Since then, a pattern also matches its own text literally (commit after `7d3e8d9`; not measured).
- **Memory and pet (showcase):** an invented reshuffle check, and mood thresholds the requirement does not state.

## Where this leaves the held-out score

| Round | Clean set | Strict | Full |
| --- | --- | ---: | ---: |
| baseline | A | 10/16 | 11/16 |
| 8 | B | 10/16 | 12/16 |
| 9 | C | 12/16 | 12/16 |
| 10 | D | 14/16 | 15/16 |
| 11 | E | 13/16 | 15/16 |
| 12 | F | 12/16 | 13/16 |
| 13 | G | 13/16 | 13/16 |

On ideas the pipeline has never seen, `deepseek-chat` now produces an app that passes every one of its own Tester's checks in about **13 of 16 runs (80%)**. At the start of this work it was 10 of 16. The fixed cases passed 15/15 in eight rounds running.

The failures still left are model reasoning errors:
- tracing a maze;
- arithmetic;
- choosing a selector.

Most of them are the Tester's. Further gains are more likely from a stronger model for the Tester than from more check vocabulary.
