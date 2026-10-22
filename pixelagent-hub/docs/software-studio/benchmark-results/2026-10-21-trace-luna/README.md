# Check traces, replicated on `gpt-6-luna` — 2026-10-21

The [DeepSeek trace A/B](../2026-10-21-trace/README.md) was cut short when the API key ran out of balance. Its 10 completed pairs looked promising: 8/10 strict with traces against 5/10 without. Paid runs then stopped. This replication runs PLAY LIVE on **`gpt-6-luna` through the ChatGPT subscription** instead. `npm run codex:chat` serves an OpenAI-compatible endpoint backed by the official Codex CLI, so there is no API cost.

**Setup.**
- **Builds:** the same two builds as before, [baseline](holdout-j/dist-baseline/) (`d91d1cf`) and trace (`ab2b430`).
- **Interleaving:** run by run with `--arms "dist=…;dist=…"`.
- **Model:** `gpt-6-luna` for every agent, at low reasoning effort.
- **Ideas:**
  - [Set J](../../../../config/live-holdout-j-cases.json) (pre-registered in commit `5b6ff80`) × 3 runs: [`holdout-j/`](holdout-j/) plus [`holdout-j-part2/`](holdout-j-part2/). The run was interrupted when a `codex` child process crashed (Windows status 0xC0000142) and the harness hung. The first four ideas are in `holdout-j/`. The remaining four, plus a full rerun of the idea that was in flight (unit-mix), are in `holdout-j-part2/`. The unit-mix runs in `holdout-j/` are excluded.
  - [Set I](../../../../config/live-holdout-i-cases.json) × 2 runs: [`holdout-i/`](holdout-i/). These are the same ideas as the DeepSeek attempt.
- **Usable pairs:** 40, with no infrastructure failures among them.

## Result

| | Baseline | Trace |
| --- | ---: | ---: |
| **Strict pass** | **32/40** | 31/40 |
| Pairs won (only this arm passed) | 7 | 6 |
| First check run all green | 25 | 27 |
| Reviews / Coder repairs | 14 / 9 | 13 / 8 |
| Checks dropped | 1 | 2 |
| **Checks per plan** | **5.95** | **4.72** |
| Median run | 79 s | 75 s |
| Tokens (including Codex's own prompt) | 3.58 M | 3.49 M |

By set:

| Set | Baseline | Trace | Trace better / worse |
| --- | ---: | ---: | ---: |
| J (3 runs) | 18/24 | 18/24 | 5 / 5 |
| I (2 runs) | 14/16 | 13/16 | 1 / 2 |

The exact sign test gives p = 1.0.

**On `gpt-6-luna`, traces make no difference to the pass rate, and the Tester writes 21% fewer checks.** The first check run is slightly more often all green: 27 against 25. Part of that comes from testing less.

## What it means

- **The DeepSeek signal did not replicate.** The models differ, and DeepSeek's 10 pairs were few, so both results can be true: traces may help one model's arithmetic and not another's. Nothing here supports keeping traces on by default.
- **The coverage cost is measured.** A plan that must explain every expected value asks for fewer of them.
- **Decision:** the instruction to write a trace is removed from the Tester and review prompts. They are back to the exact wording of `d91d1cf`. The optional `trace` field stays in the schema, so saved plans and older replies still parse.

## A note on the setup

**Speed.** `gpt-6-luna` through the Codex CLI took about 75 s per run, against about 25 s for `deepseek-chat`. Every request starts a Codex agent, and it adds about 20k tokens of its own prompt, mostly cached.

**Check counts.** The pass rates are not comparable with the DeepSeek rounds. luna writes fewer checks per plan (about 6, against 8–10 for DeepSeek).
