# Launch posts (drafts for the maintainer to publish)

Everything here is a draft; publishing is the maintainer's call. Numbers come from the evidence in
`docs/software-studio/benchmark-results/`; update them if new runs are added.

Links:
- Demo: https://jiarong-song233.github.io/PIXELAGENT-HUB/
- Repo: https://github.com/Jiarong-Song233/PIXELAGENT-HUB
- Chinese article: [multi-agent-not-better.zh-CN.md](multi-agent-not-better.zh-CN.md)

---

## Show HN

**Title:** Show HN: Four AI agents build a web app in your browser, and the tests decide when it's done

**Text:**

I built a pixel-art "dev squad": a Manager plans, a Coder writes a small offline web app, a Builder compiles it with esbuild, and a Tester writes checks and runs them in a sandbox. Compiler errors and failed checks are sent back to the Coder as evidence. Every animation in the UI is a real event from the run; nothing is simulated.

The demo is a static GitHub Pages site. Press BUILD LIVE, paste your own key (DeepSeek, Claude, OpenAI, OpenRouter, Qwen, GLM or SiliconFlow), and the whole loop runs in your tab:

- streaming model calls straight to the provider;
- esbuild-wasm compilation;
- one sandboxed iframe per check.

There's no server. A small app takes about 20 seconds with deepseek-chat.

Two things I learned that surprised me:

1. **The planning agent didn't measurably help.** 5 fixed apps × 2 strategies × 3 runs (30 generations, deepseek-v4-pro): plan-then-code passed every check in 13/15 runs and code-only in 12/15. Planning cost about 1,200 extra tokens per app. Every finished build compiled on the first try, so my compile-repair loop never fired.
2. **The tester was wrong more often than I expected.** Checks shared one page, so a toggle flipped by one check broke the next one, and the repair loop then "fixed" apps that were already correct. Making every check start on a freshly loaded page took the same timer prompt from 0 clean runs out of 3 (two false failures and one Coder error) to 2 of 3 passing 10/10.

All 50 recorded generations are in the repo, failures included, and 40 of them can be replayed in the demo. The browser and Node versions share the same prompts, schemas and bundling code.

Happy to answer questions about the event-driven UI, running agent loops client-side, or the experiment design.

---

## Reddit (r/LocalLLaMA, r/webdev, r/SideProject)

**Title:** I made four AI agents that build a small web app in your browser, with real compile and browser checks. Bring your own key, no backend.

**Body:**

The demo is fully static (GitHub Pages). It works like this:

1. You type an idea.
2. A Manager plans and a Coder writes HTML/CSS/JS.
3. esbuild-wasm compiles it. Compile errors go back to the Coder for up to 3 rounds.
4. A Tester writes checks, and each one runs in its own sandboxed iframe.
5. A failed check gets one repair round.

Your key goes only to the provider you pick: DeepSeek, Claude, OpenAI, OpenRouter, Qwen, GLM or SiliconFlow.

I also ran the boring experiment: does a planning agent help? Across 30 runs, 13/15 with the planner vs 12/15 without, so no measurable difference. All the runs are replayable in the demo.

Demo: https://jiarong-song233.github.io/PIXELAGENT-HUB/ · Code (MIT): https://github.com/Jiarong-Song233/PIXELAGENT-HUB

---

## V2EX（分享创造）

**标题：** 做了个像素风 AI 开发小队：在浏览器里用你自己的 key，4 个 Agent 现场写一个能玩的小应用

**正文：**

先说怎么玩：打开 https://jiarong-song233.github.io/PIXELAGENT-HUB/ ，点 **BUILD LIVE**，填入你自己的 key，支持 DeepSeek、Claude、OpenAI、通义千问、智谱、OpenRouter 和硅基流动。接下来的流程全部在你的浏览器里完成，没有任何后端：

1. Manager 规划；
2. Coder 写码；
3. esbuild-wasm 编译，编译错误会交回 Coder 修；
4. Tester 写检查，并在沙箱 iframe 里逐项执行；
5. 有检查失败时，Coder 再返修一次。

用 `deepseek-chat` 做一个番茄钟大约 20 秒。

顺便做了个对比实验：先规划再写码 vs 直接写码，5 个应用 × 3 次，结果是 13/15 对 12/15，规划没有可测的帮助。完整的过程写在这里：[我让 4 个 AI Agent 分工写代码，测了 30 次，结果并不比 1 个强](multi-agent-not-better.zh-CN.md)。

代码 MIT 开源：https://github.com/Jiarong-Song233/PIXELAGENT-HUB ，欢迎拍砖。

---

## Checklist before posting

- [ ] The demo loads, and BUILD LIVE works with a fresh key in a private window.
- [ ] The README GIF and the numbers match the latest evidence.
- [ ] A social preview image is uploaded: Settings → General → Social preview, using `portfolio-screenshots/social-preview.png`.
- [ ] Discussions are on, and the issue templates exist for feedback.
- [ ] Post on a weekday morning, US time for HN and Reddit, Beijing time for 知乎, V2EX and 掘金. Stay around for a few hours to answer questions.
