import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Agent } from '../types/agent';
import { PixelAvatar } from './PixelAvatar';
import { ParticleEffect, StatusBurst } from './effects/ParticleEffect';
import { AgentMetrics, defaultMetrics } from './panels/AgentMetrics';
import { Cpu, Activity, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentCardProps {
  agent: Agent;
  isActive: boolean;
  onSelect: (agent: Agent) => void;
  onShowThinking: (agent: Agent) => void;
  compact?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, isActive, onSelect, onShowThinking, compact = false }) => {
  const [showMetrics, setShowMetrics] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isCompact = compact && !expanded;

  // Progress from thinking steps (real data) when thinking, else agent.progress
  const stepProgress = useMemo(() => {
    const steps = agent.thinking?.steps || [];
    if (steps.length === 0) return agent.progress;
    const done = steps.filter((s) => s.status === 'completed').length;
    return Math.round((done / steps.length) * 100);
  }, [agent.thinking, agent.progress]);

  const displayProgress = agent.status === 'thinking' ? stepProgress : agent.progress;

  const statusColors: Record<string, string> = {
    idle: '#6b7280',
    thinking: '#f59e0b',
    done: '#22c55e',
    error: '#ef4444',
  };

  const statusLabels: Record<string, string> = {
    idle: 'IDLE',
    thinking: 'THINKING',
    done: 'DONE',
    error: 'ERROR',
  };

  const metrics = defaultMetrics(agent.id);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={isCompact ? {} : { scale: 1.02, y: -2 }}
      className={`pixel-card p-2 transition-all ${isActive ? 'glow-border' : ''} ${agent.status === 'thinking' ? 'agent-bloom active' : 'agent-bloom'}`}
      style={{
        borderColor: isActive ? agent.color : agent.status === 'thinking' ? agent.color + '80' : 'hsl(var(--border))',
        background: isActive ? agent.color + '15' : agent.status === 'thinking' ? agent.color + '08' : undefined,
        '--agent-color': agent.color,
      } as React.CSSProperties}
      onClick={() => {
        if (isCompact) {
          setExpanded(true);
        }
      }}
    >
      {/* Particle Effects */}
      <ParticleEffect
        color={agent.color}
        isActive={agent.status === 'thinking'}
        density={isCompact ? 1 : 2}
      />
      <StatusBurst color={agent.color} trigger={0} />

      <div className="relative z-10">
        {/* Compact Header Row */}
        <div className="flex items-center gap-2">
          <PixelAvatar
            icon={agent.icon}
            color={agent.color}
            size={isCompact ? 28 : 36}
            isAnimating={agent.status === 'thinking'}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="pixel-font text-[10px] truncate" style={{ color: agent.color }}>
                {agent.name}
              </h3>
              <motion.span
                className="pixel-font text-[7px] px-1 py-0.5 leading-none"
                style={{
                  backgroundColor: statusColors[agent.status] + '30',
                  color: statusColors[agent.status],
                  border: `1px solid ${statusColors[agent.status]}`,
                }}
                animate={agent.status === 'thinking' ? { opacity: [1, 0.5, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
              >
                {statusLabels[agent.status]}
              </motion.span>
            </div>
            <p className="pixel-font-body text-[9px] opacity-60 leading-tight">{agent.role}</p>
            {!isCompact && (
              <p className="pixel-font-body text-[9px] opacity-40 truncate">{agent.statusMessage}</p>
            )}
          </div>
          {/* Expand / Collapse toggle */}
          {isCompact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="shrink-0 text-white/30 hover:text-white/60"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-black/30 border border-white/10 relative overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ backgroundColor: agent.color }}
              initial={{ width: 0 }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            {agent.status === 'thinking' && (
              <motion.div
                className="absolute inset-y-0"
                style={{
                  background: `linear-gradient(90deg, transparent, ${agent.color}60, transparent)`,
                  width: '30%',
                }}
                animate={{ left: ['-30%', '100%'] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </div>
          <span className="pixel-font text-[7px] w-6 text-right" style={{ color: agent.color }}>
            {displayProgress}%
          </span>
        </div>

        {/* Expanded details (compact mode only) */}
        {isCompact && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
          >
            {/* Status message */}
            <p className="pixel-font-body text-[9px] opacity-50 mt-1">{agent.statusMessage}</p>

            {/* Action Buttons */}
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowThinking(agent);
                }}
                className="pixel-btn-secondary px-1.5 py-0.5 flex items-center gap-1 text-xs chromatic-hover"
              >
                <Cpu size={10} />
                <span className="pixel-font text-[7px]">THINK</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(agent);
                }}
                className="pixel-btn-secondary px-1.5 py-0.5 flex items-center gap-1 text-xs chromatic-hover"
              >
                <Terminal size={10} />
                <span className="pixel-font text-[7px]">OUTPUT</span>
              </button>
            </div>

            {/* Output Preview */}
            {agent.outputs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="flex items-center gap-1 mb-0.5 opacity-50">
                  <Activity size={8} />
                  <span className="pixel-font text-[7px]">LATEST OUTPUT</span>
                </div>
                <p className="pixel-font-body text-[9px] opacity-70 line-clamp-2">
                  {agent.outputs[agent.outputs.length - 1].content}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Desktop / non-compact: always show everything */}
        {!isCompact && (
          <>
            {/* Metrics Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMetrics(!showMetrics);
              }}
              className="mt-2 flex items-center gap-1 text-white/30 hover:text-white/50 transition-colors"
            >
              {showMetrics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              <span className="pixel-font text-[7px]">METRICS</span>
            </button>

            {/* Performance Metrics */}
            {showMetrics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="overflow-hidden"
              >
                <AgentMetrics metrics={metrics} isExpanded />
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowThinking(agent);
                }}
                className="pixel-btn-secondary px-1.5 py-0.5 flex items-center gap-1 text-xs chromatic-hover"
              >
                <Cpu size={10} />
                <span className="pixel-font text-[7px]">THINK</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(agent);
                }}
                className="pixel-btn-secondary px-1.5 py-0.5 flex items-center gap-1 text-xs chromatic-hover"
              >
                <Terminal size={10} />
                <span className="pixel-font text-[7px]">OUTPUT</span>
              </button>
            </div>

            {/* Output Preview */}
            {agent.outputs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="flex items-center gap-1 mb-0.5 opacity-50">
                  <Activity size={8} />
                  <span className="pixel-font text-[7px]">LATEST OUTPUT</span>
                </div>
                <p className="pixel-font-body text-[10px] opacity-70 line-clamp-2">
                  {agent.outputs[agent.outputs.length - 1].content}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};
