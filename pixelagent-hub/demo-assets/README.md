# Demo Assets

This folder contains repeatable demo assets for product validation and social distribution.

## 3 reproducible demos

1. Content pipeline
   - Command: `npm run example:pipeline`
   - Use case: research -> writing -> review
2. Code review pipeline
   - Command: `npm run example:code-review`
   - Use case: coding task -> review gate
3. Company mode
   - Command: `npm run example:company`
   - Use case: manager/researcher/writer/editor/director loop

## Capture output for screenshots

Run:

```bash
npm run example:company
```

Then capture:

- `records/company-mode/<session-id>/session.json`
- `records/company-mode/<session-id>/output.md`

## Video asset

Use the shot list in `demo-assets/video-shotlist.md` to record a 60-90 second walkthrough.
