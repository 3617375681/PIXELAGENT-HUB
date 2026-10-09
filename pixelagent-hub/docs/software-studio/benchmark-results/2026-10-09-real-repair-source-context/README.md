# Source-aware repair follow-up — 2026-10-09

This repeats the [controlled counter fault experiment](../2026-10-09-real-repair/README.md) once on clean tracked source commit `bb3b748c90fc8a9bdfb9db052c9e8d9154198733`. The injected defect is again `count += 2;` instead of `count += 1;` in a new isolated copy of the same original real-model application. It is not a natural model failure or a new generation benchmark.

## Change under evaluation

Manager now receives the same original files and repair instructions as Coder. Both are instructed to inspect the source, make the smallest necessary change, preserve IDs, labels and appearance, and copy unaffected files byte-for-byte. These are model instructions, not a deterministic enforcement rule; callers still inspect differences and run checks.

The original requirement, model, fixed four-check plan, seven additional checks, installed Edge browser and production Studio repair endpoint are the same as the earlier experiment. Project/run IDs are new and both experiments remain independent. The additional plan is withheld from model context; no Tester model call, manual code correction, automatic retry or manual approval is used.

## Observed result

| Stage | Build | Independent browser checks |
| --- | --- | --- |
| Unchanged copy | Passed | 4/4 |
| Injected fault | Passed | 2/4; failed |
| Real-model repair | Passed on first attempt | 4/4; additional 7/7 |

Repair used `deepseek/deepseek-v4-pro`, took **64.947 seconds** and reported **10,194 tokens** across two returned role tasks, with no missing usage and one build. Monetary cost is unknown; browser execution and original generation are excluded. Returned role tasks do not establish the exact provider HTTP request count.

Only `script.js` changed: the model reverted the injected numeric literal. `index.html`, `styles.css` and `README.md` remained byte-identical. The complete repaired source contents match the pre-injection application. Different operation orders, repeated increments, negative values, reset, native Enter and Space activation all passed. The new project retains the failed parent's `browserRunId`, `testPlanId` and project ID. Original project files and all files in the fault copy remained unchanged.

The previous sample modified three files, including unrelated styling and documentation; this sample modified one line in one file. This is an observed improvement for one application, not statistically established prompt effectiveness, latency savings, universal minimal changes or general repair reliability. It does not assess other app types, async failures, full accessibility, visual quality or deployment.

## Evidence and reproduction

[evaluation.json](evaluation.json) contains provenance, IDs, content hashes, metrics and source comparison. [archive-hashes.json](archive-hashes.json) describes the archive hash encoding. Stage directories contain project snapshots and source ZIPs; each browser-run directory contains the saved plan, report and initial/final PNGs. Preview and plan hashes were checked against exported artifacts. ZIPs are experiment artifacts for review, not approved releases.

To reproduce, check out the recorded source commit, install both dependency sets and sandboxed Chromium, configure a real provider, copy the original counter sources from the earlier benchmark ZIP into a separate project, change the specified literal, and save the frozen counter plan. Run it through `POST /api/studio/projects/<id>/browser-runs`, wait for the saved complete failure, then post only `{ "browserRunId": "<failed-run-id>" }` to `/repair`. This step incurs model usage. Wait for its separate version, save the same frozen plan and the additional exported plan for that version, and run both independently. Compare sources and retain all failed reports. New timings, token counts and UUIDs will differ. The experiment used an ephemeral loopback server around the production handler; it did not test API authentication.

Experiment preparation used `buildStaticProject`, `createSourceArchive`, `saveStudioRecord` and `saveTestPlan` to construct the controlled copies; they are not extra public HTTP endpoints. The copies' task records explicitly identify controlled source preparation and contain no simulated model usage. Real repair snapshots contain the actual returned Manager/Coder results. The source-aware change passed 140 ordinary core tests and the [six-job CI run](https://github.com/3617375681/PIXELAGENT-HUB/actions/runs/37922240172), including the browser suite; API regression checks confirm both roles receive the same source and repair instructions.

![Repaired counter with original styling preserved](repaired/fixed/initial.png)
