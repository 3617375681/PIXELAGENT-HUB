# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` (repo root) holds the coding style, commit, and PR conventions — follow it. This file adds the commands and architecture context.

## Layout

The real project is `pixelagent-hub/`; run npm commands from there. It contains two separate npm packages with separate lockfiles: the framework/API (`pixelagent-hub/`) and the React/Vite dashboard (`pixelagent-hub/dashboard/`). The repo-root `README.md` (English, with `README.zh-CN.md` in Chinese) is the Studio-oriented overview; `pixelagent-hub/README.md` covers the framework. Most docs are in Chinese.

## Commands

```sh
cd pixelagent-hub
npm ci && npm --prefix dashboard ci
npm run build            # tsc -> dist/ (compiles src/ and examples/)
npm run lint             # tsc --noEmit
npm test                 # scripts/test.mjs: finds every src/**/*.test.ts, runs node --import tsx --test
npm run build:all && npm start   # API + built dashboard on one port (127.0.0.1, /studio)
npm run records:api      # API only via tsx, port 3100 (RECORDS_API_PORT)
npm run ui:dev           # Vite dashboard dev server
npm --prefix dashboard run check   # dashboard tsc -b
npm --prefix dashboard run lint
npm --prefix dashboard test        # Vitest
```

Single test file / single test:

```sh
node --import tsx --test src/web/runRuntime.test.ts
node --import tsx --test --test-name-pattern="some name" src/web/runRuntime.test.ts
npm test -- --test-name-pattern="some name"   # extra args are forwarded before the file list
```

Real-browser Studio tests are skipped unless `RUN_STUDIO_BROWSER_TESTS=1` (needs `npx playwright install chromium`); CI runs them serially with `--test-concurrency=1`.

Other scripts: `npm run studio:create -- "<description>"`, `studio:preview -- <projectId>`, `studio:doctor`, `studio:benchmark`, `smoke:package`, `smoke:dashboard`, `portfolio:demo`, and `example:*` (pipeline, code-review, debate, vote, company).

Use `LLM_PROVIDER=mock` (or `OFFLINE=true`) for offline work; `.env.example` defaults to mock. With no provider and no API key, `detectProviderId` returns `null` and agents fail with `NO_LLM_PROVIDER_MESSAGE` — there is deliberately no silent vendor or mock fallback.

## Architecture

**Agent framework (`src/core`, `src/agents`, `src/factory.ts`).** `createOrchestrator()` in `src/factory.ts` wires a `MessageBusImpl`, registers the preset agents (researcher, writer, reviewer, coder, manager, senior editor, director, moderator, optional tester), and declares named pipelines (e.g. `content-creation`, `code-review`) whose steps use `transform` to pass the previous `TaskResult` into the next task's `context.previousRound`. `Orchestrator` exposes the collaboration modes: `runTask`, `runPipeline`, `runParallel`, `runDebate`, `runVote`; roundtable lives in `RoundtableRunner`. Agents extend `BaseAgent`, which subscribes to the bus and responds to `task` messages with `result` messages; cancellation flows through `task._exec.signal` (an `AbortSignal`) and produces `JOB_CANCELLED` results.

**LLM providers (`src/core/llm`).** Each provider implements `LLMProvider` using native `fetch` (no SDKs). `createLLMProviderFor({ id })` resolves per agent: explicit config → `AGENT_<AGENTID>_LLM_PROVIDER` / `AGENT_<AGENTID>_LLM_MODEL` env → global `LLM_PROVIDER` / key auto-detection. Provider construction failures log a warning and return `null` rather than throwing, so a misconfigured key shows up as a `null` provider rather than as an error.

**HTTP server (`src/web`).** `server.ts` is a thin `node:http` entry. `recordsWebStack.ts` is the composition root: it builds config, `RunRuntime`, the Studio API, the session store (`sessionStore.ts`) and the mode runner (`runModes.ts`, all six collaboration modes), then for each request handles CORS/preflight, API-key auth for `/api/*`, and tries the route groups in `routes/` (`studio`, `health`, `runtime`, `runs` with `?async=1` / `?stream=1` SSE, `sessions` incl. files/attachments/memory/export). Each route group returns true when it answered; use `ctx.json` / `ctx.error` so the access log records the status. Shared response helpers live in `http/respond.ts`. It takes `env` as a parameter so tests can build isolated stacks. `runRuntime.ts` + `RunQueue` enforce concurrency, timeouts, queueing, and retries; `config.ts` parses env (auth via `RECORDS_API_KEY`, required ≥16 chars in production; `ALLOW_UNAUTH_IN_DEV`; CORS via `ALLOWED_ORIGINS`). With `--dashboard`, `dashboardServer.ts` serves `dashboard/dist/public` ahead of the API. Run sessions are written to disk under `records/`.

**Software Studio (`src/studio`, `src/web/studioApi.ts`).** `runSoftwareStudio()` drives Manager (plan) → Coder (up to 3 rounds), builds with esbuild in an isolated per-project workspace, and feeds real compile errors back as revision notes. State is persisted as JSON records (`atomicJson.ts`) under `records/studio/<projectId>` (override with `STUDIO_ROOT_OVERRIDE`). Supporting modules: `versions` / `sourceChanges` (history, diffs, candidate switching), `testPlans` + `browserRuns` (Tester's declarative checks executed in a sandboxed Playwright browser, enabled by `ENABLE_STUDIO_BROWSER_CHECKS=true`), `doctor` / `diagnostics`, `benchmark`, `generationMetrics`. Build success, browser-check success, and human approval are tracked as separate states — don't conflate them. Every state change also appends to `events.jsonl` via `src/studio/events.ts` (per-project ordered `seq`, only one terminal event); `GET .../events` serves it as JSON or SSE (`?stream=1`). When adding a Studio transition, emit an event next to the record save. `MockProvider` returns a real buildable Studio app whose first attempt intentionally fails to compile. The HTTP contract is `openapi/studio-api.yaml`, verified by `studioContract.test.ts`; update both together. Design decisions are in `docs/adr/`.

**Search (`src/tools/search.ts`).** Web search providers used by `ResearchAgent`. The former intelligence pipeline, chat, video and miniprogram code was removed; it survives only in the `v1.1-full` git tag.

**Dashboard (`dashboard/src`).** React + Vite; `lib/recordsApi.ts` is the API client, `pages/Studio.tsx` is the only page (`/` redirects to `/studio`). `components/StudioPipeline.tsx` renders the pixel team graph purely from server events: `hooks/useStudioEvents.ts` (JSON then SSE via fetch, polling fallback) → `lib/studioPipeline.ts` (pure reducer, unit-tested) → stage cards, connectors and the red feedback edge. Every animation must correspond to a real event; don't add simulated progress. The UI is English-only in pixel fonts (Press Start 2P for headings/labels, VT323 for body). Stage cards reuse the original effects (`effects/ParticleEffect`, `StatusBurst`, `TypewriterText`) and `lib/soundEngine.ts` 8-bit cues, all triggered by event transitions; the page is one column: pitch + prompt, squad, PLAY/CODE result, and a collapsed MORE TOOLS section for versions, checks, review and logs. The visual language comes from the original Kimi prototype (git `14a030e`). The collaboration modes have no UI; use the API or `examples/`. `VITE_REPLAY=1` builds a static read-only replay (`lib/replay.ts` maps GET routes to files under `<base>replay/`, plays recorded event gaps, refuses writes, uses `HashRouter`); `npm run replay:export [-- --browser]` records that data (the mock demo, the 2026-10-09 repair evidence, all 30 runs of the 2026-10-15 comparison in `components/ReplayGallery.tsx`, and the 2026-10-18 showcase in `components/ReplayShowcase.tsx`), and `.github/workflows/pages.yml` builds it (set `VITE_BASE` for a subpath). In Git Bash on Windows set `MSYS_NO_PATHCONV=1` or `VITE_BASE=/repo/` is rewritten to a Windows path. It connects to an authenticated API at runtime (no rebuild needed to change the key). In the replay build, BUILD LIVE runs the Studio loop in the browser (`lib/live/`: streaming DeepSeek client, esbuild-wasm builder, sandboxed in-page checks, IndexedDB store) behind the same `recordsApi` calls; live project IDs start with `live-`. Prompts, schemas, file validation and the HTML inliner live in `src/studio/shared` (no Node APIs) and are imported by both the agents/builder and the dashboard via the `@studio-shared` alias, so change them there, not in the agents.

## Testing notes

- Tests run on Windows locally and Linux in CI (Node 18/20/22); test code must handle CRLF and path separators (see `scripts/test.mjs`).
- CI also runs a Docker Compose production-startup check (`scripts/smoke-docker.mjs`) using the repo-root `docker-compose.yml`.
