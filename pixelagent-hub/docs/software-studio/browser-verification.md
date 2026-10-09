# Independent browser verification

Use Node 20+ (22.12+ recommended for the dashboard). Install the matching browser:

```sh
cd pixelagent-hub
npm ci
npx playwright install chromium
```

Set `ENABLE_STUDIO_BROWSER_CHECKS=true` in the API environment, then restart `npm run records:api`. Optionally set `STUDIO_BROWSER_EXECUTABLE` to an administrator-controlled installed Edge/Chromium executable. Browser launch failures appear in the saved report; there is no synthetic fallback.

Linux must permit the installed browser's sandbox to create user namespaces. The dedicated browser CI uses Ubuntu 22.04; Ubuntu 24.04's default AppArmor policy may reject downloaded Chromium binaries. Configure an application-specific browser policy with your administrator, following [Chromium's guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). The executor keeps `chromiumSandbox: true` and does not automatically disable sandboxing or change host security settings.

In Software Studio, build a project, generate a Tester plan, and select **运行独立浏览器检查**. Each run starts a fresh Chromium context, loads the saved HTML in an opaque iframe, executes real click/fill/key actions and compares exact trimmed text or native disabled state. Checks share page state in plan order. Assertions wait up to two seconds; each action has a two-second limit and a run has a 45-second execution limit (queue time excluded). Viewport: 1280 × 720.

Reports live in `<STUDIO_ROOT>/<projectId>/browser-runs/<runId>.json`, with initial/final PNGs under `<runId>/`. Reports include preview and normalized plan SHA-256 hashes, browser version, check results, runtime/console errors and intercepted network requests. Screenshots can be inspected from the workbench. Cancellation closes the temporary browser; interrupted jobs become failed reports after restart and never rerun automatically.

API (same authentication and creation rate limit as other Studio actions):

- `GET /api/studio/projects/:id/browser-runs`: `{enabled, runs}`.
- `POST` that route with only `{testPlanId}`: returns `{runId, jobId}` (202).
- `POST` with only `{cancelRunId}`: requests cancellation (202).
- `GET /api/studio/projects/:id/browser-runs/:runId/initial.png` or `final.png`: saved PNG, authenticated.

Request bodies cannot supply HTML, URLs, executable paths or scripts. Service workers and downloads are disabled, HTTP/WebSocket requests are blocked, dialogs dismissed and popups closed. The browser renderer sandbox remains enabled. This is a local, owner-operated feature, not an isolation boundary for hostile public tenants; resource limits require a container/OS policy for public deployment.

Passing proves only the saved plan's assertions during this run. It does not prove visual quality, complete coverage or human approval. Build reports, source ZIPs, client diagnostics and manual reviews remain separate.

## Native disabled-state assertions

Checks may optionally set `assertion: "disabled"` with `expected: "true"` or `"false"` to observe native HTML `:disabled` state. Omitted or `"text"` assertions retain exact trimmed text comparisons and legacy plan hashes. For example, after answering a quiz, check `{ "name": "Answer locked", "actions": [], "selector": "#answer-a", "assertion": "disabled", "expected": "true" }` rather than clicking the disabled button. This checks native state, including disabled fieldsets; it does not check ARIA attributes or prove visibility/clickability. Browser checks and the client sandbox share this predicate.

## Repair from browser failures

The controlled failure → separate repair → real browser retest walkthrough and its limitations are recorded in [repair evidence](browser-repair-evidence.md).

Expand a failed run and select **依据浏览器失败返修（调用模型）**. The server requires a completed run with a final screenshot, matching preview/plan hashes and application errors or failed assertions. A launch error, timeout, cancellation or stale report cannot trigger code generation; recover the browser environment or run a fresh check first. `GET browser-runs` returns the server-derived `repairable` flag.

`POST /api/studio/projects/:id/repair` accepts only `{browserRunId}` or the existing `{diagnosticId}`. Browser repair reads saved evidence and original source on the server; request bodies cannot supply errors or replacement source. The child project's `repair` stores the parent, browser run and plan IDs. Manager/Coder receive bounded observed/expected text, actions and runtime errors as untrusted data. Existing source, report, screenshots and ZIP remain intact.

The repaired version still requires a new Tester plan and independent browser run. Compare its source and recheck the failed behavior and unaffected requirements; build success alone does not establish a fix. Candidate selection and human approval remain manual and do not inherit from the parent. Infrastructure failures never fall back to paid code repair.

Run real browser integration checks after installation:

```sh
# PowerShell: $env:RUN_STUDIO_BROWSER_TESTS='1'
# Optional: $env:STUDIO_BROWSER_EXECUTABLE='C:\path\to\msedge.exe'
node --import tsx --test --test-concurrency=1 src/studio/browserRuns.test.ts src/studio/benchmark.test.ts src/web/studioApi.test.ts
```

Ordinary core tests skip tests that launch browsers unless `RUN_STUDIO_BROWSER_TESTS=1`. Dedicated CI installs Chromium and enables those tests.
