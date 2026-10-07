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

无需 API Key 的演示需要显式启用 mock 模式：
```bash
LLM_PROVIDER=mock npx tsx examples/company-mode.ts
```

启动 API 服务 + 可视化面板：
```bash
npm run records:api       # 后端 API → http://localhost:3100
npm run ui:dev            # 前端面板 → http://localhost:5173
```

## 5 分钟 Docker 部署

1. 准备环境文件：`cp pixelagent-hub/.env.example pixelagent-hub/.env`，至少填写 `RECORDS_API_KEY`（生产勿用默认占位符）。
2. 可选：在 `.env` 中设置 `LLM_PROVIDER=mock` 做无外网演示；或配置各厂商 API Key。
3. 在仓库根目录执行：

```bash
docker compose up --build
```

- **前端**：`http://localhost:8080`（nginx 托管静态资源，并将 `/api`、`/health` 反代到后端）
- **后端直连**：`http://localhost:3100`（Records API）
- **会话落盘**：宿主机目录 `pixelagent-hub/records` 挂载到容器内 `/app/records`（与默认 `records/company-mode` 路径一致）

## 6 种协作模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Pipeline** | 顺序流水线 | 内容创作、代码评审 |
| **Parallel** | 多 Agent 并行 | 多视角分析 |
| **Debate** | 结构化多轮辩论 | 决策探讨 |
| **Vote** | 加权投票 | 共识达成 |
| **Roundtable** | 主持人引导圆桌讨论 | 深度分析+证据检索 |
| **Company** | 一人公司层级流程 | 完整生产工作流 |

## 架构

### 核心模型

```
Task → Orchestrator → RunQueue(FIFO,5并发,50排队) → Agent.execute(LLM) → TaskResult
                              ↕
                        MessageBus (进程内 pub/sub)
```

**Orchestrator**（`src/core/Orchestrator.ts`）是唯一调度入口。所有模式（Pipeline / Parallel / Debate / Vote / Roundtable / Company）最终都调用 `runTask(task, agentId)` → `Agent.execute(task)`。

**RunQueue**（`src/core/RunQueue.ts`）是一个纯内存 FIFO 队列：最多 N 个并发槽位 + M 个排队位，超排直接拒绝。没有优先级、没有重试、没有持久化。

**MessageBus**（`src/core/MessageBus.ts`）是进程内的事件总线，Agent 之间通过它订阅 / 发布消息，不经过网络。

**Agent**（`src/core/BaseAgent.ts`）是抽象基类。每个 Agent 本质是一个异步函数：接收 `Task`（含 id / type / description / context），调用 LLM，返回 `TaskResult`（含 output / reasoning / status / agentId）。Agent 自身无状态，不持数据库连接，不启动子进程。

### 执行模型：按 Round 推进

6 种模式共享一个执行原语：

| 模式 | 推进方式 | 单轮并发度 |
|------|---------|-----------|
| Pipeline | 串行链：A→B→C，前一个 output 塞入下一个 context | 1 |
| Parallel | 所有 Agent 同时执行同一 Task，结果汇总 | N |
| Debate | 多轮：每轮所有 Agent 并发，上一轮结果作为下一轮 context | N |
| Vote | 一次并发，按加权分数选出胜者 | N |
| Roundtable | 主持人分配发言顺序，串行推进 | 1 |
| Company | 自定义层级流水线（Writer→Reviewer→Editor） | 可配 |

每一步都会产生一个 **Round**（`{ roundNumber, agents, messages }`），整个执行过程是一个 `Round[]` 数组，全部持久化到 `records/` 下的 session.json。

### 数据流（以 Company 模式为例）

```
UI / API POST → Orchestrator.runCompany(task)
  → WriterAgent.execute(task)           → draft + reasoning
  → SeniorEditorAgent.execute(draft)    → review + score
  → records/session.json 落盘
```

上游 Agent 的输出直接拼入下游 Agent 的 `task.context` 中，是**全量上下文传递**，没有外部共享存储。

### 可视化面板如何消费

前端 React 面板（`dashboard/`）通过 Records API (`GET /api/sessions/:id`) 读取落盘的 session.json，经 `sessionJsonToWorkflow` 映射为 `Workflow → Round[] → Agent[]` 结构，驱动 AgentFlow 拓扑图、ThinkingDrawer 思维链、ChatPanel 消息面板、ExportPanel 导出。

---

## 多 LLM 提供商

| 提供商 | 环境变量 | 默认模型 |
|--------|----------|----------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Kimi | `KIMI_API_KEY` | `kimi-k2p5` |
| Ollama | _(本地无需 key)_ | `qwen3:14b` |
| Mock（离线） | `LLM_PROVIDER=mock` 或 `OFFLINE=true` | `mock-echo` |
| 自定义 | `LLM_BASE_URL` + `LLM_API_KEY` | 任意 |

**按 Agent 路由（可选）**：`AGENT_<AGENTID>_LLM_PROVIDER` / `AGENT_<AGENTID>_LLM_MODEL`（ID 大写且非字母数字转为 `_`，例如 `AGENT_REVIEWER_LLM_PROVIDER=ollama`、`AGENT_WRITER_LLM_PROVIDER=deepseek`）。

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
```

## 可视化监控面板

`dashboard/` 提供完整的 React 可视化控制台：

- **Agent 拓扑图**：d3-force 力导向布局，可拖拽、缩放、折叠
- **实时状态**：idle → thinking → done/error 状态流转
- **思维链抽屉**：点击 Agent 卡片查看逐步推理过程
- **消息面板**：Agent 间对话实时展示
- **像素风 UI**：CRT 扫描线、8-bit 音效、4 套配色主题
- **快捷键**：R=运行 E=导出 C=聊天 M=静音 +/-缩放

```bash
cd dashboard
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
├── dashboard/             # React 可视化监控面板
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

## 定位与局限

**这是一个本地单进程多 Agent 编排原型**，不是分布式调度平台。

| ✅ 能做 | ❌ 做不了 |
|---------|-----------|
| 6 种协作模式的 LLM 编排 | 分布式 Agent 注册 / 心跳 / 租约管理 |
| 进程内 RunQueue 并发控制 (FIFO, 5 并发, 50 排队) | 100 任务并发调度 + 负载均衡 |
| session.json 完整落盘 + 交互回放 | 7×24 连续运行无内存泄漏 |
| 原生 fetch 调用 6 家 LLM, 零额外依赖 | Agent 进程独立启动 / 动态扩缩容 |
| 参数化治理 (超时/限流/并发/CORS/鉴权) | 网络分区容错 / 故障自动转移 |
| 可观测性 (token 计数 / $ 成本 / 结构日志) | Prometheus 指标 / 分布式 tracing |
| AgentFlow 拓扑图 / ThinkingDrawer 思维链 | Agent 间 100MB 中间数据传递 |
| 通过 Records API 做异步任务 + 查询 | 图结构循环依赖检测 |
| 嵌入式知识库检索 (Ollama 向量 + 余弦相似度) | RAG-as-a-Service |

### 对比

| 维度 | PixelAgent Hub | LangGraph / CrewAI |
|------|---------------|-------------------|
| 依赖数 | 3 (npm prod) | 20+ |
| 语言 | TypeScript 原生 | Python 为主 |
| 调度模型 | 进程内 Round 推进 | 状态图 / 图遍历 |
| 运行时治理 | 鉴权、限流、超时、并发 | 需自行搭建 |
| 可视化 | 自带 React 面板 | 需对接 LangSmith/AG2 |
| 故障转移 | 无 | LangGraph 有 checkpoint 恢复 |
| 适用规模 | 本地开发 / 教学 / 原型 | 生产级 Agent 工作流 |

如果你需要的是企业级分布式 Agent 平台（心跳注册、故障转移、100+ 并发、优先级队列、图环检测、7×24 稳定、完整可交付文档），PixelAgent Hub **不是那个产品**；请参考 LangGraph Platform / Temporal / Prefect / AWS Bedrock Agents。

如果你需要的是一个**轻量、零依赖、开箱即跑的 TS 多 Agent 编排 + 可视化原型**，PixelAgent Hub 非常适合。

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
