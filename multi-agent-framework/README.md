# PixelAgent Hub

[![CI](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml/badge.svg)](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![node](https://img.shields.io/node/v/multi-agent-framework)](https://nodejs.org/)

可观测、可恢复、可控成本的 TypeScript 多 Agent 编排框架。  
面向内容与代码工作流，内置 **6 种协作模式**，支持 **6 大 LLM 提供商**。

## 30 秒上手

```bash
npm install && npm run build && node dist/examples/company-mode.js
```

运行完成后，结果和过程都会落盘到 `records/company-mode/<session-id>/`：
- `session.json`：完整执行轨迹与多 Agent 结果
- `output.md`：最终交付正文
- `notes.txt`：关键流程事件

## 6 种协作模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Pipeline** | 顺序流水线 | 内容创作、代码评审 |
| **Parallel** | 多 Agent 并行 | 多视角分析 |
| **Debate** | 结构化多轮辩论 | 决策探讨 |
| **Vote** | 加权投票 | 共识达成 |
| **Roundtable** | 主持人引导的圆桌讨论 | 深度分析 |
| **Company** | 一人公司层级流程 | 完整生产工作流 |

## 多 LLM 提供商支持

| 提供商 | 环境变量 | 默认模型 |
|--------|----------|----------|
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| **Kimi** | `KIMI_API_KEY` | `kimi-k2p5` |
| **Ollama** | _(本地无需 key)_ | `qwen3:14b` |
| **自定义** | `LLM_BASE_URL` + `LLM_API_KEY` | 任意 |

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
```

所有提供商使用原生 `fetch`，**零额外依赖**。

## 为什么不是"又一个 Agent Demo"

- **可观测性优先**：请求级日志、模式轨迹、会话落盘、健康探针
- **稳定性优先**：超时、并发限制、幂等冲突保护、限流
- **成本可见**：每次运行返回 LLM 调用次数、token 用量、估算 USD 成本
- **开发者体验**：示例可运行、后端 API 可直接接前端、结构清晰
- **多模型支持**：OpenAI / Anthropic / DeepSeek / Kimi / Ollama 自由切换
- **真实工具集成**：Brave/Tavily 搜索、Slack/Discord 消息、飞书 API

## 对比定位

- 相比 **LangGraph/AutoGen/CrewAI**：更轻量（3 个依赖 vs 20+），开箱即跑，TypeScript 原生
- 相比只做 Demo 的多 Agent 仓库：具备后端运行时治理能力（鉴权、限流、观测）
- 相比纯 mock 框架：所有 Agent 支持真实 LLM，回退到 mock 仅在离线环境

## 快速启动 API

```bash
npm run records:api
```

默认地址：`http://localhost:3100`

**健康检查**：`GET /health` · `GET /health/liveness` · `GET /health/readiness`

**运行模式**：
- `POST /api/run/pipeline`
- `POST /api/run/parallel`
- `POST /api/run/debate`
- `POST /api/run/vote`
- `POST /api/run/roundtable`
- `POST /api/run/company`

支持 `?async=1` 异步任务和 `?stream=1` SSE 流式响应。

**响应中的 `artifacts.observability`**：
- 模型调用次数
- prompt/completion/total token
- 按模型分组统计
- 估算成本（USD）

## 环境变量

```bash
cp .env.example .env
```

核心变量：
- `LLM_PROVIDER`：LLM 提供商（openai/anthropic/deepseek/kimi/ollama）
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `KIMI_API_KEY` 等
- `RECORDS_API_PORT`：API 端口，默认 `3100`
- `RECORDS_API_KEY`：鉴权密钥（生产必填，≥16 字符）
- `ALLOW_UNAUTH_IN_DEV`：开发环境是否放开鉴权
- `ALLOWED_ORIGINS`：CORS 允许的前端来源
- `RUN_TIMEOUT_MS` / `MAX_RUN_CONCURRENCY` / `RUN_RATE_LIMIT_PER_MINUTE`
- `SEARCH_PROVIDER`：搜索引擎（brave/tavily）
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：飞书集成

完整列表见 [`.env.example`](./.env.example)。

## 项目结构

```text
multi-agent-framework/
├── src/
│   ├── core/           # Orchestrator / Router / Bus / LLM 抽象层
│   ├── agents/         # 8 个预置 Agent
│   ├── web/            # 记录 API（鉴权、限流、健康检查）
│   ├── intelligence/   # 情报流水线（采集→分析→决策→执行→监控）
│   └── factory.ts      # Agent 组装工厂
├── examples/           # 可直接运行的演示脚本
├── config/             # 工作流配置与 eval 数据
└── records/            # 执行记录输出
```

## 本地开发

```bash
npx tsx examples/company-mode.ts   # 运行示例
npm run build                       # 构建
npm test                            # 测试
```

## 路线图

- [x] 后端基础治理：鉴权、限流、并发/超时、健康探针
- [x] 统一错误码与结构化日志
- [x] 多 LLM 提供商抽象层（OpenAI/Anthropic/DeepSeek/Kimi/Ollama）
- [x] 真实工具集成（搜索、消息、飞书）
- [x] 安全加固（CORS、env 泄漏、静默错误修复）
- [ ] 可视化观测面板
- [ ] npm 包发布
- [ ] 场景级基准测试与对比报告

## 参与贡献与安全

- 贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)
- 漏洞报告见 [SECURITY.md](SECURITY.md)
- 行为准则见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## License

MIT，全文见 [LICENSE](LICENSE)。
