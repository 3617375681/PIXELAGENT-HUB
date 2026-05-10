# PixelAgent Hub

[![CI](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml/badge.svg)](https://github.com/3617375681/PIXELAGENT-HUB/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](pixelagent-hub/LICENSE)
[![node](https://img.shields.io/node/v/pixelagent-hub)](https://nodejs.org/)

轻量、可观测的 **TypeScript 多 Agent 编排框架**。面向内容与代码工作流，内置 **6 种协作模式**，支持 **6 大 LLM 提供商**，附带**可视化监控面板**。

## 为什么不是"又一个 Agent Demo"

- **可观测性优先**：请求级日志、模式轨迹、会话落盘、健康探针
- **稳定性优先**：超时、并发限制、幂等冲突保护、限流
- **成本可见**：每次运行返回 LLM 调用次数、token 用量、估算 USD 成本
- **零额外依赖**：仅 3 个 npm 依赖，所有 LLM 调用使用原生 `fetch`
- **真实工具集成**：Brave/Tavily 搜索、Slack/Discord 消息、飞书 API
- **自带可视化**：React 前端面板，实时查看 Agent 状态、消息、思维链

## 30 秒上手

```bash
cd pixelagent-hub
cp .env.example .env
npm install && npm run build && npm test
```

无需 API Key 即可运行（自动使用 mock 模式）：
```bash
npx tsx examples/company-mode.ts
```

启动 API 服务 + 可视化面板：
```bash
npm run records:api       # 后端 API → http://localhost:3100
npm run ui:dev            # 前端面板 → http://localhost:5173
```

## 6 种协作模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Pipeline** | 顺序流水线 | 内容创作、代码评审 |
| **Parallel** | 多 Agent 并行 | 多视角分析 |
| **Debate** | 结构化多轮辩论 | 决策探讨 |
| **Vote** | 加权投票 | 共识达成 |
| **Roundtable** | 主持人引导圆桌讨论 | 深度分析+证据检索 |
| **Company** | 一人公司层级流程 | 完整生产工作流 |

## 多 LLM 提供商

| 提供商 | 环境变量 | 默认模型 |
|--------|----------|----------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Kimi | `KIMI_API_KEY` | `kimi-k2p5` |
| Ollama | _(本地无需 key)_ | `qwen3:14b` |
| 自定义 | `LLM_BASE_URL` + `LLM_API_KEY` | 任意 |

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
```

## 可视化监控面板

`_template_frontend/` 提供完整的 React 可视化控制台：

- **Agent 拓扑图**：d3-force 力导向布局，可拖拽、缩放、折叠
- **实时状态**：idle → thinking → done/error 状态流转
- **思维链抽屉**：点击 Agent 卡片查看逐步推理过程
- **消息面板**：Agent 间对话实时展示
- **像素风 UI**：CRT 扫描线、8-bit 音效、4 套配色主题
- **快捷键**：R=运行 E=导出 C=聊天 M=静音 +/-缩放

```bash
cd _template_frontend/app
npm install
npm run dev
```

## 项目结构

```text
pixelagent-hub/
├── src/
│   ├── core/              # Orchestrator / MessageBus / TaskRouter / RunQueue / LLM 抽象层
│   ├── agents/            # 8 个预置 Agent（调研、写作、审阅、编码等）
│   ├── web/               # REST API（鉴权、限流、健康检查、运行时管理）
│   ├── intelligence/      # 情报流水线（采集→分析→决策→执行→监控）
│   └── factory.ts         # 一键组装 Orchestrator
├── _template_frontend/    # React 可视化监控面板
├── examples/              # 可直接运行的演示脚本
├── config/                # 工作流配置与 eval 数据
└── records/               # 执行记录落盘
```

## REST API

```bash
npm run records:api   # 默认 http://localhost:3100
```

健康检查：`GET /health` · `/health/liveness` · `/health/readiness`

运行模式：
- `POST /api/run/pipeline` · `/parallel` · `/debate` · `/vote` · `/roundtable` · `/company`

支持 `?async=1` 异步任务和 `?stream=1` SSE 流式响应。

响应中 `artifacts.observability` 包含模型调用次数、token 用量、按模型分组统计、估算 USD 成本。

## 对比定位

- 相比 **LangGraph / AutoGen / CrewAI**：更轻量（3 个依赖 vs 20+），TypeScript 原生，开箱即跑
- 相比只做 Demo 的多 Agent 仓库：具备后端运行时治理能力（鉴权、限流、观测）
- 相比纯 mock 框架：所有 Agent 支持真实 LLM，离线环境自动回退 mock

## 路线图

- [x] 多 LLM 提供商抽象层（OpenAI / Anthropic / DeepSeek / Kimi / Ollama）
- [x] 6 种协作模式 + 消息总线路由
- [x] 后端治理：鉴权、限流、并发/超时、健康探针
- [x] 真实工具集成（搜索、消息、飞书）
- [x] 嵌入向量知识库检索（Ollama 向量 + 余弦相似度 + 自优化评分器）
- [x] 结构化日志、可观测性、成本追踪
- [x] React 可视化监控面板（Agent 拓扑图、思维链、实时消息）
- [x] RunQueue 并发控制
- [ ] npm 包发布
- [ ] 场景级基准测试与对比报告

## 参与贡献

- 贡献指南见 [CONTRIBUTING.md](pixelagent-hub/CONTRIBUTING.md)
- 漏洞报告见 [SECURITY.md](pixelagent-hub/SECURITY.md)
- 行为准则见 [CODE_OF_CONDUCT.md](pixelagent-hub/CODE_OF_CONDUCT.md)

## License

MIT — 详见 [LICENSE](pixelagent-hub/LICENSE)。
