# Real-model browser evaluation — 2026-10-09

Five cases, two strategies, one generation per case/strategy. All ten generations used `deepseek/deepseek-v4-pro`, commit `3646bc6178868ac7824dae0a2466e032ab38ab0b`, and a clean tracked working tree. The counter and remaining four cases ran in two separate invocations; their original manifests, frozen cases and reports are retained here. This is real model output, not a response fixture.

Environment: Windows, Node 24.21.0, installed Edge Chromium 154.0.4258.62, viewport 1280×720. Fixed plans were saved without calling Tester; each browser ran once. Browser checking sometimes overlapped subsequent generation. Timing, cache, model randomness and ordering were not controlled. See [environment.json](environment.json) for provenance and archive hashes.

## Original results

All ten compiled on the first attempt. Six browser runs passed; four failed. These counts describe the original platform and fixed checks, not model quality or complete acceptance.

| Case | Strategy | Generation seconds | Reported tokens | Browser checks |
| --- | --- | ---: | ---: | --- |
| Counter | Manager/Coder | 95.4 | 8,494 | 4/4 passed |
| Counter | Coder only | 51.1 | 4,534 | 4/4 passed |
| Task list | Manager/Coder | 121.5 | 10,834 | 7/7 passed |
| Task list | Coder only | 104.3 | 9,313 | 7/7 passed |
| Calculator | Manager/Coder | 90.7 | 8,110 | 5/5 passed |
| Calculator | Coder only | 61.3 | 4,963 | 1/5 failed |
| Converter | Manager/Coder | 123.3 | 10,839 | 5/5 passed |
| Converter | Coder only | 85.7 | 7,304 | 1/5 failed |
| Quiz | Manager/Coder | 142.1 | 12,313 | 7/8 failed |
| Quiz | Coder only | 139.7 | 11,456 | 7/8 failed |

Each case/strategy directory includes the original source ZIP, saved fixed plan, browser JSON and initial/final PNGs. ZIPs contain `source/` and a standalone `preview/index.html`. Failed packages remain failed evidence, not approved demos. Raw rows, including HTML/CSS/JS line counts, are in [comparison.json](comparison.json). The Manager/Coder calculator has 209 source lines against a requested limit below 200, despite its interaction checks passing.

## Platform defect and separate rebuilds

The Coder-only calculator and converter use head scripts with `defer`. The old builder removed `src`, making them classic inline scripts that executed before their controls existed. Browser reports captured null-element exceptions and unchanged output. This is a packaging defect; it cannot support a conclusion that Manager/Coder writes better applications. Script timing follows the [HTML specification](https://html.spec.whatwg.org/dev/scripting.html).

The builder fix packages compiled local scripts as data URLs, retaining their execution attributes and module type. CSP allows those local script resources; networking and form submission remain blocked. A browser regression verifies deferred/module order, DOM availability and `DOMContentLoaded` callbacks.

The two `*-rebuilt` directories contain separate packages and browser evidence after this fix. Both pass 5/5 using byte-identical original source files and unchanged fixed assertions. No model calls were made. Original project JSON, ZIPs and failed reports remained byte-identical. [rebuilds.json](rebuilds.json) records the builder hash and archive identities; these results do not replace the baseline counts.

## Remaining measurement gaps

Both quiz failures occur when the plan tries clicking an answer that the application correctly disabled after answering. The other seven checks pass. Keep these failures and add a declarative disabled-state assertion in a later plan revision; do not silently force-click or count them as successes.

No manual approval, complete accessibility/visual review, repeated samples, actual monetary cost, or real model repair success rate is established. Returned token totals are usage evidence, not a billing statement. This run identifies practical platform and evaluation defects; it does not establish statistical superiority.

Workbench screenshots: [counter](../../../../../portfolio-screenshots/studio-real-counter-browser-2026-10-09.png), [task list](../../../../../portfolio-screenshots/studio-real-todo-browser-2026-10-09.png), [calculator failure](../../../../../portfolio-screenshots/studio-real-calculator-failed-2026-10-09.png).
