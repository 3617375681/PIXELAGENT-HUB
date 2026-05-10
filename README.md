# PixelAgent Hub

[![CI](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml/badge.svg)](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](pixelagent-hub/LICENSE)
[![node](https://img.shields.io/node/v/pixelagent-hub)](https://nodejs.org/)

A lightweight, observable **multi-agent orchestration framework** in TypeScript — built for content & code workflows with **6 collaboration modes** and **6 LLM providers**.

## Why PixelAgent Hub

- **Observability-first**: request-level logging, mode traces, session snapshots, health probes
- **Stability-first**: timeouts, concurrency limits, rate limiting, idempotency guards
- **Cost visibility**: every run returns LLM call count, token usage, estimated USD cost
- **Zero bloat**: 3 npm dependencies, native `fetch` for all LLM calls
- **Real tools**: Brave/Tavily search, Slack/Discord messaging, Feishu API

## Quick Start

```bash
cd pixelagent-hub
cp .env.example .env
npm install
npm run build
npm test
```

Run an example (no API key needed — uses mock mode):
```bash
npx tsx examples/company-mode.ts
```

## Collaboration Modes

| Mode | Pattern | Use Case |
|------|---------|----------|
| Pipeline | Sequential chain | Content creation, code review |
| Parallel | Concurrent agents | Multi-perspective analysis |
| Debate | Multi-round structured | Decision exploration |
| Vote | Weighted voting | Consensus building |
| Roundtable | Moderated discussion | Deep analysis with evidence |
| Company | One-person company | Full production workflow |

## LLM Providers

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Kimi | `KIMI_API_KEY` | `kimi-k2p5` |
| Ollama | _(local, no key)_ | `qwen3:14b` |
| Custom | `LLM_BASE_URL` + `LLM_API_KEY` | Any |

## Architecture

```
pixelagent-hub/
├── src/
│   ├── core/          # Orchestrator, MessageBus, TaskRouter, RunQueue, LLM layer
│   ├── agents/        # 8 preset agents (Research, Write, Review, Code, etc.)
│   ├── web/           # HTTP API with auth, rate limiting, health checks
│   ├── intelligence/  # Intelligence pipeline (collect → analyze → decide → execute → monitor)
│   └── factory.ts     # One-call orchestrator assembly
├── examples/          # Runnable demo scripts
├── config/            # Workflow configs & eval data
└── records/           # Session output snapshots
```

## REST API

```bash
npm run records:api   # starts on http://localhost:3100
```

- `GET /health` · `/health/liveness` · `/health/readiness`
- `POST /api/run/pipeline` · `/parallel` · `/debate` · `/vote` · `/roundtable` · `/company`
- `GET /api/export?sessionId=` · `/api/sessions` · `/api/runtime/jobs/:jobId`
- Supports `?async=1` and `?stream=1` (SSE)

## Comparison

- vs **LangGraph / AutoGen / CrewAI**: lighter (3 deps vs 20+), TypeScript-native, runs out of the box
- vs **Demo-only repos**: production-grade governance (auth, rate limiting, observability)
- vs **Mock-only frameworks**: all agents support real LLM APIs, fall back to mock only when offline

## Roadmap

- [x] Multi-provider LLM abstraction (OpenAI / Anthropic / DeepSeek / Kimi / Ollama)
- [x] 6 collaboration modes with message bus routing
- [x] Backend governance: auth, rate limiting, concurrency/timeout, health probes
- [x] Real tool integrations (search, messaging, Feishu)
- [x] Embedding-based knowledge retrieval (Ollama vectors, cosine similarity)
- [x] Structured logging, observability, and cost tracking
- [ ] Visual observability dashboard
- [ ] npm package publication
- [ ] Scenario benchmarks & comparison reports

## Contributing

See [CONTRIBUTING.md](pixelagent-hub/CONTRIBUTING.md), [SECURITY.md](pixelagent-hub/SECURITY.md), and [CODE_OF_CONDUCT.md](pixelagent-hub/CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](pixelagent-hub/LICENSE).
