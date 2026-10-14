# PixelAgent Hub — Dashboard

React 19 + Vite + Tailwind front end for the Software Studio API (`../src/web/studioApi.ts`).

## Commands

```sh
npm ci
npm run dev      # Vite on :3000, proxies /api and /health to VITE_DEV_PROXY_TARGET (default http://127.0.0.1:3100)
npm run check    # tsc -b
npm run lint     # eslint
npm test         # vitest
npm run build    # outputs dist/public, served by `npm start` in the parent package or by the nginx image
```

## Layout

- `src/pages/Studio.tsx` — the Studio workspace (`/studio`, `/studio/:projectId`).
- `src/lib/recordsApi.ts` — API client. Same-origin by default; set `VITE_RECORDS_API_URL` for a separate host. The API key is entered at runtime through `ApiConnection` and kept in `sessionStorage`.
- `src/components/AgentFlow.tsx`, `AgentCard.tsx`, `PixelAvatar.tsx`, `effects/` — the pixel node-graph kit from the original prototype, to be driven by Studio events.
