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
| [`showcase-count/`](showcase-count/) | `40c1087` (clean), `count` + `attribute` + unthrottled frame | **12/18** | 0 | 0 | 8 (5) | 2 | 0 |
| [`showcase-visible/`](showcase-visible/) | `5324a64` (clean), transparent = hidden, live `checked`, `unsupported` verdict | **17/18** | 0 | 0 | 4 (10) | 0 | 0 |

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

| Idea | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 |
| --- | --- | --- | --- | --- | --- |
| Snake | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 |
| Pomodoro timer | 3/3 | 0/3 (CSS casing regression) | 3/3 | 3/3 | 3/3 |
| Tip calculator | 2/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Pixel pet | 1/3 | 1/3 | 1/3 | 2/3 | 3/3 |
| Memory match | 1/3 | 3/3 | 1/3 | 2/3 | 3/3 |
| Palette generator | 0/3 | 2/3 | 1/3 | 2/3 | 2/3 |

Per-idea results swing widely between rounds (memory went 3/3 → 1/3 with no relevant change), so at three runs per idea only the totals and the removed failure classes are meaningful. Crashes and runs without checks went from 4 to 0.

The review now parses and does revise checks: 6 and 7 in the last two rounds, each time saving one run. It also still stands by checks it should have corrected: in round 2 it judged the uppercase-label failures as app bugs while explaining that the check was at fault. That is a model-judgement limit, not a parsing one.

### Round 4: `count`, `attribute` and an unthrottled check frame

[`showcase-final-failures.md`](showcase-final-failures.md) found that none of round 3's 7 failures was a plain first-build app bug. Five were checks the language could not express (an element count, an attribute value) and one was the PLAY LIVE check frame being throttled. Round 4 adds `count` and `attribute` assertions and moves the frame on screen (transparent, click-through). The source is the three PR branches (#33, #34, #35) merged onto `a93cdd5`.

**The result is 12/18, not the 17/18 that analysis predicted.** The Tester did adopt the new assertions: 15 of 18 plans use `count` or `attribute`, 60 checks in all; only the three snake plans use neither. The ideas round 3 lost to the language improved: pet, memory and palette each went from 1/3 to 2/3. Snake went from 2/3 to 0/3.

**The 6 failures:**

| Run | Final checks | Cause |
| --- | ---: | --- |
| snake 1, 2, 3 | 7/10, 9/10, 9/10 | **`visible` ignores opacity.** All three apps hide the overlay with `.overlay.hidden { opacity: 0 }`. A person sees it disappear, but `visible` follows Playwright's rule (a non-empty box, not `visibility:hidden`), so it still reads `true`. Every one of these runs fails a "Start hides the overlay" check, and snake 1 also fails two more of the same kind (after Resume, after Restart). These are the only failures in the three runs, and the apps are correct. |
| memory 1 | 6/8 | **A real app bug, caught.** The win message has the `hidden` attribute, but `.win-message { display: flex }` overrides it, so "You win!" shows on a fresh board. The review read this correctly (`app-wrong`) and also fixed 2 broken checks. The repair round did not fix the CSS. |
| pet 1 | 7/8 | **A Tester mistake.** `attribute: "style"` was compared with `"100%"`; the attribute is `"width: 100%;"`. The review explained exactly that, then still answered `app-wrong`. |
| palette 3 | 6/8 | **A language gap, plus a Tester mistake.** `attribute: "checked"` reads the attribute, which a click does not change; the live state is the `checked` property (it reads `""`). Another check predicted a random hex code. The review corrected that check, but the new one still predicts a random value. |

**What this shows:**
- **Adding to the language helped where the language was the problem.** The ideas whose round-3 failures were counts and attributes gained 3 full passes, and no failure this round is a count.
- **The semantics of the language matter, not only its vocabulary.** `visible` was copied from Playwright, and Playwright counts an `opacity: 0` element as visible. Round 3's snakes hid the overlay with `visibility`, and round 4's happened to use opacity. So the rule that matches a person's view is "not transparent", and the same goes for `checked`: the property, not the attribute.
- **The checks caught a real bug** (memory 1) that a person would see on load, and the review blamed the app for the right reason.
- **The review still sometimes explains a check error and then blames the app** (pet 1). An `unsupported` / check-wrong path that does not require a perfect rewrite is still open.
- Per-idea swings remain large (snake 2/3 → 0/3 came from a CSS style choice the models made, not from a code change), so 11/18 → 12/18 is within noise. The failure classes are the useful signal.

Tokens: 276,405 for the 18 runs (round 3: 266,250); median 27 s per run (round 3: 32 s).

### Round 5: transparent means hidden, `checked` reads the live state, and an `unsupported` verdict

The changes, all from round 4's failures:
- `visible` now also requires that neither the element nor an ancestor has opacity 0.
- `attribute: "checked"` reads a checkbox or radio's live state.
- The review has a third verdict, `unsupported`. Such a check is dropped, recorded as a limitation and never sent to the Coder. At most a third of a plan can be dropped, and a plan is never emptied.

The source is `5324a64`: the round-4 branch plus these changes.

**17/18 full passes.** All three snakes passed. Every one again hides its overlay with opacity (two with `.hidden { opacity: 0 }`, one with `.overlay { opacity: 0 }` plus `.visible { opacity: 1 }`), and every "Start hides the overlay" check now passes. Pet and memory went to 3/3.

**Read this before the headline:**
- **No check was dropped.** The `unsupported` verdict was never used, so none of the 17 passes comes from checking less. Its value here is untested.
- **No `checked` check was written**, so that fix is also unmeasured.
- **Only 4 runs needed a review and only 1 a Coder repair** (round 4: 8 and 6). Most of the gain is first plans that pass. Part of that reflects the fixes; part is ordinary run-to-run variance. Tokens fell to 197,075 (round 4: 276,405) because fewer runs went through review and repair.

**The one failure, palette 2 (9/10).** The plan's five lock checks targeted `.lock-btn`, which matches 5 elements. The review correctly revised all five to target the first swatch. But for "Locked swatch keeps its hex after Generate" it wrote `expected: "__CAPTURED_HEX__"`, a placeholder for a value it wanted to read before clicking Generate. The language cannot remember a value from earlier in a check. That is exactly the case `unsupported` exists for, and the review chose an impossible correction instead. The app was correct.

**What five rounds show.** On these six ideas, full passes went 7 → 9 → 11 → 12 → 17 of 18. Apart from feeding malformed replies back instead of failing the run, no change touched how apps are written. Every other gain came from making the checks see what a person sees and say what the requirement means:
- validating and feeding back malformed replies;
- comparing rendered text;
- adding element counts and attribute values;
- treating transparent as hidden;
- running the checks in a frame the browser does not throttle.

At three runs per idea, one round can swing a lot (snake went 2/3 → 0/3 → 3/3 as models switched between `visibility` and `opacity`). So the removed failure classes are the result, not the exact 17.

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
