import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import type { Agent, AgentOutput, Round } from '../types/agent';
import { useWorkflowData } from '../hooks/useWorkflow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { ToastNotification, useToasts } from '../components/ToastNotification';
import { ChatPanel } from '../components/ChatPanel';
import { ThinkingDrawer } from '../components/ThinkingDrawer';
import { AgentFlow } from '../components/AgentFlow';
import { themes } from '../components/panels/ThemeSwitcher';
import type { ThemeName } from '../components/panels/ThemeSwitcher';
import { ExportPanel } from '../components/panels/ExportPanel';
import { CodeBlock } from '../components/panels/CodeBlock';
import { ScreenFlash } from '../components/ScreenFlash';
import { soundEngine } from '../lib/soundEngine';
import {
  Zap, ChevronLeft, ChevronRight, Play, RotateCcw, Keyboard, Code2,
  LayoutGrid, MessageSquare, BookOpen, X, ZoomIn, ZoomOut, Smile, Home as HomeIcon,
  Volume2, VolumeX, Radio, Terminal, Download
} from 'lucide-react';

export default function Home() {
  const isMobile = useIsMobile();
  const { workflow, currentRoundIndex, isRunning, runWorkflow, resetWorkflow, nextRound, prevRound, activeAgentId } = useWorkflowData();
  const { toasts, addToast, removeToast } = useToasts();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<Agent | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [mobileTab, setMobileTab] = useState<'flow' | 'chat'>('flow');
  const [flowScale, setFlowScale] = useState(0.8);
  const [themeName, setThemeName] = useState<ThemeName>('hacker-green');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [clickFlash, setClickFlash] = useState<{ color: string; key: number } | null>(null);
  const theme = themes[themeName];

  const currentRound = workflow?.rounds?.[currentRoundIndex];
  const currentAgents: Agent[] = currentRound?.agents || [];
  const allMessages: AgentOutput[] = workflow?.rounds?.flatMap((r: Round) => r.messages || []) || [];

  // Click flash trigger — must be defined BEFORE functions that use it
  const triggerClickFlash = useCallback((color?: string) => {
    setClickFlash({ color: color || theme.primary, key: Date.now() });
    setTimeout(() => setClickFlash(null), 550);
  }, [theme.primary]);

  const handleRunWorkflow = useCallback(() => {
    soundEngine.statusChange('thinking');
    triggerClickFlash('#f59e0b');
    void runWorkflow();
    addToast('Workflow started', 'success');
  }, [runWorkflow, addToast, triggerClickFlash]);

  const handleResetWorkflow = useCallback(() => {
    soundEngine.click();
    triggerClickFlash('#ef4444');
    resetWorkflow();
    addToast('Workflow reset', 'info');
  }, [resetWorkflow, addToast, triggerClickFlash]);

  // Sound-enabled toggle wrapper
  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.toggle();
    if (next) {
      soundEngine.success();
      triggerClickFlash('#22c55e');
    } else {
      triggerClickFlash('#6b7280');
    }
  }, [soundEnabled, triggerClickFlash]);

  const toggleChat = useCallback(() => {
    setShowChat(v => {
      if (!v) { soundEngine.message(); triggerClickFlash('#a855f7'); }
      else { soundEngine.closePanel(); triggerClickFlash(); }
      return !v;
    });
  }, [triggerClickFlash]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') handleRunWorkflow();
      if (e.key === 'e' || e.key === 'E') { soundEngine.openPanel(); setShowExport(true); }
      if (e.key === 'c' || e.key === 'C') toggleChat();
      if (e.key === 'm' || e.key === 'M') toggleSound();
      if (e.key === '+' || e.key === '=') { soundEngine.click(); setFlowScale(s => Math.min(2.5, s + 0.1)); }
      if (e.key === '-' || e.key === '_') { soundEngine.click(); setFlowScale(s => Math.max(0.3, s - 0.1)); }
      if (e.key === '0') { soundEngine.click(); setFlowScale(1); }
      if (e.key === 'Escape') { soundEngine.closePanel(); setShowChat(false); setShowExport(false); setShowShortcuts(false); setShowCodePanel(false); setSelectedAgent(null); }
      if (e.key === '?') { soundEngine.openPanel(); setShowShortcuts(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRunWorkflow, handleResetWorkflow, toggleChat, toggleSound]);

  const showFlowPanel = !isMobile || mobileTab === 'flow';
  const showMobileChat = isMobile && mobileTab === 'chat';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col pixel-font-body pixel-grid-bg crt-screen"
      style={{ backgroundColor: theme.background, color: theme.foreground }}>

      {/* CRT Scanline Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] scanline opacity-30" />
      {/* Click Flash Overlay */}
      {clickFlash && (
        <div
          key={clickFlash.key}
          className="click-edge-flash"
          style={{ '--flash-color': clickFlash.color } as React.CSSProperties}
        />
      )}

      {/* Header - V27+ 融合版 */}
      <header className="shrink-0 border-b border-white/10 px-3 py-2 flex items-center gap-4" style={{ backgroundColor: theme.background }}>
        {/* LEFT: Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 flex items-center justify-center border" style={{ borderColor: theme.primary, backgroundColor: theme.primary + '15' }}>
            <Zap size={16} style={{ color: theme.primary }} />
          </div>
          <div className="flex flex-col">
            <span className="pixel-font text-[11px] glow-text leading-none" style={{ color: theme.primary }}>PIXELAGENT HUB</span>
            <span className="pixel-font text-[7px] text-white/30 leading-none mt-0.5">Multi-Agent Console v3.0</span>
          </div>
        </div>

        {/* CENTER: Workflow Name + Round Nav + Radio + Agent Count + Zoom */}
        <div className="hidden md:flex items-center gap-3 mx-auto">
          <span className="pixel-font text-[10px] text-white/70">{workflow?.name || 'Pixel Weather App'}</span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => prevRound()} disabled={currentRoundIndex <= 0} className="pixel-btn-secondary p-1 disabled:opacity-30"><ChevronLeft size={12} /></button>
            <span className="pixel-font text-[8px] w-10 text-center border border-white/10 px-1 py-0.5">R {currentRoundIndex + 1}/{workflow?.rounds?.length ?? 1}</span>
            <button onClick={() => nextRound()} disabled={currentRoundIndex >= (workflow?.rounds?.length ?? 1) - 1} className="pixel-btn-secondary p-1 disabled:opacity-30"><ChevronRight size={12} /></button>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio size={10} className={isRunning ? 'animate-pulse' : ''} style={{ color: isRunning ? '#f59e0b' : theme.primary }} />
            <span className="pixel-font text-[8px]">{isRunning ? 'RUNNING' : 'READY'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Terminal size={10} style={{ color: theme.accent }} />
            <span className="pixel-font text-[8px]">{currentAgents.length} AGENTS</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setFlowScale(s => Math.max(0.3, s - 0.1))} className="pixel-btn-secondary p-1" title="Zoom Out"><ZoomOut size={12} /></button>
            <span className="pixel-font text-[8px] w-8 text-center text-white/40">{Math.round(flowScale * 100)}%</span>
            <button onClick={() => setFlowScale(s => Math.min(2.5, s + 0.1))} className="pixel-btn-secondary p-1" title="Zoom In"><ZoomIn size={12} /></button>
            <button onClick={() => setFlowScale(1)} className="pixel-btn-secondary p-1" title="Fit"><HomeIcon size={12} /></button>
          </div>
        </div>

        {/* RIGHT: Tools + Theme + ARCHIVE + START + RESET + CHAT */}
        <div className="flex items-center gap-1 ml-auto">
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => { soundEngine.openPanel(); setShowCodePanel(true); }} className="pixel-btn-secondary p-1.5" title="Code Snippets"><Code2 size={12} /></button>
            <button onClick={() => { soundEngine.openPanel(); setShowExport(true); }} className="pixel-btn-secondary p-1.5" title="Export Report (E)"><Download size={12} /></button>
            <button onClick={() => { soundEngine.openPanel(); setShowShortcuts(true); }} className="pixel-btn-secondary p-1.5" title="Keyboard Shortcuts (?)"><Keyboard size={12} /></button>
            <button onClick={() => soundEngine.click()} className="pixel-btn-secondary p-1.5" title="Emoji"><Smile size={12} /></button>
            {/* Volume Toggle */}
            <button
              onClick={toggleSound}
              className="pixel-btn-secondary p-1.5"
              title={`Sound ${soundEnabled ? 'On' : 'Off'} (M)`}
            >
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
            {/* Theme Switcher - V27 style */}
            <div className="flex items-center gap-1 ml-1">
              {(Object.keys(themes) as ThemeName[]).map((t) => {
                const tc = themes[t];
                const isActive = themeName === t;
                return (
                  <button
                    key={t}
                    onClick={() => { soundEngine.click(); setThemeName(t); }}
                    className="relative p-1 border transition-all"
                    style={{
                      borderColor: isActive ? tc.primary : 'rgba(255,255,255,0.1)',
                      backgroundColor: isActive ? tc.primary + '20' : 'transparent',
                    }}
                    title={tc.name}
                  >
                    <div className="w-3 h-3" style={{ backgroundColor: tc.primary }} />
                    {isActive && (
                      <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1" style={{ backgroundColor: tc.primary }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="h-4 w-px bg-white/10 hidden sm:block mx-0.5" />
          {/* ARCHIVE + START + RESET */}
          <div className="hidden sm:flex items-center gap-1">
            <Link to="/live" onClick={() => soundEngine.click()} className="flex items-center gap-1.5 px-2 py-1.5 border transition-all" style={{ borderRadius: 4, borderColor: '#22d3ee', backgroundColor: '#22d3ee' }} title="Live Console (Records API Sessions)">
              <Terminal size={12} style={{ color: '#12121a' }} />
              <span className="pixel-font text-[8px] font-bold" style={{ color: '#12121a' }}>LIVE</span>
            </Link>
            <Link to="/ops" onClick={() => soundEngine.click()} className="flex items-center gap-1.5 px-3 py-1.5 border transition-all" style={{ borderRadius: 4, borderColor: '#00d4ff', backgroundColor: '#00d4ff' }} title="NanoClaw console (records API)">
              <Terminal size={12} style={{ color: '#12121a' }} />
              <span className="pixel-font text-[8px] font-bold" style={{ color: '#12121a' }}>NCL</span>
            </Link>
            <Link to="/archive" onClick={() => soundEngine.click()} className="flex items-center gap-1.5 px-3 py-1.5 border transition-all" style={{ borderRadius: 4, borderColor: '#a855f7', backgroundColor: '#a855f7' }} title="Archive">
              <BookOpen size={12} style={{ color: '#12121a' }} />
              <span className="pixel-font text-[8px] font-bold" style={{ color: '#12121a' }}>ARCHIVE</span>
            </Link>
            <button onClick={handleRunWorkflow} disabled={isRunning} className="flex items-center gap-1.5 px-3 py-1.5 border transition-all disabled:opacity-40" style={{ borderRadius: 4, borderColor: isRunning ? '#f59e0b' : '#22c55e', backgroundColor: isRunning ? '#f59e0b' : '#22c55e' }} title="Start">
              <Play size={12} style={{ color: isRunning ? '#12121a' : '#12121a' }} />
              <span className="pixel-font text-[8px] font-bold" style={{ color: isRunning ? '#12121a' : '#12121a' }}>{isRunning ? 'RUNNING' : 'START'}</span>
            </button>
            <button onClick={handleResetWorkflow} disabled={isRunning} className="pixel-btn-secondary p-1.5" title="Reset"><RotateCcw size={12} /></button>
          </div>
          {/* CHAT */}
          <button onClick={toggleChat} className="pixel-btn-secondary px-2 py-1.5 flex items-center gap-1" title="Chat (C)">
            <MessageSquare size={10} />
            <span className="pixel-font text-[7px]">{showChat ? 'CLOSE' : 'CHAT'}</span>
            {!showChat && allMessages.length > 0 && <span className="ml-0.5 px-1 rounded-full pixel-font text-[6px] bg-green-500">{allMessages.length}</span>}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Flow Panel */}
        {showFlowPanel && (
          <div className="flex-1 overflow-hidden relative">
            <AgentFlow
              agents={currentAgents}
              activeAgentId={activeAgentId}
              onSelectAgent={setSelectedAgent}
              onShowThinking={setThinkingAgent}
              theme={theme}
              isRunning={isRunning}
              isMobile={isMobile}
              scale={flowScale}
              onScaleChange={setFlowScale}
            />
          </div>
        )}

        {/* Desktop Chat Sidebar */}
        <AnimatePresence>
          {showChat && !isMobile && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="shrink-0 flex flex-col border-l border-white/10 overflow-hidden"
              style={{ backgroundColor: theme.card }}
            >
              <ChatPanel theme={theme} activeAgentId={null} isRunning={isRunning} onRunMode={() => { handleRunWorkflow(); }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Chat Full Screen Overlay */}
        <AnimatePresence>
          {showMobileChat && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="fixed inset-0 z-[60] flex flex-col"
              style={{ backgroundColor: theme.card, paddingBottom: '56px' }}
            >
              {/* Mobile Chat Header */}
              <div className="shrink-0 flex items-center justify-between p-3 border-b border-white/10" style={{ backgroundColor: theme.background }}>
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} style={{ color: theme.primary }} />
                  <span className="pixel-font text-[10px]" style={{ color: theme.primary }}>AGENT CHAT</span>
                  <span className="pixel-font text-[8px] text-white/30">{allMessages.length} msgs</span>
                </div>
                <button onClick={() => setMobileTab('flow')} className="pixel-btn-secondary p-1.5">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel theme={theme} activeAgentId={null} isRunning={isRunning} onRunMode={() => { handleRunWorkflow(); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <div className="mobile-tab-bar" style={{ zIndex: 50 }}>
          <button onClick={() => { soundEngine.click(); setMobileTab('flow'); }} className={`flex flex-col items-center gap-0.5 ${mobileTab === 'flow' ? 'text-green-400' : 'text-white/30'}`}>
            <LayoutGrid size={18} />
            <span className="pixel-font text-[7px]">FLOW</span>
          </button>
          <button onClick={handleRunWorkflow} disabled={isRunning}>
            <Play size={20} className={isRunning ? 'text-yellow-400 animate-pulse' : 'text-green-400'} />
          </button>
          <button onClick={() => { soundEngine.message(); setMobileTab('chat'); }} className={`flex flex-col items-center gap-0.5 relative ${mobileTab === 'chat' ? 'text-green-400' : 'text-white/30'}`}>
            <MessageSquare size={18} />
            <span className="pixel-font text-[7px]">CHAT</span>
            {allMessages.length > 0 && mobileTab !== 'chat' && (
              <span className="absolute -top-1 -right-2 px-1 rounded-full pixel-font text-[6px] bg-green-500 text-black">{allMessages.length}</span>
            )}
          </button>
        </div>
      )}

      <ScreenFlash color="#22c55e" trigger={0} />
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Export Panel */}
      {workflow && (
        <ExportPanel
          isOpen={showExport}
          workflow={{
            id: String(workflow.id),
            name: workflow.name,
            description: workflow.description,
            rounds: workflow.rounds.map((r: Round) => ({
              id: String(r.id),
              roundNumber: r.roundNumber,
              status: r.status,
              messages: r.messages,
              agents: r.agents,
              timestamp: r.timestamp,
            })),
            currentRound: workflow.currentRound,
          }}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowShortcuts(false)}>
          <div className="pixel-card p-6 max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="pixel-font text-sm mb-4" style={{ color: theme.primary }}>KEYBOARD SHORTCUTS</h2>
            <div className="space-y-2">
              {[{ key: 'R', desc: 'Run workflow' }, { key: 'E', desc: 'Export' }, { key: 'C', desc: 'Toggle chat' }, { key: 'M', desc: 'Toggle sound' }, { key: '+', desc: 'Zoom in' }, { key: '-', desc: 'Zoom out' }, { key: '0', desc: 'Reset zoom' }, { key: 'Esc', desc: 'Close panels' }, { key: '?', desc: 'Shortcuts' }].map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="pixel-font text-[10px] px-2 py-1 border" style={{ borderColor: theme.primary, color: theme.primary }}>{s.key}</span>
                  <span className="pixel-font-body text-xs text-white/60">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setSelectedAgent(null)}>
          <div className="pixel-card p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h2 className="pixel-font text-sm" style={{ color: selectedAgent.color }}>{selectedAgent.name}</h2>
            <p className="pixel-font-body text-xs">{selectedAgent.role}</p>
            <p className="pixel-font-body text-xs text-white/60 mt-2">{selectedAgent.statusMessage}</p>
          </div>
        </div>
      )}

      {/* Thinking Drawer */}
      {thinkingAgent && <ThinkingDrawer agent={thinkingAgent} onClose={() => setThinkingAgent(null)} theme={theme} />}

      {/* Code Panel */}
      {showCodePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowCodePanel(false)}>
          <div className="pixel-card p-6 max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="pixel-font text-sm mb-4" style={{ color: theme.primary }}>CODE SNIPPETS</h2>
            <CodeBlock code="// Code snippets placeholder" language="typescript" />
          </div>
        </div>
      )}
    </div>
  );
}
