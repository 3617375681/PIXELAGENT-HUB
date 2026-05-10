import type { Workflow, Agent, AgentOutput, AgentStep } from '../types/agent';

// ============================================================
// 扩展 Weather 团队 — 16 个 Agent，4 层结构
// ============================================================

const createSteps = (agentId: string): AgentStep[] => {
  const stepsMap: Record<string, AgentStep[]> = {
    'coordinator': [
      { id: 'c1', title: 'Receive Task', description: 'Received user request for pixel weather dashboard', status: 'completed', timestamp: Date.now() - 8000 },
      { id: 'c2', title: 'Decompose', description: 'Broke into 4 teams: Research, Design, Code, QA', status: 'completed', timestamp: Date.now() - 6000 },
      { id: 'c3', title: 'Dispatch', description: 'Sent tasks to all team leads', status: 'completed', timestamp: Date.now() - 4000 },
      { id: 'c4', title: 'Monitor', description: '14/14 agents reported completion', status: 'completed', timestamp: Date.now() - 2000 },
      { id: 'c5', title: 'Assemble', description: 'Merged code, docs, and review into release', status: 'completed', timestamp: Date.now() - 500 },
    ],
    'research-lead': [
      { id: 'rl1', title: 'Scope Research', description: 'Defined research targets: APIs, market, competitors', status: 'completed', timestamp: Date.now() - 5500 },
      { id: 'rl2', title: 'Assign Analysts', description: 'Dispatched API Explorer, Market Analyst, Competitor Scout', status: 'completed', timestamp: Date.now() - 3500 },
      { id: 'rl3', title: 'Synthesize', description: 'Compiled findings into unified research report', status: 'completed', timestamp: Date.now() - 1500 },
    ],
    'api-explorer': [
      { id: 'ae1', title: 'Search APIs', description: 'Evaluated OpenWeatherMap, WeatherAPI, VisualCrossing', status: 'completed', timestamp: Date.now() - 5000 },
      { id: 'ae2', title: 'Test Endpoints', description: 'Verified response schemas and rate limits', status: 'completed', timestamp: Date.now() - 3000 },
      { id: 'ae3', title: 'Document', description: 'Created TypeScript interfaces for all endpoints', status: 'completed', timestamp: Date.now() - 1000 },
    ],
    'market-analyst': [
      { id: 'ma1', title: 'Collect Data', description: 'Scraped 50+ weather app reviews', status: 'completed', timestamp: Date.now() - 4500 },
      { id: 'ma2', title: 'Identify Trends', description: 'Top requests: real-time, alerts, widgets', status: 'completed', timestamp: Date.now() - 2500 },
    ],
    'competitor-scout': [
      { id: 'cs1', title: 'Map Landscape', description: 'Analyzed 8 competitor weather apps', status: 'completed', timestamp: Date.now() - 4000 },
      { id: 'cs2', title: 'Find Gaps', description: 'No pixel-themed weather app found — opportunity!', status: 'completed', timestamp: Date.now() - 2000 },
    ],
    'design-lead': [
      { id: 'dl1', title: 'Define Vision', description: '8-bit pixel aesthetic, neon green on dark', status: 'completed', timestamp: Date.now() - 5000 },
      { id: 'dl2', title: 'Assign Designers', description: 'Dispatched UI Designer and UX Researcher', status: 'completed', timestamp: Date.now() - 3000 },
      { id: 'dl3', title: 'Approve Designs', description: 'Approved all component specs', status: 'completed', timestamp: Date.now() - 1000 },
    ],
    'ui-designer': [
      { id: 'ui1', title: 'Create Palette', description: 'Defined color system: #22c55e neon, #0d0d1a dark', status: 'completed', timestamp: Date.now() - 4500 },
      { id: 'ui2', title: 'Design Components', description: 'WeatherCard, ForecastList, CitySearch, LoadingSpinner', status: 'completed', timestamp: Date.now() - 2500 },
    ],
    'ux-researcher': [
      { id: 'ux1', title: 'Map User Flow', description: 'Search → CityCard → Forecast → Details', status: 'completed', timestamp: Date.now() - 4000 },
      { id: 'ux2', title: 'Define States', description: 'Loading, Error, Empty, Success states designed', status: 'completed', timestamp: Date.now() - 2000 },
    ],
    'code-lead': [
      { id: 'cl1', title: 'Design Architecture', description: 'React 19 + TypeScript + Vite stack', status: 'completed', timestamp: Date.now() - 5500 },
      { id: 'cl2', title: 'Assign Devs', description: 'Frontend, Backend, DevOps dispatched', status: 'completed', timestamp: Date.now() - 3500 },
      { id: 'cl3', title: 'Code Review', description: 'Approved all PRs, 0 critical issues', status: 'completed', timestamp: Date.now() - 1500 },
    ],
    'frontend-dev': [
      { id: 'fe1', title: 'Setup Project', description: 'npx create-react-app with TypeScript template', status: 'completed', timestamp: Date.now() - 5000 },
      { id: 'fe2', title: 'Build Hooks', description: 'useWeather with react-query caching', status: 'completed', timestamp: Date.now() - 3000 },
      { id: 'fe3', title: 'Build UI', description: 'All 4 components with pixel styling', status: 'completed', timestamp: Date.now() - 1000 },
    ],
    'backend-dev': [
      { id: 'be1', title: 'Design API', description: 'REST endpoints for weather data', status: 'completed', timestamp: Date.now() - 4500 },
      { id: 'be2', title: 'Implement', description: 'Proxy + caching + error handling', status: 'completed', timestamp: Date.now() - 2500 },
    ],
    'devops-engineer': [
      { id: 'do1', title: 'Setup CI/CD', description: 'GitHub Actions workflow configured', status: 'completed', timestamp: Date.now() - 4000 },
      { id: 'do2', title: 'Deploy', description: 'Deployed to Vercel with preview branches', status: 'completed', timestamp: Date.now() - 2000 },
    ],
    'qa-lead': [
      { id: 'qa1', title: 'Plan Tests', description: 'Unit + Integration + E2E test plan', status: 'completed', timestamp: Date.now() - 3500 },
      { id: 'qa2', title: 'Run Tests', description: '42 tests, all passed', status: 'completed', timestamp: Date.now() - 1500 },
    ],
    'security-auditor': [
      { id: 'sa1', title: 'Audit Code', description: 'ESLint + security scan + dependency check', status: 'completed', timestamp: Date.now() - 3000 },
      { id: 'sa2', title: 'Report', description: '0 vulnerabilities, 2 low-priority suggestions', status: 'completed', timestamp: Date.now() - 1000 },
    ],
    'tech-writer': [
      { id: 'tw1', title: 'Read Codebase', description: 'Analyzed 8 files, 1124 lines', status: 'completed', timestamp: Date.now() - 2500 },
      { id: 'tw2', title: 'Write Docs', description: 'README + API docs + Changelog complete', status: 'completed', timestamp: Date.now() - 500 },
    ],
    'release-manager': [
      { id: 'rm1', title: 'Package', description: 'Bundled app + docs + tests', status: 'completed', timestamp: Date.now() - 2000 },
      { id: 'rm2', title: 'Tag Release', description: 'v1.0.0 tagged and published', status: 'completed', timestamp: Date.now() - 500 },
    ],
  };
  return stepsMap[agentId] || [];
};

const createOutputs = (agentId: string): AgentOutput[] => {
  const outputsMap: Record<string, AgentOutput[]> = {
    'coordinator': [
      { id: 'o1', agentId: 'coordinator', content: '📋 Task received: "Build pixel-style React weather dashboard"', timestamp: Date.now() - 8000, type: 'info' },
      { id: 'o2', agentId: 'coordinator', content: '✅ Decomposed into 4 teams: Research(3) → Design(2) → Code(3) → QA(4)', timestamp: Date.now() - 6000, type: 'info' },
      { id: 'o3', agentId: 'coordinator', content: '📡 All 14 agents dispatched and working...', timestamp: Date.now() - 4000, type: 'info' },
      { id: 'o4', agentId: 'coordinator', content: '🔬 Research team complete. API selected, market analyzed.', timestamp: Date.now() - 2500, type: 'info' },
      { id: 'o5', agentId: 'coordinator', content: '🎨 Design team complete. UI specs and user flows ready.', timestamp: Date.now() - 2000, type: 'info' },
      { id: 'o6', agentId: 'coordinator', content: '💻 Code team complete. 8 files, 1124 lines, build passed.', timestamp: Date.now() - 1200, type: 'info' },
      { id: 'o7', agentId: 'coordinator', content: '🛡️ QA team complete. 0 vulnerabilities, all tests green.', timestamp: Date.now() - 600, type: 'info' },
      { id: 'o8', agentId: 'coordinator', content: '🎉 v1.0.0 shipped! All deliverables ready.', timestamp: Date.now() - 100, type: 'output' },
    ],
    'research-lead': [
      { id: 'rl_o1', agentId: 'research-lead', content: '🔬 Research scope defined: APIs, market trends, competitors', timestamp: Date.now() - 5500, type: 'info' },
      { id: 'rl_o2', agentId: 'research-lead', content: '📊 Research report compiled: 3 analysts, 12 findings', timestamp: Date.now() - 1500, type: 'output' },
    ],
    'api-explorer': [
      { id: 'ae_o1', agentId: 'api-explorer', content: '🔍 Evaluated 4 weather APIs', timestamp: Date.now() - 5000, type: 'info' },
      { id: 'ae_o2', agentId: 'api-explorer', content: '✅ Selected: OpenWeatherMap (1000/day free, excellent docs)', timestamp: Date.now() - 3000, type: 'output' },
      { id: 'ae_o3', agentId: 'api-explorer', content: '```typescript\ninterface WeatherData {\n  city: string;\n  temp: number;\n  humidity: number;\n  wind: number;\n}\n```', timestamp: Date.now() - 1000, type: 'output' },
    ],
    'market-analyst': [
      { id: 'ma_o1', agentId: 'market-analyst', content: '📊 Analyzed 50+ app reviews', timestamp: Date.now() - 4500, type: 'info' },
      { id: 'ma_o2', agentId: 'market-analyst', content: '🔑 Top user requests: real-time updates, severe weather alerts, home screen widgets', timestamp: Date.now() - 2500, type: 'output' },
    ],
    'competitor-scout': [
      { id: 'cs_o1', agentId: 'competitor-scout', content: '🔍 Mapped 8 competitor weather apps', timestamp: Date.now() - 4000, type: 'info' },
      { id: 'cs_o2', agentId: 'competitor-scout', content: '💡 Gap found: No pixel-themed weather app exists — differentiation opportunity!', timestamp: Date.now() - 2000, type: 'output' },
    ],
    'design-lead': [
      { id: 'dl_o1', agentId: 'design-lead', content: '🎨 Vision: 8-bit pixel aesthetic with neon accents', timestamp: Date.now() - 5000, type: 'info' },
      { id: 'dl_o2', agentId: 'design-lead', content: '📐 All design specs approved and exported to Figma', timestamp: Date.now() - 1000, type: 'output' },
    ],
    'ui-designer': [
      { id: 'ui_o1', agentId: 'ui-designer', content: '🖌️ Color system defined: #22c55e neon, #0d0d1a dark, pixel-grid bg', timestamp: Date.now() - 4500, type: 'info' },
      { id: 'ui_o2', agentId: 'ui-designer', content: '📦 Component library: WeatherCard, ForecastList, CitySearch, PixelSpinner', timestamp: Date.now() - 2500, type: 'output' },
    ],
    'ux-researcher': [
      { id: 'ux_o1', agentId: 'ux-researcher', content: '🧪 User flow mapped: Search → Results → Detail → Forecast', timestamp: Date.now() - 4000, type: 'info' },
      { id: 'ux_o2', agentId: 'ux-researcher', content: '📋 State definitions: Loading ✓ Error ✓ Empty ✓ Success ✓', timestamp: Date.now() - 2000, type: 'output' },
    ],
    'code-lead': [
      { id: 'cl_o1', agentId: 'code-lead', content: '⌨️ Stack: React 19 + TypeScript + Vite + Tailwind CSS', timestamp: Date.now() - 5500, type: 'info' },
      { id: 'cl_o2', agentId: 'code-lead', content: '✅ All PRs merged. Build clean, 0 critical issues.', timestamp: Date.now() - 1000, type: 'output' },
    ],
    'frontend-dev': [
      { id: 'fe_o1', agentId: 'frontend-dev', content: '⚛️ Project scaffolded with Vite + React 19 + TypeScript', timestamp: Date.now() - 5000, type: 'info' },
      { id: 'fe_o2', agentId: 'frontend-dev', content: '🪝 useWeather hook: react-query with 5min staleTime, error boundary', timestamp: Date.now() - 3000, type: 'info' },
      { id: 'fe_o3', agentId: 'frontend-dev', content: '✅ 4 pixel-styled components built. 847 lines, 0 TS errors.', timestamp: Date.now() - 1000, type: 'output' },
    ],
    'backend-dev': [
      { id: 'be_o1', agentId: 'backend-dev', content: '🔧 API proxy built: /api/weather?q={city}', timestamp: Date.now() - 4500, type: 'info' },
      { id: 'be_o2', agentId: 'backend-dev', content: '✅ Caching + rate limiting + error handling implemented', timestamp: Date.now() - 2500, type: 'output' },
    ],
    'devops-engineer': [
      { id: 'do_o1', agentId: 'devops-engineer', content: '🚀 GitHub Actions CI/CD pipeline configured', timestamp: Date.now() - 4000, type: 'info' },
      { id: 'do_o2', agentId: 'devops-engineer', content: '✅ Auto-deploy to Vercel on push. Preview branches enabled.', timestamp: Date.now() - 2000, type: 'output' },
    ],
    'qa-lead': [
      { id: 'qa_o1', agentId: 'qa-lead', content: '🧪 Test plan: 42 cases (unit + integration + E2E)', timestamp: Date.now() - 3500, type: 'info' },
      { id: 'qa_o2', agentId: 'qa-lead', content: '✅ All 42 tests passed. Coverage: 94%.', timestamp: Date.now() - 1500, type: 'output' },
    ],
    'security-auditor': [
      { id: 'sa_o1', agentId: 'security-auditor', content: '🛡️ Security audit: ESLint + Snyk + dependency check', timestamp: Date.now() - 3000, type: 'info' },
      { id: 'sa_o2', agentId: 'security-auditor', content: '✅ 0 vulnerabilities. 2 low-priority: remove console.logs, add CSP header.', timestamp: Date.now() - 1000, type: 'output' },
    ],
    'tech-writer': [
      { id: 'tw_o1', agentId: 'tech-writer', content: '📖 README: 620 words, setup + usage + screenshots', timestamp: Date.now() - 2500, type: 'info' },
      { id: 'tw_o2', agentId: 'tech-writer', content: '📄 CHANGELOG v1.0.0 published with feature list', timestamp: Date.now() - 500, type: 'output' },
    ],
    'release-manager': [
      { id: 'rm_o1', agentId: 'release-manager', content: '📦 Release bundle: app + docs + tests + config', timestamp: Date.now() - 2000, type: 'info' },
      { id: 'rm_o2', agentId: 'release-manager', content: '🏷️ v1.0.0 tagged. Release notes published.', timestamp: Date.now() - 500, type: 'output' },
    ],
  };
  return outputsMap[agentId] || [];
};

const createThinking = (agentId: string) => {
  const steps = createSteps(agentId);
  const thoughtsMap: Record<string, string> = {
    'coordinator': 'Orchestrated 14 agents across 4 teams. Research selected OpenWeatherMap. Design created pixel UI system. Code delivered 1124 lines. QA approved with 94% coverage.',
    'research-lead': 'Led 3 researchers. API Explorer found best weather API. Market Analyst identified user needs. Competitor Scout found differentiation gap.',
    'api-explorer': 'Compared 4 APIs on docs quality, free tier, reliability. OpenWeatherMap won unanimously. Documented all endpoints with TypeScript types.',
    'market-analyst': 'Analyzed 50+ reviews. Top features: real-time, alerts, widgets. Users want speed and accuracy over fancy UI.',
    'competitor-scout': 'No pixel-themed weather app exists in the market. Clear differentiation opportunity.',
    'design-lead': 'Defined 8-bit pixel vision. Approved UI specs and user flows from both designers.',
    'ui-designer': 'Created full color system and 4 pixel-styled components with exact dimensions.',
    'ux-researcher': 'Mapped complete user journey with all edge states. Ensured accessibility considerations.',
    'code-lead': 'Set React 19 + TS + Vite stack. Reviewed all PRs. 0 critical issues, clean build.',
    'frontend-dev': 'Built useWeather hook with caching, then all 4 UI components following pixel design system exactly.',
    'backend-dev': 'Built proxy API with OpenWeatherMap. Added caching and error handling.',
    'devops-engineer': 'CI/CD pipeline auto-deploys to Vercel. Preview branches for every PR.',
    'qa-lead': '42 tests covering all components and API layer. 94% coverage, all green.',
    'security-auditor': '0 vulnerabilities found. 2 suggestions: remove dev console.logs and add Content-Security-Policy header.',
    'tech-writer': 'Analyzed 8 source files. Produced README, API docs, and changelog totaling 620+ words.',
    'release-manager': 'Packaged app, docs, tests, and config. Tagged v1.0.0 and published release notes.',
  };
  return { agentId, steps, rawThoughts: thoughtsMap[agentId] || '' };
};

// 16 agents, 4 layers
export const createWeatherAgents = (): Agent[] => [
  {
    id: 'coordinator', name: 'Coordinator', role: 'Task Manager', icon: '👾', color: '#00d4ff',
    status: 'done', statusMessage: 'Workflow complete', progress: 100,
    outputs: createOutputs('coordinator'), thinking: createThinking('coordinator'),
    position: { x: 50, y: 10 }, connections: ['research-lead', 'design-lead', 'code-lead', 'tech-writer', 'release-manager'],
  },
  {
    id: 'research-lead', name: 'Research Lead', role: 'R&D Director', icon: '🔬', color: '#a855f7',
    status: 'done', statusMessage: 'Research phase complete', progress: 100,
    outputs: createOutputs('research-lead'), thinking: createThinking('research-lead'),
    position: { x: 15, y: 30 }, connections: ['api-explorer', 'market-analyst', 'competitor-scout'],
  },
  {
    id: 'design-lead', name: 'Design Lead', role: 'Creative Director', icon: '🎨', color: '#ec4899',
    status: 'done', statusMessage: 'Design system ready', progress: 100,
    outputs: createOutputs('design-lead'), thinking: createThinking('design-lead'),
    position: { x: 50, y: 30 }, connections: ['ui-designer', 'ux-researcher'],
  },
  {
    id: 'code-lead', name: 'Tech Lead', role: 'Engineering Lead', icon: '⌨️', color: '#22c55e',
    status: 'done', statusMessage: 'Architecture defined', progress: 100,
    outputs: createOutputs('code-lead'), thinking: createThinking('code-lead'),
    position: { x: 85, y: 30 }, connections: ['frontend-dev', 'backend-dev', 'devops-engineer', 'qa-lead', 'security-auditor'],
  },
  {
    id: 'api-explorer', name: 'API Explorer', role: 'API Specialist', icon: '🌐', color: '#8b5cf6',
    status: 'done', statusMessage: 'APIs mapped', progress: 100,
    outputs: createOutputs('api-explorer'), thinking: createThinking('api-explorer'),
    position: { x: 5, y: 55 }, connections: [],
  },
  {
    id: 'market-analyst', name: 'Market Analyst', role: 'Data Analyst', icon: '📊', color: '#a855f7',
    status: 'done', statusMessage: 'Market data collected', progress: 100,
    outputs: createOutputs('market-analyst'), thinking: createThinking('market-analyst'),
    position: { x: 20, y: 55 }, connections: [],
  },
  {
    id: 'competitor-scout', name: 'Competitor Scout', role: 'Competitive Intel', icon: '🔍', color: '#c084fc',
    status: 'done', statusMessage: 'Competitors mapped', progress: 100,
    outputs: createOutputs('competitor-scout'), thinking: createThinking('competitor-scout'),
    position: { x: 35, y: 55 }, connections: [],
  },
  {
    id: 'ui-designer', name: 'UI Designer', role: 'Visual Designer', icon: '🖌️', color: '#f472b6',
    status: 'done', statusMessage: 'UI specs done', progress: 100,
    outputs: createOutputs('ui-designer'), thinking: createThinking('ui-designer'),
    position: { x: 42, y: 55 }, connections: [],
  },
  {
    id: 'ux-researcher', name: 'UX Researcher', role: 'User Researcher', icon: '🧪', color: '#f9a8d4',
    status: 'done', statusMessage: 'User flows defined', progress: 100,
    outputs: createOutputs('ux-researcher'), thinking: createThinking('ux-researcher'),
    position: { x: 58, y: 55 }, connections: [],
  },
  {
    id: 'frontend-dev', name: 'Frontend Dev', role: 'React Engineer', icon: '⚛️', color: '#4ade80',
    status: 'done', statusMessage: 'Components built', progress: 100,
    outputs: createOutputs('frontend-dev'), thinking: createThinking('frontend-dev'),
    position: { x: 68, y: 55 }, connections: [],
  },
  {
    id: 'backend-dev', name: 'Backend Dev', role: 'API Engineer', icon: '🔧', color: '#22c55e',
    status: 'done', statusMessage: 'API endpoints live', progress: 100,
    outputs: createOutputs('backend-dev'), thinking: createThinking('backend-dev'),
    position: { x: 83, y: 55 }, connections: [],
  },
  {
    id: 'devops-engineer', name: 'DevOps', role: 'Infra Engineer', icon: '🚀', color: '#86efac',
    status: 'done', statusMessage: 'CI/CD ready', progress: 100,
    outputs: createOutputs('devops-engineer'), thinking: createThinking('devops-engineer'),
    position: { x: 98, y: 55 }, connections: [],
  },
  {
    id: 'qa-lead', name: 'QA Lead', role: 'Quality Engineer', icon: '🧪', color: '#f59e0b',
    status: 'done', statusMessage: 'Tests passed', progress: 100,
    outputs: createOutputs('qa-lead'), thinking: createThinking('qa-lead'),
    position: { x: 25, y: 80 }, connections: [],
  },
  {
    id: 'security-auditor', name: 'Security Auditor', role: 'Security Engineer', icon: '🛡️', color: '#ef4444',
    status: 'done', statusMessage: 'No vulnerabilities', progress: 100,
    outputs: createOutputs('security-auditor'), thinking: createThinking('security-auditor'),
    position: { x: 45, y: 80 }, connections: [],
  },
  {
    id: 'tech-writer', name: 'Tech Writer', role: 'Documentation Lead', icon: '📝', color: '#06b6d4',
    status: 'done', statusMessage: 'Docs published', progress: 100,
    outputs: createOutputs('tech-writer'), thinking: createThinking('tech-writer'),
    position: { x: 65, y: 80 }, connections: [],
  },
  {
    id: 'release-manager', name: 'Release Mgr', role: 'Delivery Lead', icon: '📦', color: '#d946ef',
    status: 'done', statusMessage: 'v1.0 shipped', progress: 100,
    outputs: createOutputs('release-manager'), thinking: createThinking('release-manager'),
    position: { x: 85, y: 80 }, connections: [],
  },
];

export const mockAgents = createWeatherAgents();

// Create a round
const createRound = (roundNumber: number, agents: Agent[], customMessages?: AgentOutput[]): import('../types/agent').Round => {
  const baseMessages: AgentOutput[] = [
    { id: 'm1', agentId: 'coordinator', content: `📋 Round ${roundNumber} started: 14 agents dispatched`, timestamp: Date.now() - 8000, type: 'info' },
    { id: 'm2', agentId: 'coordinator', content: '📡 Research Lead: 3 analysts searching APIs + market + competitors', timestamp: Date.now() - 6000, type: 'info' },
    { id: 'm3', agentId: 'coordinator', content: '🎨 Design Lead: 2 designers working on pixel UI system', timestamp: Date.now() - 5000, type: 'info' },
    { id: 'm4', agentId: 'coordinator', content: '💻 Tech Lead: 3 engineers building React + API + DevOps', timestamp: Date.now() - 4500, type: 'info' },
    { id: 'm5', agentId: 'coordinator', content: '🔬 Research team complete. OpenWeatherMap selected. Market gap found.', timestamp: Date.now() - 3000, type: 'output' },
    { id: 'm6', agentId: 'coordinator', content: "🎨 Design team complete. 4 pixel components spec'd.", timestamp: Date.now() - 2500, type: 'output' },
    { id: 'm7', agentId: 'coordinator', content: '💻 Code team complete. 1124 lines, build green.', timestamp: Date.now() - 1800, type: 'output' },
    { id: 'm8', agentId: 'coordinator', content: '🛡️ QA team complete. 0 vulnerabilities, 42 tests passed.', timestamp: Date.now() - 1000, type: 'output' },
    { id: 'm9', agentId: 'coordinator', content: `🎉 Round ${roundNumber} complete! v1.0.0 shipped.`, timestamp: Date.now() - 200, type: 'output' },
  ];

  return {
    id: `round-${roundNumber}`,
    roundNumber,
    agents: agents.map(a => ({ ...a })),
    messages: customMessages || baseMessages,
    timestamp: Date.now(),
    status: 'completed' as const,
  };
};

// Create workflow
export const createWorkflow = (id: string, name: string, description: string, rounds: number): Workflow => {
  const agents = createWeatherAgents();
  const workflowRounds = Array.from({ length: rounds }, (_, i) => {
    const roundAgents = agents.map(a => ({
      ...a,
      status: i === 0 ? ('done' as const) : ('idle' as const),
      progress: i === 0 ? 100 : 0,
      statusMessage: i === 0 ? 'Complete' : 'Waiting...',
    }));
    return createRound(i + 1, roundAgents);
  });

  return {
    id,
    name,
    description,
    rounds: workflowRounds,
    currentRound: rounds,
  };
};

// Multiple workflows
export const workflows: Workflow[] = [
  createWorkflow('wf-weather', 'Pixel Weather App', 'Build a pixel-style React weather dashboard with 5-day forecast', 3),
  createWorkflow('wf-scraper', 'Web Data Scraper', 'Create a multi-site product price comparison scraper with anti-bot handling', 2),
  createWorkflow('wf-analytics', 'Data Analytics Pipeline', 'Build an analytics dashboard that processes CSV and generates charts', 2),
  createWorkflow('wf-chatbot', 'AI Customer Support', 'Develop an intelligent customer support chatbot with knowledge base', 2),
];

export const demoThinkingAnimation = (agentId: string): AgentStep[] => {
  return [
    { id: 't1', title: 'Analyzing...', description: `${agentId} is processing input data...`, status: 'active', timestamp: Date.now() },
    { id: 't2', title: 'Reasoning...', description: 'Evaluating possible approaches...', status: 'pending', timestamp: Date.now() },
    { id: 't3', title: 'Deciding...', description: 'Selecting optimal solution path...', status: 'pending', timestamp: Date.now() },
    { id: 't4', title: 'Outputting...', description: 'Formulating response...', status: 'pending', timestamp: Date.now() },
  ];
};

export const codeSnippets: Record<string, string> = {
  weatherApi: `export const getWeather = async (city: string): Promise<WeatherData> => {
  const response = await fetch(
    \`https://api.openweathermap.org/data/2.5/weather?q=\${city}&appid=\${API_KEY}&units=metric\`
  );
  if (!response.ok) throw new Error('Failed to fetch weather');
  return response.json();
};`,
  useWeatherHook: `export const useWeather = (city: string) => {
  return useQuery({
    queryKey: ['weather', city],
    queryFn: () => getWeather(city),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};`,
  weatherCard: `export const WeatherCard: React.FC<{ data: WeatherData }> = ({ data }) => {
  return (
    <div className="pixel-card p-4">
      <h2 className="pixel-font text-sm">{data.city}</h2>
      <p className="pixel-font-body text-2xl">{data.temp}°C</p>
      <p className="text-xs opacity-60">{data.condition}</p>
    </div>
  );
};`,
};
