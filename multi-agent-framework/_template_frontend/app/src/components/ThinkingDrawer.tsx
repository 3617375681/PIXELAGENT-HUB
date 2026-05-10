import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Agent } from '../types/agent';
import { X, Cpu, CheckCircle2, Circle, AlertCircle } from 'lucide-react';

interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  glow: string;
}

interface ThinkingDrawerProps {
  agent: Agent | null;
  onClose: () => void;
  theme: ThemeConfig;
}

export const ThinkingDrawer: React.FC<ThinkingDrawerProps> = ({ agent, onClose, theme }) => {
  if (!agent) return null;

  const statusIcons = {
    pending: <Circle size={14} className="text-white/30" />,
    active: <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />,
    completed: <CheckCircle2 size={14} className="text-green-400" />,
    error: <AlertCircle size={14} className="text-red-400" />,
  };

  const statusColors = {
    pending: 'text-white/30',
    active: 'text-yellow-400',
    completed: 'text-green-400',
    error: 'text-red-400',
  };

  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-[520px] max-w-[90vw] border-l-2 z-50 flex flex-col"
            style={{ backgroundColor: theme.background, borderColor: agent.color }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: agent.color + '40' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 flex items-center justify-center pixel-border-solid"
                  style={{
                    borderColor: agent.color,
                    backgroundColor: agent.color + '20',
                  }}
                >
                  <span className="text-lg">{agent.icon}</span>
                </div>
                <div>
                  <h2 className="pixel-font text-sm" style={{ color: agent.color }}>
                    {agent.name}
                  </h2>
                  <p className="pixel-font-body text-xs opacity-50">Thinking Process</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="pixel-btn-secondary p-2"
                style={{ borderColor: agent.color + '40' }}
              >
                <X size={14} style={{ color: agent.color }} />
              </button>
            </div>

            {/* Step Nodes Visualization */}
            <div className="flex-1 overflow-auto pixel-scrollbar p-4">
              {/* Connection Line */}
              <div className="relative">
                <div
                  className="absolute left-[19px] top-0 bottom-0 w-0.5"
                  style={{ backgroundColor: agent.color + '30' }}
                />

                {/* Steps */}
                <div className="space-y-4">
                  {agent.thinking.steps.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.3 }}
                      className="relative flex gap-3"
                    >
                      {/* Node */}
                      <div className="relative z-10 flex-shrink-0">
                        <div
                          className="w-10 h-10 flex items-center justify-center pixel-border-solid"
                          style={{
                            borderColor: step.status === 'active' ? agent.color : step.status === 'completed' ? '#22c55e' : 'hsl(var(--border))',
                            backgroundColor: step.status === 'active' ? agent.color + '30' : step.status === 'completed' ? '#22c55e20' : 'hsl(var(--card))',
                          }}
                        >
                          {statusIcons[step.status]}
                        </div>
                        {index < agent.thinking.steps.length - 1 && (
                          <motion.div
                            className="absolute top-10 left-1/2 -translate-x-1/2 w-0.5 h-4"
                            style={{ backgroundColor: step.status === 'completed' ? '#22c55e' : agent.color + '30' }}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ delay: index * 0.1 + 0.2 }}
                          />
                        )}
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 pt-1">
                        <div
                          className="pixel-card p-3"
                          style={{
                            borderColor: step.status === 'active' ? agent.color : 'hsl(var(--border))',
                            backgroundColor: step.status === 'active' ? agent.color + '10' : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`pixel-font text-[10px] ${statusColors[step.status]}`}>
                              STEP {index + 1}: {step.title}
                            </span>
                          </div>
                          <p className="pixel-font-body text-sm opacity-70">{step.description}</p>
                          {step.status === 'active' && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-black/30 overflow-hidden">
                                <motion.div
                                  className="h-full"
                                  style={{ backgroundColor: agent.color }}
                                  animate={{ x: ['-100%', '100%'] }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                />
                              </div>
                              <span className="pixel-font text-[8px]" style={{ color: agent.color }}>
                                PROCESSING...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Raw Thoughts Section */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu size={12} style={{ color: theme.accent }} />
                  <span className="pixel-font text-[10px]" style={{ color: theme.accent }}>RAW THOUGHTS</span>
                </div>
                <div className="pixel-card p-3" style={{ backgroundColor: theme.card + '80' }}>
                  <p className="pixel-font-body text-sm opacity-60 leading-relaxed whitespace-pre-wrap">
                    {agent.thinking.rawThoughts}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
