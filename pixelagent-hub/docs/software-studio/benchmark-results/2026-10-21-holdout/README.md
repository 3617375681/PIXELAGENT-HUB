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
