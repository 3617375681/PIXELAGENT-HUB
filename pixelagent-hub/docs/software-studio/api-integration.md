# Software Studio API 集成

完整契约见 [OpenAPI 3.0 文件](../../openapi/studio-api.yaml)，可导入 OpenAPI 查看器或客户端生成工具。它覆盖 15 组路径的 21 个 GET/POST 操作。通用运行队列和会话接口仍见 [Records API](../../openapi/records-api.yaml)。接口面向个人工具集成，共享密钥没有多用户权限。

## 连接与创建

先运行 [本地服务](local-start.md) 或 [Docker](docker-start.md)。请求使用 `X-API-Key` 或 `Authorization: Bearer <RECORDS_API_KEY>`，模型提供商密钥只在服务端配置。不要把凭据放在 URL；客户端下载请求也需鉴权。

以下 Node 22 示例先读取项目列表。只有明确设置 `CREATE_STUDIO_PROJECT=true` 时才创建项目，会使用服务端配置的真实模型并产生用量。通过环境变量提供密钥；不要把实际密钥写入源码、命令示例或日志。

```js
const base = process.env.RECORDS_API_URL || 'http://127.0.0.1:3100';
const headers = { 'Content-Type': 'application/json', 'X-API-Key': process.env.RECORDS_API_KEY || '' };
async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init, headers, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Records API returned HTTP ${response.status}`);
  return response.json();
}
console.log((await request('/api/studio/projects')).projects);
if (process.env.CREATE_STUDIO_PROJECT === 'true') {
  const accepted = await request('/api/studio/projects', {
    method: 'POST', body: JSON.stringify({ description: '制作可用键盘操作的计数器，包含增加、减少和重置。' }),
  });
  console.log({ projectId: accepted.projectId, projectUrl: accepted.projectUrl });
  // 后续只读轮询 accepted.projectUrl；不要重复发送创建请求。
}
```

API 地址由部署者配置，仅连接可信服务。上述示例没有取消服务端任务的超时语义；客户端网络超时后，任务可能已被创建，先查看列表和运行记录再决定是否手动重试。当前创建接口不提供客户端幂等键。

## 工作流与状态

| 阶段 | 请求与处理 |
| --- | --- |
| 生成 | `POST /api/studio/projects` 传 `description`，返回 **202** 和 `projectId/jobId/projectUrl`；GET 项目直到离开 `queued/running`。 |
| 查看成果 | `ready_for_review` 才能 GET `preview`（JSON 中的 `html`）和 `archive`（ZIP）。隔离运行生成 HTML，禁止直接注入宿主页。 |
| 测试规划 | POST `test-plans` 传 `{}`，返回 202；GET 同一路径，找到对应 `planId` 并等待 `ready`。此步调用 Tester 模型。 |
| 独立检查 | POST `browser-runs` 传 `{ "testPlanId": "..." }`，返回 202；GET 等待对应 `runId` 完成。需启用带沙箱的 Chromium，没有模型调用。 |
| 截图 | GET `browser-runs/<runId>/initial.png` 或 `final.png`；只下载报告 `screenshots` 中实际存在的文件。 |
| 返修 | POST `repair` 只传 `browserRunId` 或 `diagnosticId` 中一个。返回新的项目 ID，重新等待构建、重新规划与复测。此步调用模型，原成果保留。 |
| 修改与版本 | POST `revise` 传 `changeRequest`；GET `changes` 查看源码差异、GET `versions` 查看关联历史。POST `versions` 传目标 `projectId` 选择成功候选。 |
| 人工决定 | POST `reviews` 必须包含当前预览、保存的诊断、审阅者标签、说明和 `manuallyReviewed: true`。客户端不能自动替真人批准。 |

创建、修改、返修、重试和 Tester 规划会产生模型用量；没有自动重复整个付费任务。取消生成用 POST `cancel`（无请求体），取消测试规划用 `{ "cancelPlanId": "..." }`，取消浏览器运行用 `{ "cancelRunId": "..." }`。后两者不与启动字段同时发送。

生成的终态为 `ready_for_review/failed/cancelled`；计划为 `ready/failed/cancelled`；浏览器为 `passed/failed/cancelled`。**202 不是成功交付，编译成功不是交互验收，浏览器 passed 也不是人工批准。** `repairable` 由服务端根据当前源码、计划哈希及完整失败证据计算；启动失败、超时与旧报告不能用于代码返修。

## 错误与验证范围

常见错误为 400（参数）、401（鉴权）、404（记录不存在）、409（状态或证据冲突）、429（创建限流/队列）。请求 body 的长度、互斥字段与返回结构见契约。业务前提仍需服务端判断，Schema 本身不能证明报告归属、计划覆盖或人工操作。

`npm test` 使用 Swagger Parser 校验契约及引用，并用 Ajv 校验实际 HTTP 请求/响应。受控测试调用全部列出的操作，覆盖生成、追加需求、诊断返修、重试、版本、计划、审阅，以及完整服务的两种鉴权；ZIP/PNG 检查媒体类型与文件签名。取消与浏览器启动包含状态冲突响应，成功执行浏览器和取消行为由已有 API/浏览器回归覆盖。这些固定模型与截图数据用于接口一致性，不证明真实模型或浏览器运行质量。
