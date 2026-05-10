# PixelAgent Hub - Frontend

> A retro-futuristic multi-agent workflow visualization console. Dark terminal aesthetic with CRT scanlines, 8-bit sound effects, free-drag force-directed graph layout, and real-time agent monitoring.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS 3.4 + shadcn/ui |
| Animation | Framer Motion |
| Layout | d3-force (tree layout with drag support) |
| Router | react-router v7 |
| Build Tool | Vite 7 |

---

## File-by-File Guide

### Entry Points

| File | Purpose |
|------|---------|
| `src/main.tsx` | React DOM entry point, mounts App |
| `src/App.tsx` | Root component with BrowserRouter, renders routes |
| `src/App.css` | Global app-level styles |
| `index.html` | HTML shell with meta tags and script reference |

### Pages (Routes)

| File | Purpose |
|------|---------|
| `src/pages/Home.tsx` | **Main application page.** Contains the full Header bar, the AgentFlow canvas, Chat sidebar, Thinking drawer, Export/Code panels, Toast notifications, Screen flash effects. This is the heart of the app. |
| `src/pages/ArchivePage.tsx` | Workflow history / archive page. Displays past workflow runs. Accessible via the Archive button in the header. |

### Core Components

| File | Purpose |
|------|---------|
| `src/components/AgentFlow.tsx` | **The most important component.** Renders the force-directed agent graph with SVG connection lines, agent cards, search bar, FIT TO SCREEN / SAVE / RESET buttons. Handles mouse drag for repositioning agents, zoom via scale transform, data packet animations between agents. Has two modes: desktop (free-drag canvas) and mobile (vertical list). |
| `src/components/AgentCard.tsx` | Individual agent card displayed on the canvas. Shows agent icon, name, role, status badge, progress bar, METRICS/THINK/OUTPUT buttons, and latest output preview. Compact mode for mobile. |
| `src/components/ChatPanel.tsx` | Right-side chat sidebar. Displays messages between agents with colored avatars, timestamps. Scrollable with auto-scroll. |
| `src/components/ThinkingDrawer.tsx` | Slide-out panel showing an agent's step-by-step thinking process. Activated by clicking the THINK button on an agent card. |
| `src/components/PixelAvatar.tsx` | Pixel-art style emoji avatar component used throughout the UI. |
| `src/components/ScreenFlash.tsx` | Full-screen green flash effect triggered on workflow start. |
| `src/components/ToastNotification.tsx` | Toast notification system with queue management, auto-dismiss. |

### Effect Components (src/components/effects/)

| File | Purpose |
|------|---------|
| `src/components/effects/DataPacket.tsx` | Animated data packet that travels along SVG paths between agents when an agent completes its task. Creates the visual of "data flowing through the pipeline". |
| `src/components/effects/ParticleEffect.tsx` | Decorative particle effects for visual polish. |
| `src/components/effects/TypewriterText.tsx` | Typewriter text animation for displaying agent output character by character. |

### Panel Components (src/components/panels/)

| File | Purpose |
|------|---------|
| `src/components/panels/AgentMetrics.tsx` | Metrics display panel for an agent (execution time, token usage, success rate). |
| `src/components/panels/CodeBlock.tsx` | Syntax-highlighted code display panel using react-syntax-highlighter. |
| `src/components/panels/ExportPanel.tsx` | Export workflow results as markdown/JSON. Triggered by the Export button in the header. |
| `src/components/panels/ThemeSwitcher.tsx` | **Theme configuration.** Defines 4 color themes (hacker-green, deep-space, cyber-pink, ice-blue) with their color values. Each theme has primary, accent, background, foreground, card colors. The `ThemeName` type is exported from here. |
| `src/components/panels/Timeline.tsx` | Bottom timeline bar showing workflow execution progress with play/pause controls. |
| `src/components/panels/WorkflowSelector.tsx` | Dropdown for switching between different workflows. |

### Custom Hooks (src/hooks/)

| File | Purpose |
|------|---------|
| `src/hooks/useWorkflow.ts` | **Core data hook.** Currently uses `mockData.ts` as fallback. Manages workflow state: current round, agent list, running status. Provides `runWorkflow()` to start execution, `resetWorkflow()`, `nextRound()`, `prevRound()`. Returns `{ workflow, currentRoundIndex, isRunning, runWorkflow, resetWorkflow, nextRound, prevRound, activeAgentId }`. **This is what you need to replace with real API calls.** |
| `src/hooks/useForceLayout.ts` | **Layout engine.** Computes tree-based positions for agents using depth-first layout. Supports drag offsets persisted in localStorage. Returns `{ positions }` where each agent ID maps to `{ x, y }`. |
| `src/hooks/useMediaQuery.ts` | Mobile detection hook. Returns `isMobile` boolean based on screen width (< 768px). |
| `src/hooks/use-mobile.ts` | shadcn/ui internal hook for responsive breakpoints. |

### Types (src/types/)

| File | Purpose |
|------|---------|
| `src/types/agent.ts` | **Core TypeScript interfaces.** `Agent`, `AgentStep`, `AgentThinking`, `AgentOutput`, `AgentStatus`, `Round`, `Workflow`. This is the contract between frontend and backend. |

### Data / Mock (src/data/)

| File | Purpose |
|------|---------|
| `src/data/mockData.ts` | **16-agent mock dataset.** Defines a complete workflow with Coordinator, Research Lead, Market Analyst, Design Lead, UI Designer, Frontend Dev, Backend Dev, DevOps, QA Lead, Tech Writer, etc. Each with status, outputs, thinking steps, connections (DAG). **Replace this with API calls.** |
| `src/data/workflowFallbacks.ts` | Fallback workflow data when API fails. Used in `useWorkflow.ts`. |

### Lib (src/lib/)

| File | Purpose |
|------|---------|
| `src/lib/soundEngine.ts` | **8-bit sound effects engine.** Uses Web Audio API to generate square/sawtooth wave sounds. Methods: `click()`, `success()`, `error()`, `typing()`, `message()`, `openPanel()`, `closePanel()`, `statusChange()`. Toggle on/off with `toggle()`. No backend needed. |
| `src/lib/utils.ts` | Utility functions (cn() for className merging). |

### Styles

| File | Purpose |
|------|---------|
| `src/index.css` | **Critical.** Tailwind base + custom CSS. Contains CRT scanline effect, glow-border animation, agent-bloom pulse animation, pixel-burst click effects, chromatic-flash, pixel-font declarations. The visual identity lives here. |

### UI Components (src/components/ui/)

> Standard shadcn/ui primitives. Used throughout the app. Button, Dialog, Input, Badge, Card, Tabs, ScrollArea, etc. All are Radix UI primitives with Tailwind styling.

---

## What the Backend Needs to Provide

### Data Types (match `src/types/agent.ts`)

```typescript
// Key interfaces the frontend expects:

interface Agent {
  id: string;           // e.g. "coordinator"
  name: string;         // e.g. "Coordinator"
  role: string;         // e.g. "Project Lead"
  icon: string;         // emoji e.g. "👾"
  color: string;        // hex color e.g. "#22c55e"
  status: 'idle' | 'thinking' | 'done' | 'error';
  statusMessage: string; // e.g. "Planning workflow..."
  progress: number;      // 0-100
  outputs: AgentOutput[];
  thinking: AgentThinking;  // step-by-step reasoning
  position: { x: number; y: number };  // initial layout position
  connections: string[];  // IDs of downstream agents this one feeds into
}

interface Round {
  id: string;
  roundNumber: number;
  agents: Agent[];      // all agents in this round
  messages: AgentOutput[];  // inter-agent messages
  timestamp: number;
  status: 'running' | 'completed' | 'error';
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  rounds: Round[];
  currentRound: number;
}
```

### Required API Endpoints

| Method | Endpoint | Returns | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/workflows` | `Workflow[]` | List all available workflows |
| `GET` | `/api/workflows/:id` | `Workflow` | Get a specific workflow with all rounds and agents |
| `POST` | `/api/workflows/:id/run` | `{ roundId: string }` | Start executing the current round. Backend should run agents asynchronously and push status updates via WebSocket. |
| `POST` | `/api/workflows/:id/reset` | `Workflow` | Reset workflow to initial state |
| `GET` | `/api/workflows/:id/agents` | `Agent[]` | Get all agents for the current round |
| `GET` | `/api/workflows/:id/agents/:agentId` | `Agent` | Get single agent details |
| `GET` | `/api/workflows/:id/agents/:agentId/outputs` | `AgentOutput[]` | Get agent outputs |
| `GET` | `/api/workflows/:id/agents/:agentId/thinking` | `AgentThinking` | Get agent thinking steps |
| `GET` | `/api/workflows/:id/messages` | `AgentOutput[]` | Get inter-agent messages for chat panel |
| `POST` | `/api/workflows/:id/chat` | `{ message: AgentOutput }` | Send a message to the workflow (user intervention) |
| `GET` | `/api/workflows/:id/history` | `Workflow[]` | Get execution history / archive |

### WebSocket Events (Real-time)

The frontend listens for these WebSocket events to update agent status in real-time:

| Event | Payload | Frontend Action |
|-------|---------|-----------------|
| `agent.status` | `{ agentId, status, progress, statusMessage }` | Update progress bar and status badge |
| `agent.thinking` | `{ agentId, steps, rawThoughts }` | Update thinking drawer content |
| `agent.output` | `{ agentId, output }` | Append to agent outputs, trigger data packet animation |
| `agent.complete` | `{ agentId }` | Set status to 'done', trigger success sound + data packet |
| `agent.error` | `{ agentId, error }` | Set status to 'error', show toast |
| `round.complete` | `{ roundId }` | Round finished, enable next round |
| `workflow.complete` | `{ workflowId }` | Entire workflow done |
| `message` | `{ agentId, content, timestamp }` | Append to chat panel |

### How It Works (Data Flow)

```
1. Page loads
   -> Home.tsx mounts
   -> useWorkflow() fetches workflow data (currently from mockData.ts)
   -> useForceLayout() computes tree positions for agents
   -> AgentFlow renders SVG lines + AgentCards at computed positions

2. User clicks START
   -> handleRunWorkflow() calls runWorkflow() from useWorkflow
   -> SHOULD BE: POST /api/workflows/:id/run
   -> Backend executes agents asynchronously
   -> WebSocket pushes agent.status events
   -> Agent cards update progress bars in real-time
   -> When agent completes, data packet animates along SVG path

3. User drags an agent card
   -> drag offset saved to localStorage
   -> useForceLayout applies offset to tree position
   -> SVG lines recalculate from new positions

4. User clicks THINK on an agent
   -> ThinkingDrawer slides out
   -> SHOULD BE: GET /api/workflows/:id/agents/:agentId/thinking
   -> Displays step-by-step reasoning

5. User clicks CHAT
   -> ChatPanel opens
   -> SHOULD BE: GET /api/workflows/:id/messages
   -> Displays inter-agent conversation
```

### localStorage Keys Used

| Key | Content | Purpose |
|-----|---------|---------|
| `pixelagent_layout_v2` | `{ dragOffsets, collapsedNodes, savedAt }` | Saved drag positions and fold state |
| `pixelagent_theme` | `ThemeName` string | Selected color theme |

---

## Key Frontend Features (already implemented)

- **CRT scanline overlay** via CSS pseudo-element
- **8-bit sound effects** on every button click / panel open / workflow action
- **Free-drag agent repositioning** with localStorage persistence
- **Tree-based force layout** using d3-force with depth-column alignment
- **SVG animated connection lines** with glow pulse and traveling dot animation
- **Data packet animation** between agents on task completion
- **4 color themes** switchable in real-time via header squares
- **Search/filter** agents by name/role
- **Collapse/expand** agent subtrees
- **Keyboard shortcuts**: R=Run, E=Export, C=Chat, M=Mute, +/- Zoom, 0=Reset Zoom, Esc=Close, ?=Help
- **Mobile responsive** with tab bar navigation
- **Zoom controls** in header (80% default)
- **FIT TO SCREEN** button auto-scales to fit all agents in viewport
- **SAVE / RESET** layout buttons for drag positions

---

## Build Commands

```bash
npm install
npm run dev      # Dev server on localhost:5173
npm run build    # Production build to dist/public/
npm run preview  # Preview production build
```

## Notes for Backend Development

1. **Agent connections define the DAG.** The `connections` array on each Agent determines the SVG lines drawn between cards. The frontend builds a tree from these connections for layout purposes.

2. **The frontend expects Agent statuses to transition:** idle -> thinking -> done/error. The progress field (0-100) drives the progress bar animation.

3. **Thinking data** should be streamed as the agent works. Each step has an id, title, description, status (pending/active/completed/error), and timestamp.

4. **Messages** in the chat panel come from AgentOutput objects with type='info'. User messages should be injected into the same array.

5. **Round-based execution:** A workflow has multiple rounds. Each round has its own set of agents. The frontend shows "R 1/N" in the header with prev/next buttons.

6. **Sound is purely client-side.** The soundEngine.ts uses Web Audio API directly. No backend audio needed.

7. **Theme switching** is purely client-side. The `themes` object in ThemeSwitcher.tsx defines all 4 themes. Just switch the `themeName` state in Home.tsx.
