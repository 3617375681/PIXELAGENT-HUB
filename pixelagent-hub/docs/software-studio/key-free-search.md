# 无商业搜索 API Key 的联网检索

核对日期：2026-10-07。本项目新增 DuckDuckGo HTML 搜索与 SearXNG 检索适配，继续使用原有 `SearchProvider` 接口。未复制上游 Python 实现，也未引入 Python 运行时。

## 开源 Agent 的做法

| 项目 | 源码中的搜索方式 | 对本项目的启发 |
| --- | --- | --- |
| [MetaGPT](https://github.com/FoundationAgents/MetaGPT/blob/main/metagpt/tools/search_engine.py) | 支持 DuckDuckGo、Serper、SerpAPI 和自定义搜索函数；DuckDuckGo 包装使用 DDGS，返回标题、链接、摘要 | 搜索应是独立工具，商业 API 只是可选后端 |
| [smolagents](https://github.com/huggingface/smolagents/blob/main/src/smolagents/default_tools.py) | DuckDuckGoSearchTool 调用 `ddgs.text()`，有频率限制，无结果抛错 | 原始链接与摘录可直接作为模型的检索上下文 |
| [DDGS](https://github.com/deedy5/ddgs) | 当前是聚合搜索库，支持多个搜索引擎，不仅限于 DuckDuckGo | 单一网页入口会遇到验证码；多个引擎也不能保证持续可用 |
| [SearXNG](https://docs.searxng.org/dev/search_api.html) | 自托管聚合搜索；本地 HTTP `/search?format=json` 返回结构化结果 | 无需商业搜索 Key；仍需联网，上游引擎仍可能限流 |

## 当前接入与配置

默认选择顺序：显式 `SEARCH_PROVIDER` → 已配置 SearXNG → 已配置 Brave/Tavily Key → DuckDuckGo HTML。显式 `mock` 才使用合成检索，真实 ResearchAgent 拒绝 mock。

只使用网页搜索，在 `pixelagent-hub/.env` 设置：

```dotenv
SEARCH_PROVIDER=duckduckgo
```

自托管聚合搜索：

```dotenv
SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=http://127.0.0.1:8888
```

按 [SearXNG 官方容器指南](https://docs.searxng.org/admin/installation-docker.html)部署自己的实例，在其 `settings.yml` 中启用：

```yaml
search:
  formats:
    - html
    - json
```

修改环境配置后重启 Records API。DuckDuckGo 请求公共 HTML 搜索页，解析标题、真实 URL 和搜索摘要；SearXNG 消费用户配置实例的 JSON。两者均去重、过滤不可用链接、传递取消信号，并限制单次请求为 20 秒。页面摘要不是已读取的文章全文，工具记录中用 `duckduckgo-html`/`searxng` 标注来源。

## 验证结果与实际限制

- 后端构建及 80 项测试通过；新增测试覆盖 HTML 重定向链接、摘要、去重、验证码、无结果、取消、显式配置和 SearXNG JSON。
- 首次真实 DuckDuckGo HTML 请求返回 HTTP 200，页面含 10 个结果链接；随后新 provider 的真实调用遇到 TLS 断连和人工验证码，因此尚未证明该 provider 在本机持续可用。未自动处理验证码，也没有伪造替代结果。
- 后续使用编译后的 `DuckDuckGoSearchProvider` 再次实测成功：查询 `browser game accessibility` 返回 5 条不同 URL 和原始摘要，前 3 条来源页面均实际 GET 返回 200，页面标题与结果对应。原始结果和页面检查保存于 `search-live-verification.json`。这证明本次真实检索可用，不代表以后不会遇到验证码。
- 抽查的公共 SearXNG 实例返回人工验证页面；公共实例不作为默认配置。本机有 Docker CLI，但 Docker daemon 未运行，未启动自托管服务，SearXNG 目前只完成适配和测试替身验证。
- 主 ResearchAgent 仍要求至少三个不同 URL 和摘录。真实 DeepSeek company 已完成“检索 → 总结 → 初稿拒绝 → 返修批准 → 最终审阅”，保存 5 条来源，见 `company-live-verification.json`。模型仍需要自己的凭据，搜索不再要求 Brave/Tavily Key。

重新验收时，使用真实 provider 搜索并保存返回 URL/摘录及工具记录；成功结果必须来自实际检索，测试替身和单次 HTTP 200 均不能替代端到端验收。
