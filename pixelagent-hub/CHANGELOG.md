# Changelog

## [Unreleased]

### Added
- Replay gallery: the static demo now includes all 30 real-model runs of the 2026-10-15 strategy comparison (staged with their recorded events and hash-checked browser reports), one clickable cell per run, failures included
- README demo GIF recorded from the replay, an English README (`README.en.md`) and a single evidence index (`docs/evidence/README.md`)
- Repeated real-model strategy comparison (2026-10-15, 30 generations) with full evidence; `studio:benchmark:browser` runs fixed plans through the production browser endpoint and `studio:benchmark:series` combines repeated runs
- Event-driven pixel team graph in Studio (Manager → Coder → Builder → Tester) with a red feedback edge carrying real compiler or browser-check failures
- Static read-only replay build (`VITE_REPLAY=1`) recorded by `npm run replay:export`, plus a GitHub Pages workflow that builds it on every PR
- Studio event timeline: each project appends ordered events (phases, coding rounds, real build results with compiler errors, terminal state, test plans, browser checks) to `events.jsonl`
- `GET /api/studio/projects/:id/events` returns the timeline as JSON or, with `?stream=1`, as Server-Sent Events with `after`/`Last-Event-ID` resume; older projects get a derived timeline
- The mock provider now produces a buildable Studio app (first attempt deliberately fails to compile, exercising the repair loop) and fixed browser checks; optional `MOCK_LLM_DELAY_MS` slows it for live demos

### Fixed
- `replay:export --browser` now fails when the mock browser run does not pass (for example, a missing Chromium) instead of publishing it as a failed check
- `/api/run/:mode?async=1&stream=1` now returns a clean 400 instead of failing after SSE headers were written; run SSE responses use the configured CORS origin instead of `*`
- Studio JSON responses now carry the configured CORS origin like other API routes

### Removed
- Intelligence pipeline (collector/analyst/decision/executor/monitor agents, workflow YAML, approvals, self-improve) and its `/api/intelligence/*` routes
- `/api/knowledge/*`, `/api/chat` and Seedance video routes; Slack/Discord and Feishu providers
- WeChat miniprogram client
- Dashboard pages other than Studio (home graph, live, ops console, archives, session detail), unused shadcn components and template dependencies (tRPC, Drizzle, Hono, MySQL)
- The full feature set is preserved at git tag `v1.1-full`

### Changed
- Studio redesigned as one English-only pixel page: pitch and prompt, the four-agent squad, PLAY/CODE result, and a collapsed MORE TOOLS section; stage cards regain the original particles, status bursts, typewriter labels and 8-bit sounds (toggle in the header), driven by real events
- `recordsWebStack.ts` split from a ~1000-line request handler into route groups (`src/web/routes/`), a session store, a mode runner and shared HTTP helpers; API behavior is unchanged apart from the fixes above
- Web search providers moved to `src/tools/search.ts`
- With no provider and no API key, LLM selection now reports "No LLM provider configured" instead of silently selecting Kimi; `.env.example` defaults to `LLM_PROVIDER=mock` and disables the Ollama embedding retriever

## [1.1.0] — 2025-05-10

### Added
- Multi-provider LLM abstraction layer (OpenAI, Anthropic, DeepSeek, Kimi, Ollama)
- Real LLM integration for all 8 content agents and 5 intelligence agents
- Search providers: Brave Search API and Tavily API integration
- Message providers: Slack and Discord webhook integration
- Feishu/Lark API provider for task, calendar, and bitable operations
- Configurable CORS origins (replaced wildcard `*`)
- Error counter and optional `onError` handler on MessageBus
- All env vars documented in `.env.example`

### Fixed
- CORS security: replaced `Access-Control-Allow-Origin: *` with configurable origins
- Environment leakage: `localToolProvider` spawn no longer passes full `process.env` to child processes
- Silent error swallowing in 6 locations now properly logs errors
- API key no longer stored in plain text longer than needed

## [1.0.0] — Initial Release
- 6 collaboration modes: Pipeline, Parallel, Debate, Vote, Roundtable, Company
- 8 preset agents: Researcher, Writer, Reviewer, Coder, Manager, Senior Editor, Director, Moderator
- Intelligence pipeline: Collector → Analyst → Decision → Executor → Monitor
- HTTP API server with SSE streaming, async jobs, and session management
- Ollama-based local embedding retriever
- Seedance AIGC video generation integration
