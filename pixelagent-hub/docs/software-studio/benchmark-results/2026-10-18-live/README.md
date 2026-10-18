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

| Case | Before | After |
| --- | --- | --- |
| Counter | 3/3 | 2/3 |
| Task list | 2/3 | 2/3 (one rescued by repair) |
| Calculator | 0/3 | **3/3** |
| Converter | 0/3 | **2/3** |
| Quiz | 3/3 | 2/3 |

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

## Reading this honestly

- Fifteen runs per configuration on small fixed cases is a small sample, not a success rate.
- The Tester is a model too. Its mistakes are now the main reason a correct app is marked as failing, and the only remedy this pipeline has for a failed check is to change the app. A natural next step would be to let the Tester re-examine a failing check before blaming the Coder.
- In-page checks run inside the app's own page; see the limits in the main README.

## Files

- `before/` and `after/`: `summary.json`, plus one file per run containing its outcome, every recorded event, the Tester's plan, the Coder rounds and the final source.

Reproduce (calls the paid model):

```sh
npm run replay:export -- --browser
VITE_REPLAY=1 VITE_BASE=/PIXELAGENT-HUB/ npm --prefix dashboard run build
DEEPSEEK_API_KEY=… npx tsx scripts/benchmark-live.ts dashboard/dist/public <out-dir> --runs 3 --model deepseek-chat
```
