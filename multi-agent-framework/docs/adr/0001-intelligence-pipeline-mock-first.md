# ADR 0001: Intelligence Pipeline uses mock-first execution adapters

## Status
Accepted

## Context

The intelligence pipeline must support side-effect actions (message/task/calendar/bitable) and still be testable and safe in local/CI environments.

## Decision

1. Introduce `ActionProviderRegistry` + provider interface.
2. Default provider is `MockActionProvider`.
3. Agent code never calls vendor SDKs (e.g. Feishu) directly; actions go through the provider registry.
4. Idempotency key is generated in `DecisionAgent` and enforced in `ExecutorAgent` using durable run store.
5. High-risk outputs are represented as `waiting_approval` runs and resolved via explicit approval API.

## Consequences

- Fast local development and deterministic tests.
- Clear seam to swap in real providers later.
- Lower blast radius for accidental duplicate actions.

