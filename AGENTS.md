# Repository Guidelines

## Project Structure & Module Organization

The application lives in `pixelagent-hub/`; run npm commands there unless specified otherwise.

- `src/core/`: orchestration, message bus, queues, and LLM providers.
- `src/agents/`: specialized agent implementations; `src/intelligence/`: tools and knowledge workflows.
- `src/web/`: Records API, runtime management, and HTTP clients.
- `dashboard/src/`: React interface, components, hooks, pages, and styles.
- `miniprogram/`: WeChat client; `examples/`: runnable workflows.
- `config/`, `openapi/`, and `docs/`: workflow configuration, API contract, and operational documentation.
- Tests live beside source files or in `__tests__/`. Demo assets are in `demo-assets/`; repository-level screenshots are in `portfolio-screenshots/`.

## Build, Test, and Development Commands

Install dependencies separately for the framework and dashboard:

```sh
cd pixelagent-hub
npm ci
npm --prefix dashboard ci
```

- `npm run build`: compile framework TypeScript into `dist/`.
- `npm test`: run core tests through `tsx` and Node's test runner.
- `npm run lint`: type-check the framework without emitting files.
- `npm run dev`: run the content-pipeline example.
- `npm run records:api`: start the API, normally on port 3100.
- `npm run ui:dev` / `npm run ui:build`: serve/build the Vite dashboard.
- `npm --prefix dashboard run check` / `run lint`: dashboard TypeScript/ESLint checks.

CI builds and tests the framework on Node 18, 20, and 22. See `CONTRIBUTING.md` for setup guidance.

## Coding Style & Naming Conventions

Use strict TypeScript and two-space indentation. Match each file's existing quotes and semicolon style. Use PascalCase for classes and React components, camelCase for functions and variables, and `useX` for hooks. Framework relative imports use `.js` extensions. The dashboard provides ESLint and Prettier (`npm --prefix dashboard run format`); avoid unrelated formatting changes.

## Testing Guidelines

Name tests `*.test.ts`; core tests use `node:test` and `node:assert/strict`. Add regression tests for bugs and cover changed behavior, including failure paths. Run `npm run build` and `npm test` before submitting. Dashboard tests use Vitest (`npm --prefix dashboard test`). No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow history's conventions: `feat:`, `fix:`, `docs:`, or `chore:`, optionally scoped, such as `feat(dashboard): ...`. Keep changes focused. PRs should explain motivation, behavior changes, validation, and API compatibility risks; link relevant issues and include screenshots for visual changes.

## Security & Configuration

Copy `.env.example` to `.env` inside `pixelagent-hub/`. Keep credentials out of commits and logs. Use `LLM_PROVIDER=mock` for offline development. Report exploitable vulnerabilities privately following `SECURITY.md`.
