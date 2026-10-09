# Studio 环境检查

在 `pixelagent-hub/` 安装核心和 dashboard 依赖、配置 `.env` 后运行：

```sh
npm run studio:doctor
npm run studio:doctor -- --browser
npm run studio:doctor -- --json
```

检查使用与运行时相同的模型路由规则，分别报告 Manager、Coder、Tester 的配置，识别缺失密钥和示例中的 `replace-with-…` 占位值。通用 `LLM_API_KEY` 优先于厂商密钥；Agent provider 覆盖也优先于全局选择，包括 `OFFLINE` 下的显式 Agent 覆盖。mock 显示为演示模式，不代表真实生成。

命令检查完整工作台需要的 Node 22.12+、API 配置、esbuild 实际编译及 Vite 安装情况。启用 `ENABLE_STUDIO_BROWSER_CHECKS=true` 时，实际启动带沙箱的 Chromium，点击本地测试按钮并确认状态变化，再关闭浏览器。`--browser` 可以提前检查浏览器，不会修改 API 的启用设置。

输出只有固定诊断和配置项名称，不输出密钥、端点或底层异常。存在 FAIL 时退出码为 1；只有 PASS/WARN 时为 0。JSON 输出保留相同含义；需要纯 JSON 时直接运行 `node --import tsx scripts/doctor-software.ts --json`，避免 npm 的命令提示。

## 常见修复

| 检查 | 操作 |
| --- | --- |
| Node | 安装 Node 22.12+，重新安装两份依赖。 |
| model | 显式选择 `LLM_PROVIDER`，替换该厂商密钥；离线演示可设 `LLM_PROVIDER=mock`。 |
| builder | 在应用目录运行 `npm ci`；不要跨操作系统复制 node_modules。 |
| dashboard | 运行 `npm --prefix dashboard ci`，再执行 `run check` 和 `run build`。 |
| api-config | 检查端口、超时和鉴权配置；开启鉴权时替换 `RECORDS_API_KEY` 占位值。 |
| browser | 运行 `npx playwright install chromium`；Linux 可用 `npx playwright install --with-deps chromium`。已有浏览器可配置 `STUDIO_BROWSER_EXECUTABLE`。 |

Linux 主机必须允许 Chromium 沙箱所需的用户命名空间；浏览器不能启动时检查主机策略。项目 CI 的浏览器任务使用 Ubuntu 22.04。不要通过关闭沙箱来获得通过结果。

这是本地环境检查，不调用模型或其他外部服务，不创建项目记录，不启动 API，也不验证端口占用、密钥有效性、模型是否存在、网络连通性、完整依赖树或应用需求。Ollama 配置通过仍需本地服务和所选模型可用。正式使用前继续完成 dashboard 构建和作品浏览器验收。

## 验证记录（2026-10-09）

Windows / Node 24.21.0：核心构建、编译入口 smoke 和 140 项核心测试通过，七项浏览器检查按默认设置跳过。单独启用浏览器后，环境检查的五项测试全部通过，覆盖真实 Edge 启动与交互、不存在的可执行文件、占位密钥、Agent 覆盖、错误配置不泄露原值及 CLI 失败退出码。本机执行普通检查与 `--browser` 均以 0 退出；浏览器探测没有改变 API 的禁用设置，也没有发起模型请求。CI 浏览器任务纳入该测试文件，在 Linux 的已安装 Chromium 上复核启动行为。
