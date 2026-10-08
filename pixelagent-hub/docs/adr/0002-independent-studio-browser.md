# ADR 0002: Independent Studio browser evidence

Status: accepted for the owner-operated local workflow.

## Context

Compiler success and client-reported synthetic DOM events cannot establish real browser interaction. Studio needs repeatable click/input/key checks and screenshots linked to the exact delivered preview, without overwriting compilation or manual review evidence.

## Decision

Use Playwright Chromium behind an opt-in server setting. The existing runtime queues each bounded declarative Tester plan with retries disabled. Every execution has an independent ID, normalized plan and preview hashes, fixed viewport, browser version and saved results. The workbench polls reports and retrieves authenticated PNGs. A fresh nonpersistent context loads the preview in an opaque iframe; network access, service workers, downloads and popups are blocked. Cancellation closes the browser; interrupted jobs retain failed evidence rather than replaying.

## Alternatives and consequences

Client-only checking has lower installation cost but synthetic events and caller-provided results provide weaker evidence. Arbitrary generated Playwright scripts offer broader coverage but introduce executable model code on the host. Full container execution offers stronger isolation with materially greater Windows deployment complexity; retain it as a requirement before public tenant execution.

The chosen approach adds a browser installation and Node 20+ requirement only for this capability. Each active run uses a browser process; existing queue limits concurrency. Limit execution to 45 seconds, individual operations to two seconds, checks to ten and actions to eight per check. Capture failures explicitly, retain screenshots that completed, and close browser processes before final persistence. Browser install/launch errors are operational failures, never passing mock results. PNG storage grows per run and requires owner-managed retention. This iteration checks one browser/viewport and text assertions; it does not implement visual comparison or complete acceptance coverage.
