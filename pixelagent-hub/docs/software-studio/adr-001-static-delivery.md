# ADR-001：先交付可运行的静态浏览器项目

## 状态与目标

已实施首版。承接用户确认的“可运行软件、可视化协作、视觉验收”方向。当前完成文件与构建交付；浏览器验收、人工确认和持续修改仍需后续接入。

## 决策

复用 Manager 和 Coder，由现有 Orchestrator 传递取消信号。独立 UUID 工作区保存需求、计划、各轮源码、真实 esbuild 报告、自包含预览和 ZIP。编译失败把原始错误传回 Coder，最多三轮。模型错误停止，不用 mock 冒充成果。

```mermaid
flowchart LR
  Request[需求] --> Manager[Manager 规划]
  Manager --> Coder[Coder 生成文件]
  Coder --> Build[真实 esbuild 构建]
  Build -->|失败，最多三轮| Coder
  Build -->|通过| Preview[预览和源码 ZIP]
  Preview --> Pending[等待浏览器与人工验收]
```

首版支持离线 HTML/CSS/JS；不运行生成的 shell、安装脚本或 Node 服务。文件数和总大小受限，拒绝绝对路径、路径穿越、Windows 保留名和大小写重复。构建不从宿主机解析生成项目的 imports。预览限制外部网络；后续 dashboard 必须使用不含 allow-same-origin 的 sandbox iframe。

## 取舍和替代方案

- 静态项目可直接试玩，部署与运行成本低，适合作为像素游戏首个案例；暂不支持 React、npm 包、服务端或跨文件 imports。
- 通用命令执行需要容器隔离、资源限制和依赖管理，后续实现，不能直接把模型命令交给宿主机。
- 暂不迁移整个编排框架，先证明软件交付链；LangGraph 的检查点和条件路由仍是后续评估对象。
- 构建通过不证明功能正确。状态明确为 ready_for_review，browserVerified 始终为 false，直到独立浏览器检查有真实证据。

参考：[esbuild API](https://esbuild.github.io/api/)、[fflate ZIP](https://github.com/101arrowz/fflate)。
