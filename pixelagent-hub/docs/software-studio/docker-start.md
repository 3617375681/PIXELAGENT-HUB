# Docker 本机部署

在仓库根目录使用 Docker Engine 与 Compose v2。无需在宿主机安装 npm 依赖：两个镜像在干净的 Node 22 环境构建，前端由 Nginx 提供并反代 API。

## 首次运行

1. 复制 `pixelagent-hub/.env.example` 为 `pixelagent-hub/.env`。
2. 将 `RECORDS_API_KEY` 替换为独立的随机密钥，至少 16 字符。生产启动拒绝示例占位符。模型密钥只保留在此服务端文件中。
3. 设置所用模型 provider 与密钥。离线基础编排演示可显式设置 `LLM_PROVIDER=mock`；当前 MockProvider 的通用代码输出不能构建 Studio 静态应用，不代表软件生成可用。真实软件生成需真实 provider。
4. 不使用 Ollama 时设置 `ENABLE_EMBEDDING_RETRIEVER=false`。容器中的 `127.0.0.1` 指向容器自身；访问宿主机 Ollama 需单独配置可达地址。
5. 执行：

```sh
docker compose up --build -d
docker compose ps
```

打开 `http://127.0.0.1:8080/studio`，点击“API 连接”，输入 `RECORDS_API_KEY` 验证连接。凭据按当前标签页会话保存；不要把模型提供商密钥填入页面。后端直连为 `http://127.0.0.1:3100`。

Compose 明确设置 `NODE_ENV=production`、`ALLOW_UNAUTH_IN_DEV=false`，覆盖示例文件的开发值；固定容器记录路径，避免继承宿主机绝对路径。配置优先级遵循 [Docker 官方说明](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)。两个发布端口均只绑定本机；当前部署面向个人使用，没有提供多用户权限管理。

## 数据与更新

记录保存在宿主机 `pixelagent-hub/records/company-mode/`，Studio 项目在其 `studio/` 子目录。重启和 `docker compose down` 保留此挂载目录；备份时先停止服务再复制整个 `records/`。不要手动清空该目录。

修改环境配置后执行 `docker compose up -d --force-recreate`；更新源码后执行 `docker compose up --build -d`。查看日志用 `docker compose logs --tail=100`；停止用 `docker compose down`。启动中断的任务保留明确失败状态，不自动重复付费模型调用。

前后端构建上下文排除本地 `.env*`、`node_modules`、构建输出和记录。前端不读取宿主机 Vite 密钥配置，默认同源访问 Nginx 的 `/api`。环境文件在运行时注入后端，仍须限制该文件与 Docker 管理权限。

## 验证范围与限制

CI 的 `Docker production startup` 任务构建并启动实际 Compose 服务，验证静态资源、深层路由、健康检查、缺失/错误凭据的拒绝和正确凭据读取。它在容器中用实际 Builder/esbuild 构建固定源码、导出 ZIP，再通过 HTTP 读取预览与下载；重启后核对状态、预览和 ZIP 哈希。测试同时放置固定 Vite 环境标记，确认它未进入浏览器入口脚本。没有模型调用，不用于评价生成质量。

此 Alpine 后端镜像未安装 Chromium，不提供独立浏览器验收；请保持 `ENABLE_STUDIO_BROWSER_CHECKS=false`。需要该能力时使用 [本地启动](local-start.md) 与 [独立浏览器配置](browser-verification.md)。镜像扩展与容器沙箱验收仍待完善，不能用构建成功代替浏览器检查。

当前 Windows 工作机的 Docker 服务未启动且未提供可用 Compose 插件；实际容器构建与启动以对应 GitHub CI 结果为准。
