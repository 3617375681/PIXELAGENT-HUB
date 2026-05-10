import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { workflowFallbacks } from '../data/workflowFallbacks';
import type { Agent, AgentOutput, AgentStep, Round, Workflow } from '../types/agent';
import {
  ArrowLeft, BookOpen, ChevronRight, FileText, Lightbulb,
  Award, Layers, Clock
} from 'lucide-react';

const themes: Record<string, { bg: string; primary: string }> = {
  neon: { bg: '#0a0e1a', primary: '#00ff88' },
  matrix: { bg: '#000000', primary: '#00ff00' },
  retro: { bg: '#1a1025', primary: '#ff6b9d' },
};

/** Detect and render TeX in text */
export function RenderTeX({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: Array<{ type: 'text' | 'tex-block' | 'tex-inline'; content: string }> = [];
    // Split by block math $$...$$ and inline math $...$
    const regex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      const raw = match[0];
      if (raw.startsWith('$$')) {
        result.push({ type: 'tex-block', content: raw.slice(2, -2).trim() });
      } else {
        result.push({ type: 'tex-inline', content: raw.slice(1, -1).trim() });
      }
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < text.length) {
      result.push({ type: 'text', content: text.slice(lastIndex) });
    }
    if (result.length === 0) {
      result.push({ type: 'text', content: text });
    }
    return result;
  }, [text]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i} className="whitespace-pre-wrap">{part.content}</span>;
        }
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.type === 'tex-block',
          });
          return (
            <span
              key={i}
              className={part.type === 'tex-block' ? 'block my-2' : 'inline'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={i} className="text-red-400">{part.content}</span>;
        }
      })}
    </>
  );
}

export default function ArchivePage() {
  const navigate = useNavigate();
  const theme = themes.neon;
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);

  // Load all workflows with rounds
  const allWorkflows = useMemo(() => {
    const list: Array<{ name: string; rounds: Round[] }> = [];
    for (const key of Object.keys(workflowFallbacks)) {
      const wf = workflowFallbacks[key] as Workflow;
      if (wf?.rounds) {
        list.push({ name: wf.name, rounds: wf.rounds });
      }
    }
    return list;
  }, []);

  const currentWorkflow = allWorkflows[0];
  const rounds = currentWorkflow?.rounds || [];
  const currentRound = rounds[selectedRoundIdx];

  return (
    <div
      className="h-screen w-screen flex flex-col pixel-font-body overflow-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      {/* Top Bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b z-20 shrink-0"
        style={{ borderColor: theme.primary + '30', backgroundColor: theme.bg + 'ee' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft size={14} />
          <span className="pixel-font text-[9px]">BACK</span>
        </button>
        <BookOpen size={14} style={{ color: theme.primary }} />
        <span className="pixel-font text-xs glow-text" style={{ color: theme.primary }}>
          ARCHIVE
        </span>
        <span className="pixel-font text-[8px] text-white/30 ml-1">
          {currentWorkflow?.name || ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Layers size={10} style={{ color: theme.primary }} />
          <span className="pixel-font text-[8px]" style={{ color: theme.primary }}>
            {rounds.length} ROUND{rounds.length > 1 ? 'S' : ''}
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Round list */}
        <div
          className="w-48 shrink-0 border-r overflow-auto pixel-scrollbar"
          style={{ borderColor: theme.primary + '20', backgroundColor: theme.bg + '99' }}
        >
          <div className="p-3 space-y-1">
            <div className="pixel-font text-[8px] text-white/30 mb-2 px-1">ROUNDS</div>
            {rounds.map((round: Round, idx: number) => (
              <button
                key={round.id}
                onClick={() => setSelectedRoundIdx(idx)}
                className={`w-full text-left px-2.5 py-2 rounded transition-all ${
                  idx === selectedRoundIdx
                    ? 'border border-opacity-50'
                    : 'border border-transparent hover:border-white/10'
                }`}
                style={{
                  backgroundColor: idx === selectedRoundIdx ? theme.primary + '15' : 'transparent',
                  borderColor: idx === selectedRoundIdx ? theme.primary + '60' : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="pixel-font text-[10px]" style={{ color: theme.primary }}>
                    R{round.roundNumber}
                  </span>
                  <span className="pixel-font text-[7px] text-white/40 uppercase">
                    {round.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Award size={8} className="text-white/20" />
                  <span className="pixel-font text-[7px] text-white/30">
                    {round.agents?.length || 0} agents
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Agent outputs */}
        <div className="flex-1 overflow-auto pixel-scrollbar p-4">
          {!currentRound ? (
            <div className="flex items-center justify-center h-full text-white/20">
              <span className="pixel-font text-sm">No rounds available</span>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Round header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-font text-lg" style={{ color: theme.primary }}>
                  Round {currentRound.roundNumber}
                </span>
                <span
                  className="pixel-font text-[8px] px-2 py-0.5"
                  style={{
                    backgroundColor: theme.primary + '20',
                    color: theme.primary,
                    border: `1px solid ${theme.primary}`,
                  }}
                >
                  {currentRound.status}
                </span>
                <div className="ml-auto flex items-center gap-1 text-white/20">
                  <Clock size={10} />
                  <span className="pixel-font text-[8px]">
                    {new Date(currentRound.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Agent cards */}
              {currentRound.agents?.map((agent: Agent, idx: number) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className="pixel-card p-4"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: agent.color,
                    backgroundColor: agent.color + '08',
                  }}
                >
                  {/* Agent header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-9 h-9 flex items-center justify-center pixel-border-solid"
                      style={{
                        borderColor: agent.color,
                        backgroundColor: agent.color + '20',
                        fontSize: 18,
                      }}
                    >
                      <span>{agent.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="pixel-font text-xs" style={{ color: agent.color }}>
                          {agent.name}
                        </span>
                        <span
                          className="pixel-font text-[7px] px-1.5 py-0.5"
                          style={{
                            backgroundColor: agent.color + '20',
                            color: agent.color,
                            border: `1px solid ${agent.color}`,
                          }}
                        >
                          {agent.status?.toUpperCase() || 'DONE'}
                        </span>
                      </div>
                      <span className="pixel-font text-[8px] text-white/30">{agent.role}</span>
                    </div>
                  </div>

                  {/* Outputs */}
                  {agent.outputs && agent.outputs.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-2 opacity-40">
                        <FileText size={10} />
                        <span className="pixel-font text-[7px]">OUTPUTS</span>
                      </div>
                      <div className="space-y-2">
                        {agent.outputs.map((output: AgentOutput) => (
                          <div
                            key={output.id}
                            className="pixel-card p-2.5 text-sm leading-relaxed"
                            style={{
                              borderColor: agent.color + '30',
                              backgroundColor: agent.color + '06',
                            }}
                          >
                            <p className="pixel-font-body text-[11px] text-white/70">
                              <RenderTeX text={output.content} />
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <span
                                className="pixel-font text-[6px] px-1 py-0.5"
                                style={{
                                  backgroundColor:
                                    output.type === 'output'
                                      ? '#22c55e20'
                                      : output.type === 'warning'
                                      ? '#f59e0b20'
                                      : '#00d4ff20',
                                  color:
                                    output.type === 'output'
                                      ? '#22c55e'
                                      : output.type === 'warning'
                                      ? '#f59e0b'
                                      : '#00d4ff',
                                }}
                              >
                                {output.type?.toUpperCase()}
                              </span>
                              <span className="pixel-font text-[6px] text-white/20 ml-auto">
                                {new Date(output.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thinking */}
                  {agent.thinking?.steps && agent.thinking.steps.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 opacity-40">
                        <Lightbulb size={10} />
                        <span className="pixel-font text-[7px]">THINKING PROCESS</span>
                      </div>
                      <div className="space-y-1.5">
                        {agent.thinking.steps.map((step: AgentStep, si: number) => (
                          <div
                            key={step.id}
                            className="flex items-start gap-2 px-2 py-1.5 rounded"
                            style={{ backgroundColor: agent.color + '06' }}
                          >
                            <span className="pixel-font text-[8px] mt-0.5" style={{ color: agent.color }}>
                              {si + 1}
                            </span>
                            <div>
                              <span className="pixel-font text-[9px] text-white/60">{step.title}</span>
                              <p className="pixel-font-body text-[9px] text-white/30 mt-0.5">
                                {step.description}
                              </p>
                            </div>
                            <ChevronRight size={10} className="ml-auto text-white/10 shrink-0 mt-0.5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
