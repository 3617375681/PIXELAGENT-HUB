## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checks

- [ ] `npm run lint && npm test` (in `pixelagent-hub/`)
- [ ] `npm --prefix dashboard run check && npm --prefix dashboard test` if the dashboard changed
- [ ] Prompts, schemas or bundling changed only in `src/studio/shared` (shared by the server and PLAY LIVE)
- [ ] New UI animation corresponds to a real event (no simulated progress)
