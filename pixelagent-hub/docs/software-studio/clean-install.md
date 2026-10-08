# 干净安装验证（2026-10-08）

## 方法与发现

从提交 `a420cf8` 创建新的本地克隆，不复制工作目录中的 `.env`、`node_modules`、`dist` 或记录。先执行 `npm ci` 和构建，发现 `package.json` 的 main、types、CLI 入口均不存在：源代码和 examples 同时编译时，实际输出位于 `dist/src/`。

修复候选只向该克隆复制本批变更的源文件和配置，重新通过锁文件安装、构建和验证。设置显式 `rootDir` 和 ESM 包类型，将 main/types/bin 与输出路径对齐；Docker 启动路径同步调整。类型重新导出使用 `export type`，确保 tsx 直接运行源码时不会导入不存在的运行时接口。

## 本机结果

Windows / Node 24.21.0，核心安装和构建成功；`npm run smoke:package` 验证实际编译入口导入、离线 provider、声明文件与 CLI 帮助。核心 124 项测试通过。

Dashboard 独立执行 `npm ci`、类型检查、10 项测试和 Vite 构建，均通过；构建仍有大 bundle 提示，需要后续改善首屏加载。

在该克隆中使用 mock 启动 `node dist/src/web/server.js`，健康检查和空 Studio 项目列表可读取。未使用生产密钥，也未调用真实模型。包清单 dry-run 确认包含 `dist/src/index.js`、`index.d.ts` 和 `cli.js`；没有发布 npm 包。

Docker 守护进程不可用，未验证镜像构建和容器运行。上述本机结果不能替代 Linux 或其他 Node 版本结果。

## 持续验证

GitHub CI 增加编译入口/CLI smoke；核心保留 Ubuntu Node 18/20/22，新增 Windows Node 22 检查核心构建及测试，Dashboard 用 Ubuntu Node 22 执行锁文件安装、类型检查、测试和构建。提交 `6b5ab66` 的 [远端运行](https://github.com/3617375681/PIXELAGENT-HUB/actions/runs/37770329196) 五项任务均成功；后续提交须检查各自结果。

安装及两个终端启动步骤见 [CONTRIBUTING](../../CONTRIBUTING.md)。成功安装仍不证明生成应用符合需求；浏览器检查、人工验收和真实案例对照继续分别记录。
