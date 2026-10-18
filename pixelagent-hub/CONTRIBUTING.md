# Contributing

Thanks for improving **PixelAgent Hub**. This is the short path from clone to merge. 中文贡献者同样欢迎：Issue 和 PR 用中文或英文都可以。

## Set up (no API key needed)

Use Node **22.12+**. CI also checks the core on Node 18 and 20.

```bash
cd pixelagent-hub
cp .env.example .env            # LLM_PROVIDER=mock: a real, buildable app whose first attempt fails to compile
npm ci && npm --prefix dashboard ci
npm run build:all && npm start  # http://127.0.0.1:3100/studio
```

For development, run `npm run records:api` and `npm run ui:dev` in two terminals and open `http://localhost:3000/studio`. If the API isn't on port 3100, set `VITE_DEV_PROXY_TARGET`. When something is off with your setup, start with `npm run studio:doctor` (add `-- --browser` to also check Chromium).

## Where things live

| You want to change… | Look in |
| --- | --- |
| What the agents are asked, how replies are validated, how apps are bundled | `src/studio/shared/` (prompts, schemas, parse, inline, repair). Shared by the server **and** PLAY LIVE, so change it here, not in the agents. |
| The server's Studio loop, versions, browser checks | `src/studio/` (`softwareStudio.ts`, `browserRuns.ts`, `events.ts`) and `src/web/studioApi.ts` |
| HTTP routes | `src/web/routes/`, composed in `src/web/recordsWebStack.ts`; the contract is `openapi/studio-api.yaml` (update both) |
| The pixel squad, sounds, effects | `dashboard/src/components/StudioPipeline.tsx`, `StudioStageCard.tsx`, `lib/studioPipeline.ts` (pure reducer), `lib/soundEngine.ts` |
| PLAY LIVE (in-browser runs) | `dashboard/src/lib/live/`: `llm.ts` and `anthropic.ts` (providers), `build.ts` (esbuild-wasm), `checks.ts` (sandboxed checks), `studio.ts` (runner and API), `share.ts` (share links) |
| The static replay and its galleries | `scripts/export-replay.ts`, `dashboard/src/lib/replay.ts`, `ReplayGallery.tsx`, `ReplayShowcase.tsx` |
| Multi-agent framework modes (pipeline, debate, vote…) | `src/core/`, `src/agents/`, `src/factory.ts`, `examples/` |

Two rules keep the project honest:

- **Every animation must correspond to a real event.** Don't add simulated progress.
- **Build passed, checks passed and human approval are separate states.** Don't merge them.

## Check before you push

```bash
npm run lint && npm test                                   # backend
npm --prefix dashboard run check && npm --prefix dashboard run lint && npm --prefix dashboard test
```

If you touched the replay or PLAY LIVE, also build and smoke-test the static site. It drives a mock-backed live run, sharing and replay in Chromium:

```bash
npm run replay:export -- --browser
VITE_REPLAY=1 VITE_BASE=/PIXELAGENT-HUB/ npm --prefix dashboard run build
npm run smoke:live -- dashboard/dist/public /PIXELAGENT-HUB/
```

- Playwright's Chromium is needed: `npx playwright install chromium`.
- Real-browser server tests run with `RUN_STUDIO_BROWSER_TESTS=1`.
- In Git Bash on Windows, prefix commands that pass `/PIXELAGENT-HUB/` with `MSYS_NO_PATHCONV=1`.

## Pull requests

1. Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
2. Keep each PR focused, with no unrelated reformatting.
3. In the description, say what changed and why, and how you checked it. For API changes, note compatibility.
4. For big or breaking changes, open an issue first.

The [PR template](../.github/pull_request_template.md) has the checklist. Good starting points are labelled [`good first issue`](https://github.com/Jiarong-Song233/PIXELAGENT-HUB/labels/good%20first%20issue).

## Experiments and evidence

Benchmark and showcase results live in `docs/software-studio/benchmark-results/` (index: `docs/evidence/README.md`). If you add a run:

- **commit its raw records** so others can check it;
- **report every outcome**, failures included;
- **state the commit**, and whether the tree was clean.

Changing prompts or check semantics makes new runs not directly comparable with old ones; say so in the write-up.

## Code style

Match the file you're editing: its naming, error handling and comment density. Use conventional commits (`feat(dashboard): …`, `fix(studio): …`).

Security issues go to the private channel in [SECURITY.md](SECURITY.md), not a public issue.
