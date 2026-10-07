# 修改建议验收记录

核对日期：2026-10-07。对应根目录 `开发建议-2026-10-07.md` 的六项优先修改。这里区分代码回归、浏览器实测与真实外部服务；测试替身不能证明真实模型质量。

| 项目 | 已验证的证据 | 尚未完成的验收 |
| --- | --- | --- |
| 1. 审核语义 | `reviewDecisions.test.ts`、`server.integration.test.ts`：拒绝后返修、第二轮批准、连续拒绝五轮停止、Director 拒绝；坏响应落盘为失败。真实 DeepSeek company 会话保存 rejected → approved，两稿后最终审阅成功 | 无流程验收缺口；模型事实判断仍可能出错 |
| 2. 真实与演示 | HTTP 401、坏 JSON、缺少 provider 都失败；演示必须显式选择。浏览器默认 DEMO 关闭，无凭据任务显示 ERROR；显式 DEMO 显示 MOCK。parallel 不再将失败结果标成成功；debate、vote、roundtable 遇到失败停止；Reviewer/Moderator 对空对象、错误字段和未注册发言者做 schema/成员校验，拒绝保留为 partial，不补造评分和收敛结论。真实模型成功、schema 失败、网络断连和超时均保留原状态 | 无 |
| 3. 协议与映射 | 同步结果与异步 runResult 解析完整 session；浏览器逐轮看到 Manager/Researcher、Writer/SeniorEditor、Director，刷新后恢复三轮及 DEMO 标识。company 异步任务接收时分配 sessionId，失败/超时/取消仍关联同一记录；首页加载失败记录，浏览器验证无凭据 Manager ERROR 可展开，刷新仍显示失败原因；审核拒绝显示需返修 | 无新增缺口；真实服务运行另验 |
| 4. 检索 | 主 ResearchAgent 接入 SearchProvider，支持 DuckDuckGo HTML、SearXNG、Brave/Tavily，保存 URL、摘录和工具记录；替身测试验证三条不同来源、过滤占位来源、检索不可用明确失败；页面输出包含原始 URL 和摘录。实网 DuckDuckGo provider 返回 5 条浏览器游戏无障碍相关 URL/摘要，前 3 条来源页面实际 GET 均为 200，见 `search-live-verification.json`。真实 company 已完成检索、总结、返修和最终审阅 | SearXNG 自托管未实测；公共网页可能限流或验证码 |
| 5. 模板残留 | 已确认未使用的 trpc provider 移除；dashboard TypeScript 检查通过 | 无 |
| 6. 取消与超时 | `cancellation.test.ts` 验证模型 fetch 收到取消、Agent/流水线超时中断请求且不开始下一步；RunRuntime 测试验证运行中取消和排队取消，排队任务不调用 work，cancelled 状态可恢复；company HTTP 集成测试验证取消/模式超时中断 fetch，不开始研究、撰写、审核，分别保存 cancelled/failed；首页运行中可点击 CANCEL。真实模型任务取消和模式超时均已验证 | 无 |

## 可重复命令

在 `pixelagent-hub/`：

```powershell
npm run build
npm test
npm --prefix dashboard run check
npm --prefix dashboard test
npm --prefix dashboard run build
```

最新后端构建通过，80 项测试通过；前端此前的类型检查、构建通过，6 项测试通过，本次搜索修改不涉及前端。Vite 仍报告既有的大包体积警告，本轮未扩展到性能重构。

浏览器验证使用独立本地服务：API `127.0.0.1:3119`，UI `127.0.0.1:4339`，记录存放在 `records/validation-2026-10-07/`。刷新恢复截图：根目录 `portfolio-screenshots/validation-refresh-demo-2026-10-07.png`。演示记录不作为真实检索或模型质量的证据。

失败会话刷新恢复截图：`portfolio-screenshots/validation-failure-restored-2026-10-07.png`；对应会话 `2026-10-07T16-22-03-127Z_task-1791390123116`。该任务没有模型调用成功，Manager 记录和页面均为失败，后续阶段没有执行。

## 当前限制与后续方向

最新检查发现本地 DeepSeek 已配置，真实调用成功（`model-live-verification.json`），此前“缺少所有模型配置”的判断已不适用。联网检索无需 Brave/Tavily Key；DuckDuckGo 实网返回 5 条来源，前 3 条页面访问为 200，此前也出现过验证码。SearXNG 自托管尚未运行，详细证据和配置见 `key-free-search.md`。密钥只写入本地 `.env`，不要放进聊天、测试快照或提交。

## 真实模型追加验收

- `model-live-verification.json`：DeepSeek 返回有效 JSON 与实际 token usage，无 mock。
- 第一条真实 company 运行因 Manager 阶段 ID 为数字而失败，schema 正确阻止继续。提示词已明确阶段 ID 必须为字符串，保留严格校验。
- 会话 `2026-10-07T16-51-49-985Z_real-browser-accessibility-v2`：规划、真实检索总结、初稿成功，ResearchAgent 保存 5 条来源；真实审核拒绝，第二稿请求触发 180 秒模式上限。最终状态 failed，取消信号传到 Writer，请求停止，未进入最终审阅。
- `cancellation-live-verification.json`：真实 DeepSeek company 任务运行中 POST cancel 返回 200，Job 和 session 均为 cancelled，研究、撰写、审核、最终审阅未启动。
- `review-live-verification-timeout.json`：真实编辑拒绝人工提供的坏稿，模型重写后仍因来源权威性不足被拒绝；第二次重写触发验收脚本整体超时。拒绝、超时均原样保存，未改成批准。
- `review-live-verification.json`：另一次有界返修测试遭遇真实模型 fetch 断连而失败；审核还误记了 WCAG 2.2 的编号。对照 W3C 文档，[Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) 是 2.4.13 AAA，[Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) 是 2.4.11 AA。该失败记录不作为通过证据，也说明模型批准不等于独立事实验证。
- `company-live-verification.json`：会话 `2026-10-07T16-56-42-047Z_real-wcag-company` 最终 Job 为 succeeded、session 为 success。真实检索保存 5 条来源；初稿被拒绝，第二稿批准，Director 最终审阅通过，共 7 次真实模型调用。本次验收模式上限临时设为 480 秒，生产默认上限未改。
- 浏览器在 API `3120`、UI `4340` 加载同一真实会话，核对规划/研究、初稿拒绝、返修批准、最终审阅四轮；刷新后仍能加载完整记录（当前轮次回到第一轮）。截图：`portfolio-screenshots/validation-real-company-2026-10-07.png`。

软件创作方向见 `open-source-adoption.md`：参考 MetaGPT 的产物交接，评估 LangGraph JS 的状态编排。参考源码已下载，但框架尚未接入；像素贪吃蛇的工作区生成、实际构建、交互验收和源码包交付尚未实现。本记录不宣称软件交付能力已经完成，也不把旧 `ACCEPTANCE.md` 的“32/32”摘要当作本轮实测结果。
