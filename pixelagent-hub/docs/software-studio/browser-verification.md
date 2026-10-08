# Independent browser verification

Use Node 20+ (22.12+ recommended for the dashboard). Install the matching browser:

```sh
cd pixelagent-hub
npm ci
npx playwright install chromium
```

Set `ENABLE_STUDIO_BROWSER_CHECKS=true` in the API environment, then restart `npm run records:api`. Optionally set `STUDIO_BROWSER_EXECUTABLE` to an administrator-controlled installed Edge/Chromium executable. Browser launch failures appear in the saved report; there is no synthetic fallback.

In Software Studio, build a project, generate a Tester plan, and select **运行独立浏览器检查**. Each run starts a fresh Chromium context, loads the saved HTML in an opaque iframe, executes real click/fill/key actions and compares exact trimmed text. Checks share page state in plan order. Assertions wait up to two seconds; each action has a two-second limit and a run has a 45-second execution limit (queue time excluded). Viewport: 1280 × 720.

Reports live in `<STUDIO_ROOT>/<projectId>/browser-runs/<runId>.json`, with initial/final PNGs under `<runId>/`. Reports include preview and normalized plan SHA-256 hashes, browser version, check results, runtime/console errors and intercepted network requests. Screenshots can be inspected from the workbench. Cancellation closes the temporary browser; interrupted jobs become failed reports after restart and never rerun automatically.

API (same authentication and creation rate limit as other Studio actions):

- `GET /api/studio/projects/:id/browser-runs`: `{enabled, runs}`.
- `POST` that route with only `{testPlanId}`: returns `{runId, jobId}` (202).
- `POST` with only `{cancelRunId}`: requests cancellation (202).
- `GET /api/studio/projects/:id/browser-runs/:runId/initial.png` or `final.png`: saved PNG, authenticated.

Request bodies cannot supply HTML, URLs, executable paths or scripts. Service workers and downloads are disabled, HTTP/WebSocket requests are blocked, dialogs dismissed and popups closed. The browser renderer sandbox remains enabled. This is a local, owner-operated feature, not an isolation boundary for hostile public tenants; resource limits require a container/OS policy for public deployment.

Passing proves only the saved plan's assertions during this run. It does not prove visual quality, complete coverage or human approval. Build reports, source ZIPs, client diagnostics and manual reviews remain separate.

Run real browser integration checks after installation:

```sh
# PowerShell: $env:RUN_STUDIO_BROWSER_TESTS='1'
# Optional: $env:STUDIO_BROWSER_EXECUTABLE='C:\path\to\msedge.exe'
npm test
```

Ordinary core tests skip tests that launch browsers unless `RUN_STUDIO_BROWSER_TESTS=1`. Dedicated CI installs Chromium and enables those tests.
