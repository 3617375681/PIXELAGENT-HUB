# Studio 固定案例与单 Agent 对照

## 运行方式

在 `pixelagent-hub/` 配置模型后执行；生成会调用付费模型，列举和汇总不调用模型。

```powershell
npm run studio:benchmark -- --list
npm run studio:benchmark -- --cases counter,todo --strategy both --timeout-ms 240000
npm run studio:benchmark:report -- <运行UUID>
```

默认运行 `config/studio-benchmark.json` 中全部五类应用：计数器、任务列表、计算器、温度转换器和问答。`manager-coder` 先规划再写码，`coder-only` 直接写码；两者使用相同需求、模型配置和最多三轮真实编译预算。固定检查由案例文件定义，保存为 `benchmark / fixed-checks` 计划，不调用 Tester 模型。

运行清单和冻结需求写入 `records/studio-benchmarks/<UUID>/`，作品写入 `records/software-studio/<项目UUID>/`。配置 `STUDIO_ROOT_OVERRIDE` 指向作品目录后，在 Studio 展开固定检查，运行并保存结果，再执行汇总命令。不要在检查进行中离开作品页面。

`completed` 只表示生成循环结束；检查、人工验收和发布是独立步骤。汇总读取保存的客户端诊断，不把编译通过计为功能通过。`agentTasks` 统计返回的角色任务，不能当作模型 HTTP 调用次数；Token 仅统计返回的 usage，失败请求可能缺失。金额未知，保留 `costUsd: null`。终止进程不自动恢复；确认所属进程已退出后记录中断，耗时未知时不能补造结束时间。

## 2026-10-08 实际记录

原始运行 [original-run.json](benchmark-results/original-run.json) 中，Manager/Coder 尝试五例，四例构建及固定检查通过，第五例在生成时进程中断。单 Coder 尝试四例，三例构建及检查通过，温度转换器请求返回 `LLM error: terminated`；问答尚未开始。

问答另起补充运行，保留独立运行 ID，见 [quiz-supplement.json](benchmark-results/quiz-supplement.json)。它不能替换原运行的中断或用于宣称原运行十项全部成功。

测试期间修复三个平台问题：API 误判仍在运行的 CLI 任务；Windows 同文件并发原子保存冲突；预览禁止表单导致本地提交事件无法触发。任务列表单 Coder 最初检查为 2/7，允许本地表单事件后，同一生成源码为 7/7。预览仍使用 opaque sandbox，CSP 的 `form-action 'none'` 和 `connect-src 'none'` 阻止实际表单提交和网络请求。另限制检查期间切换工作区标签，避免卸载执行中的 iframe。

本次源码有未提交改动，生成期间平台也有修复，各案例只有一次采样，顺序、随机性和缓存未控制。固定检查不覆盖全部需求、原生键盘或视觉外观，没有实际货币成本，也没有足够的返修案例；结果不能证明多 Agent 优于单 Agent。下一阶段需在固定提交和环境上重复运行，并补充独立浏览器检查、故障恢复与返修统计。
