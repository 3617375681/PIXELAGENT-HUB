# PixelAgent Studio：开源借鉴与接入方案

核对日期：2026-10-07。目标是可视化的 AI 软件创作团队：需求输入后交付可运行项目、预览和验证记录。本文记录源码检查与后续实现边界，不代表功能已经接入或验收。

## 已下载的参考源码

源码位于仓库根目录 `.reference/`，采用浅克隆与稀疏检出，保留上游 Git 元数据、README 和许可证。该目录已被 `.gitignore` 排除，不进入本项目提交和发布包。未安装或运行参考仓库的依赖、脚本。

| 项目 | 固定 commit | 查看位置 | 用途 |
| --- | --- | --- | --- |
| [MetaGPT](https://github.com/FoundationAgents/MetaGPT/tree/11cdf466d042aece04fc6cfd13b28e1a70341b1f) | `11cdf466d042aece04fc6cfd13b28e1a70341b1f` | `.reference/metagpt/metagpt/roles/`、`metagpt/actions/` | 产品需求、设计、编码、审核、测试的产物交接 |
| [LangGraph JS](https://github.com/langchain-ai/langgraphjs/tree/5abc4061f70f8208d56c0966baa9515ba7248838) | `5abc4061f70f8208d56c0966baa9515ba7248838` | `.reference/langgraphjs/libs/langgraph-core/`、`libs/checkpoint/` | 显式状态图、条件路由、返修循环与检查点 |
| [VoltAgent](https://github.com/VoltAgent/voltagent/tree/72a46c76b4507e1f98b41d5050a92bd30587eb70) | `72a46c76b4507e1f98b41d5050a92bd30587eb70` | `.reference/voltagent/examples/with-subagents/`、`examples/with-workflow-chain/` | 子 Agent 工具事件转发、结构化输入输出、运行可观测性 |

## 源码检查结论

- MetaGPT 的 `software_company.py` 当前入口使用 TeamLeader、ProductManager、Architect、Engineer2 和 DataAnalyst；传统 Engineer/QaEngineer 的条件注册代码被注释。不能把 `run_tests` 参数存在当作默认 QA 已执行的证据。
- MetaGPT 的 `roles/engineer.py` 和 `actions/write_code_review.py` 展示了文件产物、设计上下文和审核后的修改机制。借鉴这些接口职责，使用本项目 TypeScript 实现，不引入整套 Python 服务。
- LangGraph JS 的实际 scoped 包源码在 `libs/langgraph-core/`；`libs/langgraph/` 是重导出包装。依赖接入时锁定发布版本，不能直接把 monorepo 的 workspace 包复制进应用。
- VoltAgent 的示例将 `tool-call`、`tool-result`、`text-delta` 转发给 supervisor。像素控制台应显示执行摘要与工具证据，不宣称展示模型私有思维链。

## 接入取舍

优先评估 LangGraph JS 作为新增软件工作流的执行内核；保留现有 React 控制台和 Records API 适配层。MetaGPT 用作软件生产 SOP 的设计参考，VoltAgent 用作工具事件与监控参考。先验证一条完整的软件交付路径，再决定是否替换既有编排模式。

软件流程：需求与验收条件 → 简短设计 → 工作区生成文件 → 构建与测试 → 浏览器运行与截图 → 按失败证据返修 → 用户验收与导出。

## 第一条交付路径

以浏览器像素贪吃蛇为固定验收案例，要求暂停、计分和重新开始。首版角色为产品经理、工程师、测试员；后续增加视觉设计角色。

| 阶段 | 必须落盘的产物 | 验收证据 |
| --- | --- | --- |
| 需求与设计 | `requirements.md`、`design.md` | 每项需求有对应的检查方式 |
| 编码 | 项目源码、运行说明、文件清单 | 源码实际写入独立项目工作区 |
| 构建与测试 | 命令、退出码、日志、测试报告 | 成功基于实际执行结果；失败进入有上限的返修循环 |
| 视觉验收 | 运行截图、交互检查结果 | 页面可加载，暂停、计分和重新开始可操作 |
| 交付 | 预览地址、源码包、验证记录 | 用户可试玩并下载；失败或未验收不显示已交付 |

后续“增加障碍物”必须修改同一个项目，保留前后版本和验证记录。真实运行、失败、取消、等待确认均由后端事件驱动画面；演示必须明确标识。

## 来源与许可证

已逐份检查 MetaGPT 的 `LICENSE`、LangGraph JS 的 `LICENSE`、VoltAgent 的 `LICENCE`，均为 MIT 文本。上游许可证仍完整保存在参考检出中。

当前没有把三者源码复制到产品目录，也没有新增其运行依赖。后续若复制或改写具体代码，记录上游仓库、commit、原始路径和修改范围，并在随产品分发的第三方声明中保留相应版权与许可证；素材和模型另行核对来源，不能仅凭代码仓库许可证推断可复用。
