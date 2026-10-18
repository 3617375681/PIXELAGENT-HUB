# 证据索引 · Evidence index

仓库里大部分文件是实验证据：真实模型生成的源码 ZIP、事件日志、检查计划、浏览器报告和截图。它们都保存在原位，以免破坏已有链接和 `npm run portfolio:demo -- --check` 的哈希校验。本页是唯一入口，按"先看哪个"排序。

## 实验（真实模型 `deepseek-v4-pro`）

| 日期 | 实验 | 一句话结论 |
| --- | --- | --- |
| 2026-10-18 | [真实模型展示](../software-studio/benchmark-results/2026-10-18-showcase/README.md) | 6 个创意共 10 次尝试，5 个最终全部检查通过；像素宠物三次都没生成出来（Coder 超时），番茄钟第 1 次失败是 Tester 计划写错 |
| 2026-10-15 | [单 Agent vs 多 Agent 重复对比](../software-studio/benchmark-results/2026-10-15-repeated/README.md) | 5 个应用 × 2 种策略 × 3 次，共 30 次生成。先规划再写码 13/15 完整通过，直接写码 12/15，没有可测优势 |
| 2026-10-09 | [首次浏览器评测](../software-studio/benchmark-results/2026-10-09/README.md) | 10 次生成全部首次编译通过，浏览器检查 6 过 4 败；其中 2 次失败是构建器缺陷（`defer` 顺序），已修复 |
| 2026-10-09 | [测验应用的修订检查](../software-studio/benchmark-results/2026-10-09-quiz-disabled/README.md) | 同两个测验应用换用新的固定计划复测，没有新生成，也没有调用模型 |
| 2026-10-09 | [受控故障返修](../software-studio/benchmark-results/2026-10-09-real-repair/README.md) | 把计数器改成 `+= 2`，浏览器检查发现故障，失败证据交回 Coder 返修 |
| 2026-10-09 | [带源码上下文的返修复测](../software-studio/benchmark-results/2026-10-09-real-repair-source-context/README.md) | 返修只改 1 行，其余文件逐字节不变；原计划 4/4、额外 7/7 通过 |

方法说明：[benchmark.md](../software-studio/benchmark.md)。固定用例：[`config/studio-benchmark.json`](../../config/studio-benchmark.json)。

## 功能验证记录

- 浏览器验收：[browser-verification.md](../software-studio/browser-verification.md) · [browser-verification-evidence.md](../software-studio/browser-verification-evidence.md) · [browser-repair-evidence.md](../software-studio/browser-repair-evidence.md)
- 真实运行：[software-live-verification.md](../software-studio/software-live-verification.md) · [console-live-verification.md](../software-studio/console-live-verification.md)
- 修改、重试与恢复：[modification-verification.md](../software-studio/modification-verification.md) · [manual-retry-verification.md](../software-studio/manual-retry-verification.md) · [recovery.md](../software-studio/recovery.md)
- 数据来源说明：[data-provenance.md](../software-studio/data-provenance.md)

## 文章

- [我让 4 个 AI Agent 分工写代码，测了 30 次，结果并不比 1 个强](../articles/multi-agent-not-better.zh-CN.md)
- [发布文案草稿（Show HN / Reddit / V2EX）](../articles/launch-posts.md)

## 截图

界面截图在仓库根目录的 [`portfolio-screenshots/`](../../../portfolio-screenshots/)，文件名带拍摄日期。`studio-demo.gif` 是 README 顶部那张动图，从静态回放录制而成。
