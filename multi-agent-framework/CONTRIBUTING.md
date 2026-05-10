# Contributing

Thanks for improving **multi-agent-framework** (PIXELAGENT-HUB). This document is the short path from clone to merge.

## 开发环境

- Node.js **20+**（与 CI 一致）
- 复制环境变量模板：`cp .env.example .env`，按需填写（本地跑示例需要 `KIMI_API_KEY` 等）

常用命令：

```bash
npm ci
npm run build
npm test
```

## Pull Request 流程

1. 从 `main` 拉分支，命名建议：`fix/…`、`feat/…`、`docs/…`。
2. 改动保持聚焦；无关格式化、大范围重排请避免混在同一 PR。
3. 提交前确保 **`npm run build` 与 `npm test` 通过**（CI 会做同样检查）。
4. PR 描述里写清楚：**动机**、**行为变化**、若涉及 HTTP/API 则注明兼容性与风险。
5. 大功能或破坏性变更，建议先开 Issue 讨论再写代码。

## Issue

- Bug：请尽量给出复现步骤、环境（OS、Node 版本）、相关日志。
- Feature：说明使用场景与期望接口/行为，便于维护者判断范围。

## 代码风格

- 与现有文件保持一致：模块路径、错误处理方式、日志字段命名。
- 不增加与改动无关的长篇注释或文档；README / ADR 类变更在确实需要用户可见时再写。

再次感谢你的贡献。
