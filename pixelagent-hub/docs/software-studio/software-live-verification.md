# 首个真实软件生成案例

日期：2026-10-07。项目 UUID：`edede925-3f73-4910-bd5d-51ea35de4fe9`。

通过 `npm run studio:create` 输入像素贪吃蛇需求，Manager 和 Coder 均实际调用本地配置的 DeepSeek / `deepseek-v4-pro`。模型生成 `index.html`、`style.css`、`game.js`、`README.md`，不是预置模板。第一轮 esbuild 构建通过，原始构建报告见 `software-build-live-verification.json`。源码与 ZIP 保存于 `examples/software/`。

浏览器访问本地 `studio:preview` 服务（端口 4175），实际观察：

- 初次加载有画布、Score 0、Paused、Resume 和 Restart 控件。
- 点击 Resume 后显示 Running，按钮改为 Pause。
- 运行撞墙后出现 Game Over，Pause 禁用；点击 Restart 恢复 Score 0 与 Paused。
- 同一轮操作 Resume → Pause 后恢复 Paused；已保存实际截图。

截图：仓库根目录 `portfolio-screenshots/studio-snake-paused-2026-10-07.png`。

尚未验证吃到食物后的计分、全部键盘方向、暂停期间位置保持、胜利边界和多尺寸显示。没有把上述部分检查改写为完整浏览器验收通过；项目状态仍为 `ready_for_review`，构建报告的 `browserVerified` 仍为 false。

回归：后端构建与 96 项测试通过，其中包含真实 esbuild 编译、缺失资源、宿主 imports 拒绝、路径限制、ZIP 解包、错误返修、三轮失败停止和取消。测试替身只验证工作流控制；本案例另行验证了真实模型生成。

本轮还修复了既有超时落盘时序：会话 JSON 使用临时文件原子替换；模式超时后给协作执行最多五秒清理并落盘，再发布 Job 终态。该改动由已有 HTTP 超时用例暴露并通过回归验证。
