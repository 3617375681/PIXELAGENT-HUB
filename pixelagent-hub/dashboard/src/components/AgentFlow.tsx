import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Agent } from '../types/agent';
import { AgentCard } from './AgentCard';
import { DataPacketAnimation } from './effects/DataPacket';
import { useForceLayout } from '../hooks/useForceLayout';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { Zap, ArrowRight, Search, X, ChevronDown, ChevronRight } from 'lucide-react';

interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  glow: string;
}

interface AgentFlowProps {
  agents: Agent[];
  activeAgentId: string | null;
  onSelectAgent: (agent: Agent) => void;
  onShowThinking: (agent: Agent) => void;
  theme: ThemeConfig;
  isRunning: boolean;
  isMobile?: boolean;
  scale: number;
  onScaleChange?: (s: number) => void;
}

const CARD_W = 240;
const CARD_H = 200;
const STORAGE_KEY = 'pixelagent_layout_v2';
const PADDING = 120;
const CONTENT_W = 3000;
const CONTENT_H = 3000;

export const AgentFlow: React.FC<AgentFlowProps> = ({
  agents, activeAgentId, onSelectAgent, onShowThinking, theme, isRunning, isMobile = false, scale, onScaleChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 });
  const prefersReducedMotion = usePrefersReducedMotion();

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        return config.dragOffsets || {};
      }
    } catch { /* ignore */ }
    return {};
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [lines, setLines] = useState<Array<{
    id: string; x1: number; y1: number; x2: number; y2: number;
    cx1: number; cy1: number; cx2: number; cy2: number;
    color: string; active: boolean; dashed: boolean;
  }>>([]);
  const [dataPackets, setDataPackets] = useState<Array<{
    id: string; from: { x: number; y: number }; to: { x: number; y: number };
    color: string; icon: string;
  }>>([]);

  // Force layout engine
  const { positions } = useForceLayout(agents, collapsedNodes, dragOverrides);

  // Build tree for search/visibility logic
  const treeResult = React.useMemo(() => {
    const nodes: Record<string, { id: string; children: string[]; parent: string | null; depth: number }> = {};
    const inDegree: Record<string, number> = {};
    agents.forEach((a) => {
      nodes[a.id] = { id: a.id, children: [], parent: null, depth: 0 };
      inDegree[a.id] = 0;
    });
    agents.forEach((a) => {
      a.connections.forEach((tid) => { if (nodes[tid]) inDegree[tid]++; });
    });
    const visited = new Set<string>();
    agents.forEach((a) => {
      a.connections.forEach((tid) => {
        if (nodes[tid] && !visited.has(tid)) {
          nodes[a.id].children.push(tid);
          nodes[tid].parent = a.id;
          visited.add(tid);
        }
      });
    });
    const roots = agents.filter((a) => inDegree[a.id] === 0).map((a) => a.id);
    if (roots.length === 0 && agents.length > 0) roots.push(agents[0].id);

    // BFS depth
    const queue = [...roots];
    roots.forEach((r) => (nodes[r].depth = 0));
    const seen = new Set<string>(roots);
    while (queue.length) {
      const cur = queue.shift()!;
      nodes[cur].children.forEach((childId) => {
        if (!seen.has(childId)) {
          seen.add(childId);
          nodes[childId].depth = nodes[cur].depth + 1;
          queue.push(childId);
        }
      });
    }

    const order: string[] = [];
    function dfs(id: string) { order.push(id); nodes[id].children.forEach((c) => dfs(c)); }
    roots.forEach((r) => dfs(r));

    return { nodes, roots, order };
  }, [agents]);

  const treeNodes = treeResult.nodes;
  const order = treeResult.order;

  // Search filter
  const visibleAgentIds = React.useMemo(() => {
    const baseIds = new Set(order);
    if (!searchQuery.trim()) return baseIds;
    const q = searchQuery.toLowerCase();
    const matchIds = agents.filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)).map((a) => a.id);
    if (matchIds.length === 0) return baseIds;
    const keep = new Set<string>();
    matchIds.forEach((mid) => {
      let cur: string | null = mid;
      while (cur) { keep.add(cur); cur = treeNodes[cur]?.parent ?? null; }
      function addDesc(id: string) { keep.add(id); treeNodes[id]?.children.forEach(addDesc); }
      addDesc(mid);
    });
    return new Set([...baseIds].filter((id) => keep.has(id)));
  }, [agents, order, treeNodes, searchQuery]);

  // Highlight path
  const highlightPath = React.useMemo(() => {
    if (!activeAgentId || !isRunning) return new Set<string>();
    const path: string[] = [];
    let cur: string | null = activeAgentId;
    while (cur) {
      path.unshift(cur);
      cur = treeNodes[cur]?.parent ?? null;
    }
    return new Set(path);
  }, [activeAgentId, isRunning, treeNodes]);

  // Compute lines from positions (include bounds offset for alignment with rendered cards)
  useEffect(() => {
    const newLines: typeof lines = [];
    agents.forEach((agent) => {
      const start = positions[agent.id];
      if (!start) return;
      agent.connections.forEach((targetId) => {
        const end = positions[targetId];
        if (!end) return;
        const isActive = agent.status === 'thinking' || agent.status === 'done';
        const inPath = highlightPath.has(agent.id) && highlightPath.has(targetId);
        const sx = start.x + PADDING + CARD_W;
        const sy = start.y + PADDING + CARD_H / 2;
        const ex = end.x + PADDING;
        const ey = end.y + PADDING + CARD_H / 2;
        const dx = ex - sx;
        const dist = Math.sqrt(dx * dx + (ey - sy) * (ey - sy));
        const cpOffset = Math.min(Math.abs(dx) * 0.5, 120);
        newLines.push({
          id: `${agent.id}-${targetId}`,
          x1: sx, y1: sy,
          x2: ex, y2: ey,
          cx1: sx + cpOffset, cy1: sy,
          cx2: ex - cpOffset, cy2: ey,
          color: agent.color,
          active: isActive || inPath,
          dashed: dist > 600,
        });
      });
    });
    setLines(newLines);
  }, [positions, agents, highlightPath]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Native drag: directly update dragOffsets
  const handlePointerDown = useCallback((e: React.PointerEvent, agentId: string) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const baseOffset = dragOverrides[agentId] ?? { x: 0, y: 0 };

    setDraggingId(agentId);

    const handleMove = (e2: PointerEvent) => {
      const totalDx = (e2.clientX - startX) / scale;
      const totalDy = (e2.clientY - startY) / scale;
      setDragOverrides((prev) => ({
        ...prev,
        [agentId]: { x: baseOffset.x + totalDx, y: baseOffset.y + totalDy },
      }));
    };

    const handleUp = () => {
      setDraggingId(null);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [scale, isMobile, dragOverrides]);

  // Wheel zoom
  useEffect(() => {
    if (isMobile || !onScaleChange) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        onScaleChange(Math.max(0.3, Math.min(2.5, scale + delta)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isMobile, onScaleChange, scale]);

  // Data packets
  const prevAgentsRef = useRef<Record<string, { status: string; progress: number }>>({});
  useEffect(() => {
    if (isMobile || prefersReducedMotion) { setDataPackets([]); return; }
    const timers: number[] = [];
    agents.forEach((agent) => {
      const prev = prevAgentsRef.current[agent.id];
      if (!prev) return;
      const start = positions[agent.id];
      if (!start) return;
      if (prev.status === 'thinking' && agent.status === 'done') {
        agent.connections.forEach((targetId, i) => {
          const end = positions[targetId];
          if (end) {
            const t = window.setTimeout(() => {
              setDataPackets((prevPkts) => [...prevPkts.slice(-20), {
                id: `pkt-${Date.now()}-${agent.id}-${targetId}-${i}`,
                from: { x: start.x + PADDING + CARD_W / 2, y: start.y + PADDING + CARD_H / 2 },
                to: { x: end.x + PADDING + CARD_W / 2, y: end.y + PADDING + CARD_H / 2 },
                color: agent.color,
                icon: agent.icon,
              }]);
            }, i * 200);
            timers.push(t);
          }
        });
      }
      if (prev.status === 'idle' && agent.status === 'thinking') {
        const parent = agents.find((a) => a.connections.includes(agent.id));
        if (parent) {
          const parentPos = positions[parent.id];
          if (parentPos) {
            setDataPackets((prevPkts) => [...prevPkts.slice(-20), {
              id: `pkt-in-${Date.now()}-${parent.id}-${agent.id}`,
              from: { x: parentPos.x + PADDING + CARD_W / 2, y: parentPos.y + PADDING + CARD_H / 2 },
              to: { x: start.x + PADDING + CARD_W / 2, y: start.y + PADDING + CARD_H / 2 },
              color: parent.color,
              icon: parent.icon,
            }]);
          }
        }
      }
    });
    prevAgentsRef.current = Object.fromEntries(agents.map((a) => [a.id, { status: a.status, progress: a.progress }]));
    return () => { timers.forEach((t) => window.clearTimeout(t)); };
  }, [agents, isMobile, positions, prefersReducedMotion]);

  const handlePacketComplete = (id: string) => setDataPackets((prev) => prev.filter((p) => p.id !== id));

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Save layout config
  const saveLayout = useCallback(() => {
    const config = {
      dragOffsets: dragOverrides,
      collapsedNodes: Array.from(collapsedNodes),
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [dragOverrides, collapsedNodes]);

  // Reset layout
  const resetLayout = useCallback(() => {
    setDragOverrides({});
    setCollapsedNodes(new Set());
    onScaleChange?.(0.8);
  }, [onScaleChange]);

  // Load saved layout on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.dragOffsets) setDragOverrides(config.dragOffsets);
        if (config.collapsedNodes) setCollapsedNodes(new Set(config.collapsedNodes));
      }
    } catch { /* ignore */ }
  }, []);
  const fitToScreen = useCallback(() => {
    const vals = Object.values(positions);
    if (vals.length === 0) return;
    const minX = Math.min(...vals.map((p) => p.x));
    const maxX = Math.max(...vals.map((p) => p.x + CARD_W));
    const minY = Math.min(...vals.map((p) => p.y));
    const maxY = Math.max(...vals.map((p) => p.y + CARD_H));

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const containerW = containerRef.current?.clientWidth ?? 1200;
    const containerH = containerRef.current?.clientHeight ?? 800;

    // Compute best scale to fit
    const pad = 60;
    const scaleX = (containerW - pad * 2) / contentW;
    const scaleY = (containerH - pad * 2) / contentH;
    const newScale = Math.max(0.2, Math.min(scaleX, scaleY, 1));

    // Compute offset to center
    const offsetX = (containerW / newScale - contentW) / 2 - minX;
    const offsetY = pad / newScale - minY;

    // Apply offset to all drag overrides
    setDragOverrides((prev) => {
      const next: Record<string, { x: number; y: number }> = {};
      agents.forEach((a) => {
        const base = prev[a.id] ?? { x: 0, y: 0 };
        next[a.id] = { x: base.x + offsetX, y: base.y + offsetY };
      });
      return next;
    });

    onScaleChange?.(newScale);
  }, [positions, agents, onScaleChange]);

  const effectSig = agents.map((a) => a.id).join('-');

  const svgGlowFilter = (
    <defs>
      <filter id="glow-pulse" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );

  if (isMobile) {
    return (
      <div ref={containerRef} className="w-full h-full overflow-auto pixel-scrollbar">
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={12} style={{ color: theme.primary }} />
            <span className="pixel-font text-[9px] glow-text" style={{ color: theme.primary }}>{agents.length} AGENTS</span>
            {isRunning && <motion.span className="pixel-font text-[7px] px-1.5 py-0.5" style={{ backgroundColor: theme.primary + '30', color: theme.primary }} animate={prefersReducedMotion ? undefined : { opacity: [1, 0.3, 1] }} transition={prefersReducedMotion ? undefined : { duration: 0.5, repeat: Infinity }}>LIVE</motion.span>}
          </div>
          {agents.map((agent, index) => {
            const depth = treeNodes[agent.id]?.depth ?? 0;
            return (
              <motion.div key={agent.id} data-agent-id={agent.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}>
                <div className="flex gap-0">
                  <div className="flex flex-col shrink-0">
                    {depth > 0 && (
                      <div className="flex items-center h-full">
                        <div className="flex flex-col items-center">
                          <div className="w-0.5 rounded-full" style={{ height: '100%', backgroundColor: agent.color + '60', marginLeft: depth * 12 - 6 }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0" style={{ marginLeft: depth * 12 }}>
                    {depth > 0 && (
                      <div className="flex items-center gap-1 mb-1">
                        <div className="w-2 h-0.5 rounded-full" style={{ backgroundColor: agent.color + '80' }} />
                        <ArrowRight size={8} style={{ color: agent.color }} />
                        <span className="pixel-font text-[7px] opacity-40" style={{ color: agent.color }}>{(() => { const parent = agents.find((a) => a.connections.includes(agent.id)); return parent ? parent.name : ''; })()}</span>
                      </div>
                    )}
                    <AgentCard agent={agent} isActive={activeAgentId === agent.id} onSelect={onSelectAgent} onShowThinking={onShowThinking} compact />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto pixel-scrollbar">
      {/* Search bar */}
      <div className="absolute top-3 left-48 z-30 flex items-center gap-1">
        <div className="pixel-card flex items-center gap-1.5 px-2 py-1 border-white/10">
          <Search size={10} className="text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="pixel-font-body text-[10px] bg-transparent outline-none w-24 text-white/70 placeholder:text-white/20"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white/60">
              <X size={10} />
            </button>
          )}
        </div>
        {searchQuery && (
          <span className="pixel-font text-[7px] text-white/30">
            {visibleAgentIds.size}/{agents.length}
          </span>
        )}
      </div>

      {/* Scaled content */}
      <div
        data-cards-layer
        className="relative z-10 overflow-visible"
        style={{
          width: Math.max(CONTENT_W * scale, containerSize.w),
          height: Math.max(CONTENT_H * scale, containerSize.h),
          minWidth: '100%', minHeight: '100%',
          transform: `scale(${scale})`, transformOrigin: '0 0',
        }}
      >
        <svg className="absolute top-0 left-0 pointer-events-none overflow-visible" style={{ width: '100%', height: '100%', zIndex: 0 }}>
          {svgGlowFilter}
          {lines.map((line, i) => {
            const isHighlighted = highlightPath.has(line.id.split('-')[0]) && highlightPath.has(line.id.split('-')[1]);
            return (
              <g key={`${effectSig}-${line.id}`}>
                {isHighlighted && !prefersReducedMotion && (
                  <motion.path
                    d={`M ${line.x1} ${line.y1} C ${line.cx1} ${line.cy1}, ${line.cx2} ${line.cy2}, ${line.x2} ${line.y2}`}
                    fill="none" stroke={line.color} strokeWidth={6} filter="url(#glow-pulse)"
                    initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <motion.path
                  d={`M ${line.x1} ${line.y1} C ${line.cx1} ${line.cy1}, ${line.cx2} ${line.cy2}, ${line.x2} ${line.y2}`}
                  fill="none" stroke={line.color} strokeWidth={isHighlighted ? 3 : line.active ? 2.5 : 1.5}
                  strokeDasharray={line.dashed ? '4,4' : '0'}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: line.active || isHighlighted ? 0.9 : 0.35 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 1, delay: prefersReducedMotion ? 0 : i * 0.06 }}
                />
                {line.active && !line.dashed && !prefersReducedMotion && (
                  <circle r={3} fill={line.color}>
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={`M ${line.x1} ${line.y1} C ${line.cx1} ${line.cy1}, ${line.cx2} ${line.cy2}, ${line.x2} ${line.y2}`} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        <DataPacketAnimation packets={dataPackets} onComplete={handlePacketComplete} />

        {order.map((agentId, idx) => {
          const agent = agents.find((a) => a.id === agentId);
          if (!agent) return null;
          const pos = positions[agentId];
          if (!pos) return null;
          const isVisible = visibleAgentIds.has(agentId);
          const isCollapsed = collapsedNodes.has(agentId);
          const hasChildren = agent.connections.length > 0;
          const isHighlighted = highlightPath.has(agentId);
          const isDragging = draggingId === agentId;

          if (!isVisible) return null;

          return (
            <motion.div
              key={agent.id}
              data-agent-id={agent.id}
              className="absolute select-none"
              onPointerDown={(e) => handlePointerDown(e, agent.id)}
              style={{
                left: pos.x + PADDING,
                top: pos.y + PADDING,
                width: CARD_W,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isDragging ? 50 : undefined,
              }}
              whileHover={{ cursor: 'grab' }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: isVisible ? 1 : 0.15, scale: 1 }}
              transition={{ delay: idx * 0.08, duration: 0.3, ease: 'easeOut' }}
            >
              {isHighlighted && (
                <motion.div
                  className="absolute -inset-1 rounded pointer-events-none"
                  style={{ border: `2px solid ${agent.color}`, boxShadow: `0 0 12px ${agent.color}40` }}
                  initial={{ opacity: 0 }}
                  animate={prefersReducedMotion ? { opacity: 0.6 } : { opacity: [0.4, 0.8, 0.4] }}
                  transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.5, repeat: Infinity }}
                />
              )}
              {hasChildren && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCollapse(agentId); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute -left-7 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center z-10 border-2 border-white/30 hover:border-white/70 hover:bg-white/10 transition-all"
                  style={{ backgroundColor: isCollapsed ? theme.primary + '50' : theme.card, borderRadius: 6 }}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? <ChevronRight size={18} style={{ color: theme.primary }} /> : <ChevronDown size={18} style={{ color: theme.primary }} />}
                </button>
              )}
              <AgentCard agent={agent} isActive={activeAgentId === agent.id} onSelect={onSelectAgent} onShowThinking={onShowThinking} />
            </motion.div>
          );
        })}
      </div>

      {/* Top-left controls */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-20 flex-wrap max-w-[300px]">
        <Zap size={14} style={{ color: theme.primary }} />
        <span className="pixel-font text-[10px] glow-text" style={{ color: theme.primary }}>
          {agents.length} AGENTS
        </span>
        {isRunning && <motion.span className="pixel-font text-[8px] px-1.5 py-0.5" style={{ backgroundColor: theme.primary + '30', color: theme.primary }} animate={prefersReducedMotion ? undefined : { opacity: [1, 0.3, 1] }} transition={prefersReducedMotion ? undefined : { duration: 0.5, repeat: Infinity }}>LIVE</motion.span>}
        {collapsedNodes.size > 0 && (
          <button onClick={() => setCollapsedNodes(new Set())} className="pixel-font text-[7px] px-1.5 py-0.5 border border-white/20 hover:border-white/50 transition-colors" style={{ color: theme.primary }}>
            EXPAND ALL
          </button>
        )}
        <button
          onClick={fitToScreen}
          className="pixel-font text-[7px] px-2 py-1 border transition-colors hover:bg-white/10"
          style={{ color: theme.accent, borderColor: theme.accent + '40' }}
          title="Fit all agents to screen"
        >
          FIT TO SCREEN
        </button>
        <button
          onClick={saveLayout}
          className="pixel-font text-[7px] px-2 py-1 border transition-colors hover:bg-white/10"
          style={{ color: theme.primary, borderColor: theme.primary + '40' }}
          title="Save current layout"
        >
          SAVE
        </button>
        <button
          onClick={resetLayout}
          className="pixel-font text-[7px] px-2 py-1 border transition-colors hover:bg-white/10"
          style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}
          title="Reset to default layout"
        >
          RESET
        </button>
      </div>
    </div>
  );
};
