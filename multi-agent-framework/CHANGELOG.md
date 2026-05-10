# Changelog

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
