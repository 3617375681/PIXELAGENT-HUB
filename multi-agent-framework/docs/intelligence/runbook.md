# NanoClaw Intelligence Pipeline Runbook

## Local start

1. Ensure `config/workflows.yaml` exists.
2. Start API server:

```bash
npm run records:api
```

3. Trigger a run:

```bash
curl -X POST http://localhost:3100/api/intelligence/trigger \
  -H "Content-Type: application/json" \
  -d "{\"workflowId\":\"competitor-monitor\"}"
```

## Key APIs

- `GET /api/intelligence/workflows`
- `POST /api/intelligence/workflows/validate`
- `POST /api/intelligence/workflows/reload`
- `POST /api/intelligence/trigger`
- `POST /api/intelligence/events`
- `GET /api/intelligence/runs`
- `GET /api/intelligence/runs/:runId`
- `GET /api/intelligence/approvals`
- `POST /api/intelligence/approvals/:approvalId/resolve`
- `GET /api/intelligence/metrics`

## Mock to real provider migration

1. Implement new provider under `src/intelligence/core/actionAdapter.ts`.
2. Register provider in `IntelligencePipelineService`.
3. Keep action schema unchanged.
4. Run existing tests + add provider contract tests.

## Troubleshooting

- `WORKFLOW_NOT_FOUND_*`: Check `workflows.yaml` and reload endpoint.
- `waiting_approval` stuck: resolve via approval API.
- Duplicate side-effects: inspect idempotency map in `records/.../intelligence/runs.json`.

