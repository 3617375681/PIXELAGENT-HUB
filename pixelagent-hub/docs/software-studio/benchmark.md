# Studio 固定案例与单 Agent 对照

## 运行方式

在 `pixelagent-hub/` 配置模型后执行；生成会调用付费模型，列举和汇总不调用模型。

```powershell
npm run studio:benchmark -- --list
npm run studio:benchmark -- --cases counter,todo --strategy both --timeout-ms 240000
npm run studio:benchmark:report -- <运行UUID>
```

默认运行 `config/studio-benchmark.json` 中全部五类应用：计数器、任务列表、计算器、温度转换器和问答。`manager-coder` 先规划再写码，`coder-only` 直接写码；两者使用相同需求、模型配置和最多三轮真实编译预算。固定检查由案例文件定义，保存为 `benchmark / fixed-checks` 计划，不调用 Tester 模型。

运行清单和冻结需求写入 `records/studio-benchmarks/<UUID>/`，作品写入 `records/software-studio/<项目UUID>/`。配置 `STUDIO_ROOT_OVERRIDE` 指向作品目录后，在 Studio 展开固定检查，运行并保存客户端结果；启用独立浏览器后，也可点击保存的固定计划对应的“运行独立浏览器检查”。再执行汇总命令。客户端检查进行中不要离开作品页面。浏览器安装与启用见 [浏览器验证](browser-verification.md)。

`completed` 只表示生成循环结束；检查、人工验收和发布是独立步骤。汇总分别读取保存的客户端诊断和服务端浏览器报告，不把编译通过计为功能通过。`agentTasks` 统计返回的角色任务，不能当作模型 HTTP 调用次数；Token 仅统计返回的 usage，失败请求可能缺失。金额未知，保留 `costUsd: null`。终止进程不自动恢复；确认所属进程已退出后记录中断，耗时未知时不能补造结束时间。

## 独立浏览器统计

每条结果新增 `browserStatus`、`browserRunId`、`browserChecksPassed`、`browserChecksTotal` 和 `browserError`。仅采用当前预览、该案例保存的固定计划对应的最新报告，并核对项目身份、预览内容和计划哈希。完整成功必须有浏览器版本、完成时间、最终截图声明、全部正确断言，且没有执行异常或阻断请求。状态为 `passed`、`failed`、`pending`、`cancelled`、`invalid` 或 `not_run`。

各策略分别汇总 `browserPassed`、`browserFailed`、`browserPending`、`browserCancelled`、`browserInvalid` 和 `browserNotRun`。运行中的新检查不会沿用旧成功；内容改变或成功报告不完整时计为证据失效。启动失败和超时属于浏览器失败，原因保留在 `browserError`，不能直接解释为应用功能缺陷。旧记录没有浏览器报告时明确计为未运行。

此统计不调用模型、不启动浏览器，也不修改原作品或自动批准。返修版本不替换原始案例的失败结果；视觉外观、完整需求覆盖和模型优劣仍需另外评测。

2026-10-09 验证：28 项浏览器及 API 回归全部通过，包含真实浏览器执行固定计划后读取报告。普通测试为 135 项通过、4 项浏览器测试跳过。只读汇总原始中断运行时，Manager/Coder 的五项与单 Coder 的四项均计为浏览器未运行，原有客户端通过数仍分别为四项与三项；没有补造独立浏览器成功或覆盖原记录。

## 2026-10-09 实际记录

新的固定提交真实模型评测见 [2026-10-09 记录](benchmark-results/2026-10-09/README.md)：十项首次构建成功，原始独立浏览器检查六项通过、四项失败；包含打包时序缺陷及检查计划问题。修复构建器后，两项原源码重构建各通过五项检查，单独保留结果，不覆盖原失败，也不用于宣称多 Agent 优势。

## 2026-10-08 实际记录

原始运行 [original-run.json](benchmark-results/original-run.json) 中，Manager/Coder 尝试五例，四例构建及固定检查通过，第五例在生成时进程中断。单 Coder 尝试四例，三例构建及检查通过，温度转换器请求返回 `LLM error: terminated`；问答尚未开始。

问答另起补充运行，保留独立运行 ID，见 [quiz-supplement.json](benchmark-results/quiz-supplement.json)。它不能替换原运行的中断或用于宣称原运行十项全部成功。

测试期间修复三个平台问题：API 误判仍在运行的 CLI 任务；Windows 同文件并发原子保存冲突；预览禁止表单导致本地提交事件无法触发。任务列表单 Coder 最初检查为 2/7，允许本地表单事件后，同一生成源码为 7/7。预览仍使用 opaque sandbox，CSP 的 `form-action 'none'` 和 `connect-src 'none'` 阻止实际表单提交和网络请求。另限制检查期间切换工作区标签，避免卸载执行中的 iframe。

本次源码有未提交改动，生成期间平台也有修复，各案例只有一次采样，顺序、随机性和缓存未控制。固定检查不覆盖全部需求、原生键盘或视觉外观，没有实际货币成本，也没有足够的返修案例；结果不能证明多 Agent 优于单 Agent。下一阶段需在固定提交和环境上重复运行，并补充独立浏览器检查、故障恢复与返修统计。
