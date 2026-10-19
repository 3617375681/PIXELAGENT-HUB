# PLAY LIVE benchmark — 2026-10-18

**How often does a visitor's PLAY LIVE run end with a fully checked app?** The five fixed benchmark cases ([`config/studio-benchmark.json`](../../../../config/studio-benchmark.json): counter, task list, calculator, converter, quiz) were run three times each through the **built static site in Chromium**, exactly as a visitor runs them:
- Manager → Coder (up to 3 compile rounds);
- a Tester-written plan with fresh isolation;
- sandboxed in-page checks;
- one repair round when a check fails.

The model is `deepseek-chat`. The page held a test key, and `scripts/benchmark-live.ts` forwarded requests to `api.deepseek.com` with the real key at the network layer. Each run used a fresh browser profile, and its recorded events, plan and source are saved here.

"Full pass" means the run finished and its last check run passed every check.

## Result

| | Source | Full pass | Repair round triggered | Rescued by the repair round | Median time | Tokens (15 runs) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [`before/`](before/) | `b5810ee` (clean) | **8/15** | 6 | 0 | 24 s | 146,058 |
| [`after/`](after/) | `4c4fbde` (clean), Tester prompt fix | **11/15** | 4 | 1 | 20 s | 136,597 |
| [`review/`](review/) | `5b6401c` (clean), + whitespace fix + Tester review | **14/15** | 0 | 0 | 19 s | 111,641 |

| Case | Before | After | Review |
| --- | --- | --- | --- |
| Counter | 3/3 | 2/3 | 3/3 |
| Task list | 2/3 | 2/3 (one rescued by repair) | 3/3 |
| Calculator | 0/3 | **3/3** | 3/3 |
| Converter | 0/3 | **2/3** | 2/3 |
| Quiz | 3/3 | 2/3 | 3/3 |

Every run compiled on the first attempt.

## What failed, and what changed

**Before: all 7 failures came from the Tester, not from the apps.**
- **Calculator ×3:** the subtraction, multiplication and division checks never chose the operation `<select>`. With fresh isolation each check starts from a reload, so the correct app computed its default, addition (3 + 10 = 13, expected −7).
- **Converter ×3:** the checks *clicked* the direction `<select>`, which does not change its value.
- **Task list run 3:** the plan was rejected because its `limitations` list was not plain strings.

The repair round sent these correct apps back to the Coder and could not help, which is why it rescued none of them.

**Fix** (`4c4fbde`, in the shared Tester prompt and parser, so it applies to the server too):
- every check must set every input and select it depends on;
- a `<select>` option is chosen with an `input` action using the option's value;
- `limitations` are normalised instead of failing the plan.

**After: of the 4 remaining failures, none was an app bug.**
- **Counter run 3:** the Tester's arithmetic was wrong. +1 +1 −1 +1 −1 −1 −1 is −1; the app showed −1 and the plan expected −2.
- **Quiz run 2:** a check clicked Next without answering first. Next is locked until an answer is chosen, so the app correctly stayed on question 1.
- **Converter run 3:** the formula text differed only by a double space. Text assertions now collapse whitespace on the server and in the page (`bf98d91`, after this run; not re-measured).
- **Task list run 3:** the plan used an action shape the schema does not allow. The plan was rejected, so the app shipped without checks.

One run (task list, run 1) failed a check, went through the repair round, and then passed.

## Third round: whitespace fix and Tester review

The third round includes two later changes:
- text assertions collapse whitespace (`bf98d91`);
- **the Tester re-examines its failing checks** before the Coder is blamed (`45a3126`). A check it judges wrong is replaced by a corrected check testing the same requirement; failures it stands by still go to the Coder.

**14/15** runs passed fully. Read that carefully: **no run had a failing check, so the review never triggered.** These 15 runs do not measure the review at all. The gain over the second round reflects the whitespace fix and normal run-to-run variance. Unit tests cover the review logic, but its real-world effect is unmeasured.

The one failure (converter, run 1) was again a plan the schema rejected, an action shape that is not allowed; the app shipped without checks. That has happened in 2 of 45 runs, so a rejected plan now goes back to the Tester once with the validation error (`19cf3e0`, after this round; not measured).

## Harder ideas: the six showcase apps

The five fixed cases had become too easy to exercise the Tester review. So the six showcase ideas ([`config/live-showcase-cases.json`](../../../../config/live-showcase-cases.json): snake, pomodoro timer, tip calculator, pixel pet, memory match, palette generator) were each run 3 times, in three rounds, with fixes in between.

| Round | Source (all clean) | Full pass | Crashed | No checks | Reviews (checks revised) | Saved by the review | Saved by the Coder repair |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [`showcase/`](showcase/) | `c825c43` | 7/18 | 2 | 2 | 8 (0) | 0 | 1 |
| [`showcase-fixed/`](showcase-fixed/) | `da4b0c2` | 9/18 | 0 | 0 | 10 (6) | 1 | 0 |
| [`showcase-final/`](showcase-final/) | `6560e7b` | **11/18** | 0 | 0 | 9 (7) | 1 | 1 |

**What the first round exposed:**
- **The Tester review was effectively broken.** In 7 of its 8 real runs the reply failed validation (`null` reasons, `null` or unknown assertions), so the whole review was discarded and it revised nothing. The unit tests had only fed it well-formed replies.
- **The check language could not express what the Tester needed.** It expected empty text for hidden elements (a hidden element's `textContent` still contains its text). It expected paragraphs to read as separate sentences (`textContent` glues them together). And it predicted the colors a palette generator picks at random.
- **Malformed JSON ended runs.** Two Coder replies and one plan were not valid JSON.

**Fixed in `da4b0c2`:**
- Plans and reviews are validated item by item: a bad check is dropped with a note, and a bad verdict leaves its failure standing.
- There is a new `visible` assertion.
- Text checks compare rendered text.
- The Tester is told not to predict random values.
- A Coder reply that is not valid JSON becomes a failed round fed back to the Coder.

**A regression, fixed in `6560e7b`:** comparing rendered text also applied CSS `text-transform`. A timer whose button is styled uppercase showed "PAUSE" where the check expected "Pause", and all three timers failed. A text check now passes when the expected value matches either the rendered or the source text.

| Idea | Round 1 | Round 2 | Round 3 |
| --- | --- | --- | --- |
| Snake | 0/3 | 0/3 | 2/3 |
| Pomodoro timer | 3/3 | 0/3 (CSS casing regression) | 3/3 |
| Tip calculator | 2/3 | 3/3 | 3/3 |
| Pixel pet | 1/3 | 1/3 | 1/3 |
| Memory match | 1/3 | 3/3 | 1/3 |
| Palette generator | 0/3 | 2/3 | 1/3 |

Per-idea results swing widely between rounds (memory went 3/3 → 1/3 with no relevant change), so at three runs per idea only the totals and the removed failure classes are meaningful. Crashes and runs without checks went from 4 to 0.

The review now parses and does revise checks: 6 and 7 in the last two rounds, each time saving one run. It also still stands by checks it should have corrected: in round 2 it judged the uppercase-label failures as app bugs while explaining that the check was at fault. That is a model-judgement limit, not a parsing one.

## Reading this honestly

- Fifteen runs per configuration on small fixed cases is a small sample, not a success rate.
- The Tester is a model too. Its mistakes are now the main reason a correct app is marked as failing, and the only remedy this pipeline has for a failed check is to change the app. Since the second round, the Tester re-examines a failing check before the Coder is blamed. On the harder ideas it revised 13 checks across two rounds and saved one run in each, but it still sometimes stands by a check it should correct.
- In-page checks run inside the app's own page; see the limits in the main README.

## Files

- `before/` and `after/`: `summary.json`, plus one file per run containing its outcome, every recorded event, the Tester's plan, the Coder rounds and the final source.

Reproduce (calls the paid model):

```sh
npm run replay:export -- --browser
VITE_REPLAY=1 VITE_BASE=/PIXELAGENT-HUB/ npm --prefix dashboard run build
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out-dir> --runs 3 --model deepseek-chat
```
