# Why 7 of 18 showcase runs did not fully pass

**Scope:** the third showcase round, [`showcase-final/`](showcase-final/) (source `6560e7b`, `deepseek-chat`), which reached 11/18 full passes ([README](README.md#harder-ideas-the-six-showcase-apps)). This note covers the seven runs that did not fully pass, with their recorded events, plans and final sources. It changes no code and makes no new model calls.

**Method.** I read each run record: the `browser_check` events, the Tester review verdicts, the final plan and the final source.

Then I **replayed every final plan against its saved final source** in Playwright's headless Chromium shell, with no model and no API cost. The replay uses a JS copy of `runDOMChecks` ([`dashboard/src/lib/studioChecks.ts`](../../../../dashboard/src/lib/studioChecks.ts)), inside an iframe styled like the PLAY LIVE frame ([`dashboard/src/lib/live/checks.ts:29`](../../../../dashboard/src/lib/live/checks.ts)).

The replay reproduced all seven recorded final scores exactly: 5/10, 1/9, 3/10, 6/7, 6/7, 2/4 and 6/7.

Two variants then test hypotheses:
- **(a)** the same checks in a frame that is on screen but transparent;
- **(b)** prototype reads that compute what each failing check meant: an `aria-valuenow` value, or an element count.

These prototypes are not product code. The record keeps only the final source. Where the repair round changed the app, the first version is reconstructed, and the note says so.

## Summary

| Run | Final checks | Root cause | Failing checks (cause) |
| --- | ---: | --- | --- |
| snake 1 | 5/10 | **Infrastructure**, then the Tester, then a Coder regression | 2 overlay-hidden checks (infra: CSS transition frozen in the throttled frame); 2 "how to play" text checks (Tester); 3 pause-screen checks (an app bug introduced by the repair) |
| pet 1 | 1/9 | **Check language** (no attribute read), then a Coder regression | 6 bar-value checks (language); the repair then crashed the app (`null.style`) |
| pet 2 | 3/10 | **Check language** (no attribute read) | 7 `aria-valuenow` checks compared empty text |
| memory 1 | 6/7 | **Check language** (no element count) | "Board renders exactly 16 card buttons": text of `#board` vs "16" |
| memory 2 | 6/7 | **Check language** (no element count) | `#board .card` matches 16 elements; the language requires exactly one |
| palette 2 | 2/4 | **Check language** (no element count) | 2 checks: text of `#palette` vs "5" |
| palette 3 | 6/7 | **Check language** (no count or prefix), plus a Tester selector mistake | `.hex-code:first-of-type` still matches 5 elements; expected "#" can only match exactly |

**Six of the seven apps were correct as first built.** The exception is snake, where the first source is not saved. Its two disputed text checks are a matter of interpretation, not a clear app bug.

Across the seven runs, **no failure is a plain first-build app bug**. The failures fall into three groups:

- **Check language: 5 runs.** The language cannot express what the Tester meant: an attribute value, an element count, or a text prefix.
- **Infrastructure: 1 run.** The PLAY LIVE check frame freezes CSS transitions.
- **A wrong Tester check: present in 2 runs,** but it decides neither run.

**The repair round hurt 2 runs.** In both, the Coder was asked to fix checks that no app change could satisfy, and it changed the app anyway:
- pet 1 went from 3/9 to 1/9, and the run now ships an app that throws on every click;
- snake 1 went from 6/10 to 5/10.

**The review did not catch the bad checks.** In 6 of 7 runs, it read the source, explained in its reason that the check could not observe what it wanted, and still returned `app-wrong`. Its only alternative, `check-wrong`, requires a corrected check, and the language has no form it could correct to.

## Per-run notes

### snake 1: 6/10 → review → 6/10 → repair → 5/10

Requirement: *"Start paused and show how to play."*

**1. Infrastructure: "Clicking Start begins game and hides overlay" and "Space key resumes from paused overlay".** Both checks expect `visible` = `"false"` for `#overlay`. The run recorded `actual="true"` in all three check runs, before and after the repair.

The app is correct: clicking Start removes the class, and the CSS hides the overlay after a 0.2 s transition.

```css
.overlay { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; }
.overlay.visible { opacity: 1; visibility: visible; }
```
```js
} else if (state === 'running') {
  overlay.classList.remove('visible');
```

The live check frame is placed off screen and hidden:

```ts
frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;border:0;visibility:hidden';
```

The frame is sandboxed, so it is cross-origin, and it is off screen and hidden, so Chromium throttles it. I sampled the overlay's computed style for 2 s after the click:

| Frame | Overlay after the click | `setTimeout(200)` actually fires every |
| --- | --- | --- |
| Live style | `visibility:visible`, `opacity:1` for the whole 2 s; 2 transitions stay pending | ≈ 1,000 ms (throttled) |
| On screen | `visibility:hidden` from about 400 ms on | ≈ 200 ms |

In the live-style frame, the transition never finishes inside the 2 s wait. At about 1.5 s the snake hits the wall (`{x:10}` moving right on a 20-cell grid at 150 ms per tick). The game-over overlay then really is visible.

Replay of the final plan against the final source:
- live-style frame: **5/10**, the same checks and actuals as recorded;
- transparent on-screen frame: **7/10**, and both overlay checks pass.

The review read the code correctly and still blamed the app:

> "Clicking the overlay Start button while paused calls togglePause, which sets state to running and removes the 'visible' class … Observed true indicates" → `app-wrong`

No model in the loop can fix this class of failure.

The 1 Hz timer throttling also means every timing-sensitive app (timers, games) runs several times slower in PLAY LIVE checks than for a visitor (a 150 ms tick fires about once a second). That is a latent risk beyond this run.

**2. Tester check wrong (Tester review): "Initial state shows how-to-play overlay…" and "Restart button returns to paused how-to-play state".**
- **Round 1.** The checks expected the instruction sentence; the app showed "Paused" (`actual="Paused"`). The review judged both checks `check-wrong`, and its reason says the app *does* show instructions: "the overlay does show how to play, but the title is 'Paused'".
- **Revised checks.** Their selector moved to `#overlayText`, but they still expected the exact sentence "Use arrow keys to move. Eat the red pixel to grow and score. Avoid walls and yourself.". The first version's `#overlayText` read "Game is paused. Press Space or click Resume to continue.", so both still failed.
- **Verdict.** The requirement does not fix this wording, so the revision fixed the selector but not the real problem.

**3. A regression from the repair round.** The Coder was given all four failures and rewrote the paused state to make the start screen read "How to Play". In the final source:
- initial and paused states share one branch;
- pausing now shows "How to Play" instead of "Paused";
- the pause button no longer reads "Resume" when paused.

```js
if (state === 'paused') {
  overlayTitle.textContent = 'How to Play';
  …
  pauseBtn.textContent = 'Pause';
```

Three checks that passed before now fail:
- "Initial pause button offers Resume" (`actual="Pause"`);
- "Pause button toggles to Resume…" (`"Pause"`);
- "Pausing shows Paused overlay title" (`"How to Play"`).

This final app is wrong. A paused game says "How to Play" and offers "Pause".

**Classification:** infrastructure (2 checks, every run), a Tester check the review revised badly (2 checks), and an app regression caused by sending the two infrastructure failures to the Coder (3 checks).

### pet 1: 3/9 → review (0 revised) → repair → 1/9

Six checks compare the text of the progress bars, for example "Feed increases hunger bar value" (`#hungerBar`, expected "90"). In round 1 every one returned `actual=""`. The value lives only in an attribute and a width:

```html
<div class="bar" id="hungerBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="70">
  <div class="bar-fill hunger" style="width: 70%"></div>
```

The Tester knew this. Its plan says "Bar width is set via inline style; text assertions on bar elements are empty". The review says the check "must compare the attribute, not text content", and still returns `app-wrong` for all six.

The Coder then added `bar.textContent = value;` to `updateUI()`. That line deletes the `.bar-fill` child, so the next `bar.querySelector('.bar-fill').style` throws:

> `Uncaught TypeError: Cannot read properties of null (reading 'style')`

That error is recorded in `browser_run_finished`. The final run is 1/9, and **the shipped app is broken**: no button updates anything.

I reconstructed the first version by removing that line, then read `aria-valuenow` (prototype b). **All 9 checks match:** 90, 65, 90, 55, 95, 65, plus Happy, Hungry and Tired. The app was correct.

**Classification:** check language (no attribute assertion), then a Coder regression caused by sending an impossible check to the Coder.

### pet 2: 2/10 → review (1 revised) → 3/10 → repair → 3/10

The check names say what they mean, for example "Feed increases hunger aria-valuenow to 95". The language only reads text, so all seven bar checks returned `actual=""` in all three runs.

The one revised check was a real Tester arithmetic mistake, and the review fixed it. "Mood updates to Okay after two Play clicks" now expects "Mood: Happy". With the starting stats (80, 70, 90) and two Play clicks, the average is 80, which the app maps to Happy.

Reading `aria-valuenow` on the final source (prototype b) matches all 7: 95, 85, 85, 80, 75, 100, 70. The repair changed nothing observable.

**Classification:** check language (no attribute assertion). The app is correct.

### memory 1: 6/7 → review (0 revised) → repair → 6/7

"Board renders exactly 16 card buttons" compares the text of `#board` with "16" and gets `actual=""`. The board does have 16 `.card` children (prototype b: `children=16`). The review explains that the check "should count elements" and returns `app-wrong`. The Coder could not change anything that matters, and the result stayed 6/7.

**Classification:** check language (no count). The app is correct.

### memory 2: 6/7 → review (0 revised) → repair → 6/7

"Board renders sixteen face-down cards" uses selector `#board .card` with `visible` = "true". Both runners refuse it:

```ts
if (matches.length !== 1) throw new Error(`Selector must match exactly one element: ${selector} (found ${matches.length})`);
```

The source is [`studioChecks.ts:9`](../../../../dashboard/src/lib/studioChecks.ts) and [`src/studio/browserRuns.ts:106`](../../../../src/studio/browserRuns.ts). The selector matches 16 elements, which is exactly what the requirement asks for. The Tester even listed the gap in its limitations: "counting that exactly 16 cards exist is not directly supported." The review again explains the gap and returns `app-wrong`.

**Classification:** check language (no count). The app is correct.

### palette 2: 2/4 → review (0 revised) → repair → 2/4

"Palette shows five swatches with hex codes" and "Each swatch has a lock button" both compare the text of `#palette` with "5". The recorded actual is `"#2FF08E 🔓 #0E45C0 🔓 #DB2FF0 🔓 #C01D0E 🔓 #B9F02F 🔓"`, which shows five swatches, each with a hex code and a lock. Prototype b found `children=5`, and the source builds one `.swatch` with one `.lock-btn` per color. The review explains that the check should count and returns `app-wrong`.

**Classification:** check language (no count). The app is correct.

### palette 3: 6/7 → review (1 revised) → 6/7 → repair → 6/7

The original "Five swatches with hex codes rendered on load" failed on the exactly-one rule. The review said so ("The selector .hex-code matches 5 elements") and revised it to `.hex-code:first-of-type` with expected "#". That revision is wrong twice:
- `:first-of-type` is per parent, and each `.swatch` has its own first `span.hex-code`, so it still matches **5** elements (prototype b: "5 match(es)");
- even on one element, `"#"` can never equal a random `"#A2751C"`, because text assertions only test equality.

The requirement, five swatches each with a hex code, needs a count, or a pattern such as `^#[0-9A-F]{6}$`.

A related weakness is not a failure. The three "lock" checks use `visible` = "true" on the lock button, which passes whether or not locking works. The button text does change from 🔓 to 🔒 when locked, and `aria-pressed` flips. The Tester wrote "Lock state is exposed only via aria-pressed, which the … assertions cannot read" and missed the text change. An attribute assertion would let these checks test the lock.

**Classification:** check language (no count or pattern), with a wrong Tester revision (`:first-of-type`). The app is correct.

## Ranked fixes

The rescue counts apply these seven failures to the fixes. A rerun generates new plans, so they are expectations to measure, not guarantees. Fixes 1 and 2 add to the check language. The language is shared, so each one touches:
- the schema;
- the Tester prompts;
- **both** runners;
- the OpenAPI contract and `studioContract.test.ts`, if the plan shape is part of it.

1. **A `count` assertion: compare the number of elements a selector matches.** This drops the exactly-one rule for this assertion only.
   - Files:
     - [`src/studio/shared/schemas.ts`](../../../../src/studio/shared/schemas.ts) (enum, and an integer `expected`);
     - [`src/studio/shared/prompts.ts`](../../../../src/studio/shared/prompts.ts) (Tester and review rules);
     - [`src/studio/shared/repair.ts`](../../../../src/studio/shared/repair.ts) (type);
     - [`dashboard/src/lib/studioChecks.ts`](../../../../dashboard/src/lib/studioChecks.ts);
     - [`src/studio/browserRuns.ts`](../../../../src/studio/browserRuns.ts).
   - **Expected rescue: 4 runs** (memory 1, memory 2, palette 2, palette 3). The counts are verified on the saved sources: 16 cards; 5 swatches; 5 lock buttons; 5 hex codes.
2. **An `attribute` assertion: read a named attribute, at least `aria-*` and `value`.** It also lets lock and toggle checks test real state through `aria-pressed`.
   - Files: the same five as fix 1.
   - **Expected rescue: 2 runs** (pet 1 and pet 2). In pet 1, the failure would no longer reach the repair that crashed the app. All 13 bar values are verified on the sources.
3. **Stop throttling the PLAY LIVE check frame.** Put it in the viewport but hide it from the visitor, for example `position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1`. The current frame is off screen and `visibility:hidden`.
   - File: [`dashboard/src/lib/live/checks.ts:29`](../../../../dashboard/src/lib/live/checks.ts).
   - **Expected rescue: 0–1 runs** (snake 1). It fixes 2 of its round-1 failures for certain; the replay goes from 5/10 to 7/10 on the final source. The run still has the two disputed text checks.
   - **This fix comes first anyway.** It is the only failure class no model can work around, and it makes PLAY LIVE checks disagree with the server runner, which runs in a real page. It also removes the 1 Hz timer throttling that slows every timing-sensitive app several times over.
   - Verify that the transparent frame really is unthrottled in a *visible* Chrome tab, not only headless.
4. **Keep the better build when the repair round makes checks worse.** Today the run keeps the repaired build whenever it compiles.
   - File: [`dashboard/src/lib/live/studio.ts`](../../../../dashboard/src/lib/live/studio.ts), lines 210–220 (`good` is restored only when the repair fails to build). The server's repair path should follow the same rule.
   - **Expected rescue: 0 full passes.** It would have stopped pet 1 from shipping a crashing app (3/9 → 1/9) and snake 1 from shipping a paused screen that says "How to Play" (6/10 → 5/10).
5. **Let the review say "the language can't check this".** Add a third verdict such as `unsupported`: the check moves to `limitations` instead of going to the Coder as an app bug.
   - Files: [`src/studio/shared/prompts.ts`](../../../../src/studio/shared/prompts.ts) (`testerReviewPrompt`), [`src/studio/shared/parse.ts`](../../../../src/studio/shared/parse.ts) (`parseTesterReview`, lines 60–81), and `reviewChecks` in [`dashboard/src/lib/live/studio.ts`](../../../../dashboard/src/lib/live/studio.ts).
   - **Expected rescue: 0 after fixes 1–3.** On its own it would turn up to 5 runs into passes **only by checking less**, so it changes the metric, not the apps. Its real value is keeping impossible checks away from the Coder, which caused both regressions above.
   - Also report `checksRevised` as checks that actually changed, not as `check-wrong` verdicts. Palette 3 counts as "1 revised", yet its revision tests nothing new.
6. **Record the failure message in `browser_check` events.** Today only `actual` is kept, so a message like "Selector must match exactly one element … (found 16)" is lost from the evidence. I had to replay these runs to see it.
   - File: [`dashboard/src/lib/live/studio.ts:300`](../../../../dashboard/src/lib/live/studio.ts). The server's events need the same change.
   - **Expected rescue: 0.** This is diagnostics only.

With fixes 1–3, the expected result on a rerun of the same 18 runs is about **17/18**, if the Tester uses the new assertions. Fixes 4 and 5 make the remaining failures less harmful, not fewer. The model-judgement limit noted in the README still applies: the review sometimes stands by a check it should correct. These seven runs add a second limit: **the review cannot correct a check the language cannot express**.

## Reproducing the replay

The replay harness is not part of this change. It was:
- a Node script that inlines a run's `files` into one page, beside a JS copy of `runDOMChecks`;
- an iframe with the live frame's style, or a transparent on-screen style;
- Playwright's `chromium_headless_shell` driven over the DevTools protocol.

It needs no model and no key. To repeat it after a fix:
- build the dashboard;
- load each run's `files` and `plan.checks` into the real `runInPageChecks`;
- compare the result with the recorded `checkRuns`.
