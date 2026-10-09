# Contributing

Thanks for improving **PIXELAGENT-HUB**. This document is the short path from clone to merge.

## 开发环境

- 完整项目使用 Node.js **22.12+**（Dashboard 的 Vite/Vitest 需要较新的 Node）。核心 CI 另外检查 Node 18、20 和 22。
- 在 `pixelagent-hub/` 复制 `.env.example` 到 `.env`。无密钥演示显式使用 `LLM_PROVIDER=mock`；真实生成需要配置所选 provider 的密钥。

常用命令：

```bash
npm ci
npm --prefix dashboard ci
npm run studio:doctor
npm run build
npm run smoke:package
npm test
npm --prefix dashboard run check
npm --prefix dashboard test
npm --prefix dashboard run build
```

完成检查后，两个终端分别运行 `npm run records:api` 和 `npm run ui:dev`，打开 `http://localhost:3000/studio`。Dashboard 开发代理默认连接 API 的 3100 端口；修改 API 端口时同步设置 `VITE_DEV_PROXY_TARGET`。

PowerShell 离线示例：`$env:LLM_PROVIDER="mock"; node dist/examples/company-mode.js`。Bash：`LLM_PROVIDER=mock node dist/examples/company-mode.js`。mock 用于流程演示，不代表真实模型生成验收。

本地使用构建后的工作台时，执行 `npm run build:all` 和 `npm start`，打开 `http://127.0.0.1:3100/studio`；页面和 API 共用服务，支持刷新 Studio 深层链接。运行 `npm run smoke:dashboard` 验证实际编译入口。配置和开发模式区别见 [同源启动说明](docs/software-studio/local-start.md)。

## Pull Request 流程

首次启动遇到问题时，查看 [Studio 环境检查](docs/software-studio/environment-check.md)。`npm run studio:doctor -- --browser` 会检查本地 Chromium；不发起模型请求。

1. 从 `main` 拉分支，命名建议：`fix/…`、`feat/…`、`docs/…`。
2. 改动保持聚焦；无关格式化、大范围重排请避免混在同一 PR。
3. 提交前运行上述检查。CI 检查核心编译、编译产物与 CLI、测试，以及 Dashboard 类型、测试和构建；另在 Windows 检查核心，覆盖本地文件保存与进程中断行为。
4. PR 描述里写清楚：**动机**、**行为变化**、若涉及 HTTP/API 则注明兼容性与风险。
5. 大功能或破坏性变更，建议先开 Issue 讨论再写代码。

## Issue

- Bug：请尽量给出复现步骤、环境（OS、Node 版本）、相关日志。
- Feature：说明使用场景与期望接口/行为，便于维护者判断范围。

## 代码风格

- 与现有文件保持一致：模块路径、错误处理方式、日志字段命名。
- 不增加与改动无关的长篇注释或文档；README / ADR 类变更在确实需要用户可见时再写。

再次感谢你的贡献。
