# Security policy

本项目包含 HTTP API、鉴权与可选本地工具执行能力（Intelligence `local_*`）。若你认为发现了**可利用的安全漏洞**，请通过私密渠道报告，**勿**在公开 Issue 中张贴利用细节或真实密钥。

## 如何报告

1. 在 GitHub 仓库页面打开 **Security** → **Report a vulnerability**（若仓库已启用 Private vulnerability reporting）。  
2. 若该入口不可用，请向维护者发送邮件（使用你在 GitHub 主页公开的联系方式），主题建议包含 `[SECURITY]` 与仓库名。

## 请尽量包含

- 受影响版本或 commit、运行环境（Node、OS、是否生产配置）。
- 最小复现步骤或概念验证思路（不含对你方业务的破坏性操作说明以外的多余信息）。
- 是否认为已存在公开利用或数据已泄露。

我们会在合理时间内阅读报告；严重问题确认后会协调修复与披露节奏。对**非安全问题**（功能请求、一般 Bug、配置咨询）请使用普通 Issue。

## 范围说明

以下通常**不**按安全漏洞处理，但仍欢迎 Issue 讨论：

- 在故意将 `ALLOW_UNAUTH_IN_DEV=true` 且服务暴露公网时的未授权访问（此时所有 `/api/*` 均不要求密钥，包括会话列表与导出）。
- 在显式放宽 `INTELLIGENCE_SHELL_ALLOWLIST` / HTTP allowlist 后的命令执行或 SSRF 类行为。
- 依赖项的已知 CVE（请优先向上游报告，或提交依赖升级 PR）。

感谢协助保障用户与部署环境的安全。
