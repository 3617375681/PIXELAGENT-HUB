# Does a planning Manager help now? — 2026-10-21

Closes [issue #20](https://github.com/Jiarong-Song233/PIXELAGENT-HUB/issues/20).

The [2026-10-15 comparison](../2026-10-15-repeated/README.md) found no measurable gain from the Manager: 13/15 runs for Manager → Coder against 12/15 for Coder only. That comparison used fixed check plans with shared page state, on the server Studio. Since then the pipeline has changed a lot:
- every check runs on a freshly loaded page;
- the Tester's checks are reviewed;
- the Coder gets one browser-repair round;
- the check language has grown;
- everything runs in the browser.

## Setup

PLAY LIVE gained a benchmark-only `coder-only` strategy (commit `2ac3eb4`), started with `#/studio?idea=…&strategy=coder-only`. It skips the Manager, so the Coder works from the idea alone.

Both arms ran on the same build, with `deepseek-chat` and the same Tester, review and repair:
- **fixed cases:** the 5 fixed cases, 3 runs each;
- **set H:** the 8 ideas of held-out set H, 2 runs each. Set H is pre-registered and was never used for tuning.

## Result

| Set | Strategy | Strict pass | First check run all green | Compile failures | Coder repairs | Median | Tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed cases | [Manager → Coder](fixed-manager-coder/) | 14/15 | 14/15 | 0 | 1 | 20 s | 141,449 |
| Fixed cases | [Coder only](fixed-coder-only/) | **15/15** | 15/15 | 1 | 0 | 17 s | 110,801 |
| Set H | [Manager → Coder](holdout-h-manager-coder/) | 14/16 | 10/16 | 0 | 3 | 25 s | 217,357 |
| Set H | [Coder only](holdout-h-coder-only/) | 14/16 | 14/16 | 4 | 2 | 21 s | 193,330 |
| **Total** | **Manager → Coder** | **28/31** | 24/31 | 0 | 4 | | 358,806 |
| **Total** | **Coder only** | **29/31** | 29/31 | 5 | 2 | | 304,131 |

**The answer is unchanged: no measurable gain from the Manager.**
- **Cost:** the plan costs about 1,150 tokens per run (35,815 across 31 runs) and about 3–4 s.
- **Passes:** final results are within one run of each other.
- **Compile failures:** the one visible difference is that planned runs had none (0), while Coder-only runs had 5. The compile loop fixed all of them, so they did not change the outcome.

The failures:
- **Manager → Coder:**
  - task list 2;
  - colour-swap puzzle 1;
  - interval trainer 2.
- **Coder only:** keypad lock 1 and 2. These are the same "locks for 10 seconds" wording that the [Tester-model experiment](../2026-10-21-tester-model/README.md) ran into.

## How often do the review and the repair rescue a run?

The issue's second question, answered from every PLAY LIVE record kept since 2026-10-18 (688 runs across all rounds):

| | Runs |
| --- | ---: |
| First check run had a failure | 179 |
| Then passed without a Coder repair (the Tester's review corrected or dropped checks) | 78 (44%) |
| A Coder repair round ran | 101 |
| The repair round led to a full pass | 17 (17% of repairs) |
| The repair round made the score worse | 6 |

These runs span many pipeline versions, so the shares are rough. The direction is consistent across rounds:
- **Fixing the checks rescues far more runs than fixing the app.** When the first check run fails, the check is wrong more often than the app.
- The repair round does help in some cases. In 17 runs it turned a correct diagnosis of a real bug into a passing app.
- It can also make things worse, by changing a correct app to satisfy a check that was itself wrong.
