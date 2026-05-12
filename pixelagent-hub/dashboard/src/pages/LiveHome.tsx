import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import type { Agent, Round } from '@/types/agent';
import { useLiveWorkflow } from '@/hooks/useLiveWorkflow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ToastNotification, useToasts } from '@/components/ToastNotification';
import { ChatPanel } from '@/components/ChatPanel';
import { ThinkingDrawer } from '@/components/ThinkingDrawer';
import { AgentFlow } from '@/components/AgentFlow';
import { themes } from '@/components/panels/ThemeSwitcher';
import type { ThemeName } from '@/components/panels/ThemeSwitcher';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { ScreenFlash } from '@/components/ScreenFlash';
import { soundEngine } from '@/lib/soundEngine';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCcw,
  Keyboard,
  LayoutGrid,
  MessageSquare,
  X,
  ZoomIn,
  ZoomOut,
  Home as HomeIcon,
  Volume2,
  VolumeX,
  Radio,
  Download,
  RefreshCw,
  Database,
} from 'lucide-react';

/** Records API 驱动的像素控制台（与 `/` 本地演示分离）。 */
export default function LiveHome() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const live = useLiveWorkflow(sessionId);
  const { toasts, addToast, removeToast } = useToasts();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<Agent | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [mobileTab, setMobileTab] = useState<'flow' | 'chat'>('flow');
  const [flowScale, setFlowScale] = useLocalStorage<number>('pa.live.flowScale', 0.8);
  const [themeName, setThemeName] = useLocalStorage<ThemeName>('pa.live.theme', 'hacker-green');
  const [soundEnabled, setSoundEnabled] = useLocalStorage<boolean>('pa.sound', true);
  const [roundIndex, setRoundIndex] = useState(0);
  const [clickFlash, setClickFlash] = useState<{ color: string; key: number } | null>(null);

  const theme = themes[themeName];
  const workflow = live.workflow;

  // Sync sound engine with persisted preference on mount and when toggled in another tab
  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    setRoundIndex(0);
  }, [workflow?.id]);

  const currentRound = workflow?.rounds?.[roundIndex];
  const currentAgents: Agent[] = currentRound?.agents || [];
  const triggerClickFlash = useCallback(
    (color?: string) => {
      setClickFlash({ color: color || theme.primary, key: Date.now() });
      setTimeout(() => setClickFlash(null), 550);
    },
    [theme.primary]
  );

  const handleRunCompany = useCallback(async () => {
    soundEngine.statusChange('thinking');
    triggerClickFlash('#f59e0b');
    const out = await live.triggerCompanyRun();
    if (out.ok) addToast('Company async task submitted, refresh to see new sessions', 'success');
    else if (out.message) addToast(out.message, 'error');
    await live.refresh();
  }, [live, addToast, triggerClickFlash]);

  const handleRefresh = useCallback(async () => {
    soundEngine.click();
    triggerClickFlash('#38bdf8');
    await live.refresh();
    addToast('Refreshed', 'info');
  }, [live, addToast, triggerClickFlash]);

  const nextRound = useCallback(() => {
    if (workflow && roundIndex < workflow.rounds.length - 1) setRoundIndex((p) => p + 1);
  }, [roundIndex, workflow]);

  const prevRound = useCallback(() => {
    if (roundIndex > 0) setRoundIndex((p) => p - 1);
  }, [roundIndex]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      triggerClickFlash(next ? '#22c55e' : '#6b7280');
      return next;
    });
  }, [setSoundEnabled, triggerClickFlash]);

  const toggleChat = useCallback(() => {
    setShowChat((v) => {
      if (!v) {
        soundEngine.message();
        triggerClickFlash('#a855f7');
      } else {
        soundEngine.closePanel();
        triggerClickFlash();
      }
      return !v;
    });
  }, [triggerClickFlash]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      if (e.key === 'r' || e.key === 'R') {
        if (live.isSubmitting || !sessionId || !live.runPayload) return;
        void handleRunCompany();
      }
      if (e.key === 'e' || e.key === 'E') {
        soundEngine.openPanel();
        setShowExport(true);
      }
      if (e.key === 'c' || e.key === 'C') toggleChat();
      if (e.key === 'm' || e.key === 'M') toggleSound();
      if (e.key === '+' || e.key === '=') {
        soundEngine.click();
        setFlowScale((s) => Math.min(2.5, s + 0.1));
      }
      if (e.key === '-' || e.key === '_') {
        soundEngine.click();
        setFlowScale((s) => Math.max(0.3, s - 0.1));
      }
      if (e.key === '0') {
        soundEngine.click();
        setFlowScale(1);
      }
      if (e.key === 'Escape') {
        soundEngine.closePanel();
        setShowChat(false);
        setShowExport(false);
        setShowShortcuts(false);
        setSelectedAgent(null);
      }
      if (e.key === '?') {
        soundEngine.openPanel();
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRunCompany, toggleChat, toggleSound, live.isSubmitting, sessionId, live.runPayload, setFlowScale]);

  const showFlowPanel = !isMobile || mobileTab === 'flow';
  const showMobileChat = isMobile && mobileTab === 'chat';

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col pixel-font-body pixel-grid-bg crt-screen"
      style={{ backgroundColor: theme.background, color: theme.foreground }}
    >
      <div className="fixed inset-0 pointer-events-none z-[100] scanline opacity-30" />
      {clickFlash && (
        <div
          key={clickFlash.key}
          className="click-edge-flash"
          style={{ '--flash-color': clickFlash.color } as React.CSSProperties}
        />
      )}

      <header className="shrink-0 border-b border-white/10 px-3 py-2 flex flex-wrap items-center gap-2" style={{ backgroundColor: theme.background }}>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 flex items-center justify-center border"
            style={{ borderColor: theme.primary, backgroundColor: theme.primary + '15' }}
          >
            <Database size={16} style={{ color: theme.primary }} />
          </div>
          <div className="flex flex-col">
            <span className="pixel-font text-[11px] glow-text leading-none" style={{ color: theme.primary }}>
              LIVE · RECORDS
            </span>
            <span className="pixel-font text-[7px] text-white/30 leading-none mt-0.5">API Session Mapping</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[12rem] max-w-xl">
          <label className="pixel-font text-[7px] text-white/40 shrink-0">SESSION</label>
          <select
            className="flex-1 min-w-0 pixel-font text-[9px] bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90"
            value={sessionId || ''}
            onChange={(e) => {
              const v = e.target.value;
              soundEngine.click();
              if (!v) navigate('/live');
              else navigate(`/live/session/${encodeURIComponent(v)}`);
            }}
          >
            <option value="">-- Select Session --</option>
            {live.sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionId.slice(0, 48)} · {s.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pixel-btn-secondary p-1.5 shrink-0"
            title="Refresh list and session"
            onClick={() => void handleRefresh()}
            disabled={live.isLoading}
          >
            <RefreshCw size={12} className={live.isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 mx-auto">
          <span className="pixel-font text-[10px] text-white/70 truncate max-w-[14rem]">{workflow?.name || 'None selected'}</span>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={prevRound} disabled={roundIndex <= 0} className="pixel-btn-secondary p-1 disabled:opacity-30">
              <ChevronLeft size={12} />
            </button>
            <span className="pixel-font text-[8px] w-12 text-center border border-white/10 px-1 py-0.5">
              R {roundIndex + 1}/{workflow?.rounds?.length ?? 0}
            </span>
            <button
              type="button"
              onClick={nextRound}
              disabled={!workflow || roundIndex >= workflow.rounds.length - 1}
              className="pixel-btn-secondary p-1 disabled:opacity-30"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Radio size={10} style={{ color: live.isSubmitting ? '#f59e0b' : theme.primary }} />
            <span className="pixel-font text-[8px]">{live.isSubmitting ? 'SUBMIT' : 'READY'}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => setFlowScale((s) => Math.max(0.3, s - 0.1))} className="pixel-btn-secondary p-1">
              <ZoomOut size={12} />
            </button>
            <span className="pixel-font text-[8px] w-8 text-center text-white/40">{Math.round(flowScale * 100)}%</span>
            <button type="button" onClick={() => setFlowScale((s) => Math.min(2.5, s + 0.1))} className="pixel-btn-secondary p-1">
              <ZoomIn size={12} />
            </button>
            <button type="button" onClick={() => setFlowScale(1)} className="pixel-btn-secondary p-1">
              <HomeIcon size={12} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-auto flex-wrap justify-end">
          <Link to="/" className="pixel-btn-secondary px-2 py-1 pixel-font text-[7px]" onClick={() => soundEngine.click()}>
            DEMO
          </Link>
          <Link
            to={sessionId ? `/live/session/${encodeURIComponent(sessionId)}/archive` : '#'}
            className={`pixel-btn-secondary px-2 py-1 pixel-font text-[7px] ${!sessionId ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={() => sessionId && soundEngine.click()}
          >
            ARCHIVE
          </Link>
          <Link to="/ops" className="pixel-btn-secondary px-2 py-1 pixel-font text-[7px]" onClick={() => soundEngine.click()}>
            OPS
          </Link>
          <button type="button" onClick={() => setShowExport(true)} className="pixel-btn-secondary p-1.5" title="Export (E)">
            <Download size={12} />
          </button>
          <button type="button" onClick={() => setShowShortcuts(true)} className="pixel-btn-secondary p-1.5" title="Shortcuts (?)">
            <Keyboard size={12} />
          </button>
          <button type="button" onClick={toggleSound} className="pixel-btn-secondary p-1.5" title="Sound (M)">
            {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>
          <div className="flex items-center gap-0.5 ml-1">
            {(Object.keys(themes) as ThemeName[]).map((t) => {
              const tc = themes[t];
              const isActive = themeName === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    soundEngine.click();
                    setThemeName(t);
                  }}
                  className="relative p-1 border transition-all"
                  style={{
                    borderColor: isActive ? tc.primary : 'rgba(255,255,255,0.1)',
                    backgroundColor: isActive ? tc.primary + '20' : 'transparent',
                  }}
                  title={tc.name}
                >
                  <div className="w-3 h-3" style={{ backgroundColor: tc.primary }} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleRunCompany()}
            disabled={live.isSubmitting || !sessionId || !live.runPayload}
            className="flex items-center gap-1 px-2 py-1 border transition-all disabled:opacity-40"
            style={{ borderRadius: 4, borderColor: '#22c55e', backgroundColor: '#22c55e' }}
            title="POST /api/run/company?async=1"
          >
            <Play size={12} style={{ color: '#12121a' }} />
            <span className="pixel-font text-[7px] font-bold" style={{ color: '#12121a' }}>
              RERUN
            </span>
          </button>
          <button type="button" onClick={() => void handleRefresh()} className="pixel-btn-secondary p-1.5" title="Reload session">
            <RotateCcw size={12} />
          </button>
          <button type="button" onClick={toggleChat} className="pixel-btn-secondary px-2 py-1.5 flex items-center gap-1">
            <MessageSquare size={10} />
            <span className="pixel-font text-[7px]">CHAT</span>
          </button>
        </div>
      </header>

      {live.error && (
        <div
          className="shrink-0 px-3 py-1.5 border-b border-amber-900/40 bg-amber-950/30 flex items-center gap-2"
          role="alert"
        >
          <span className="text-amber-300 pixel-font text-[9px] flex-1 truncate" title={live.error}>{live.error}</span>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="pixel-btn-secondary px-2 py-0.5 pixel-font text-[8px] shrink-0"
            aria-label="Retry refresh"
          >
            RETRY
          </button>
          <button
            type="button"
            onClick={() => live.setError(null)}
            className="pixel-btn-secondary p-1 shrink-0"
            aria-label="Dismiss error"
          >
            <X size={10} />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {showFlowPanel && (
          <div className="flex-1 overflow-hidden relative flex items-center justify-center">
            {!workflow || live.isLoading ? (
              <div className="text-center pixel-font text-xs text-white/40 px-4">
                {live.isLoading ? 'Loading session...' : 'Select a session above, or run a task in Ops then refresh.'}
              </div>
            ) : (
              <AgentFlow
                agents={currentAgents}
                activeAgentId={null}
                onSelectAgent={setSelectedAgent}
                onShowThinking={setThinkingAgent}
                theme={theme}
                isRunning={false}
                isMobile={isMobile}
                scale={flowScale}
                onScaleChange={setFlowScale}
              />
            )}
          </div>
        )}

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
              <ChatPanel
                theme={theme}
                activeAgentId={null}
                isRunning={live.isSubmitting}
                enableSeedance
                onRunMode={() => { void handleRunCompany(); }}
              />
            </motion.div>
          )}
        </AnimatePresence>

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
              <div className="shrink-0 flex items-center justify-between p-3 border-b border-white/10" style={{ backgroundColor: theme.background }}>
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} style={{ color: theme.primary }} />
                  <span className="pixel-font text-[10px]" style={{ color: theme.primary }}>
                    AGENT CHAT
                  </span>
                </div>
                <button type="button" onClick={() => setMobileTab('flow')} className="pixel-btn-secondary p-1.5">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  theme={theme}
                  activeAgentId={null}
                  isRunning={live.isSubmitting}
                  enableSeedance
                  onRunMode={() => { void handleRunCompany(); }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isMobile && (
        <div className="mobile-tab-bar" style={{ zIndex: 50 }}>
          <button
            type="button"
            onClick={() => setMobileTab('flow')}
            className={`flex flex-col items-center gap-0.5 ${mobileTab === 'flow' ? 'text-green-400' : 'text-white/30'}`}
          >
            <LayoutGrid size={18} />
            <span className="pixel-font text-[7px]">FLOW</span>
          </button>
          <button type="button" onClick={() => void handleRunCompany()} disabled={live.isSubmitting || !sessionId || !live.runPayload}>
            <Play size={20} className={live.isSubmitting ? 'text-yellow-400 animate-pulse' : 'text-green-400'} />
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.message();
              setMobileTab('chat');
            }}
            className={`flex flex-col items-center gap-0.5 relative ${mobileTab === 'chat' ? 'text-green-400' : 'text-white/30'}`}
          >
            <MessageSquare size={18} />
            <span className="pixel-font text-[7px]">CHAT</span>
          </button>
        </div>
      )}

      <ScreenFlash color="#22c55e" trigger={0} />
      <ToastNotification toasts={toasts} onRemove={removeToast} />

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

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-shortcuts-title"
        >
          <div className="pixel-card p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 id="live-shortcuts-title" className="pixel-font text-sm mb-4" style={{ color: theme.primary }}>
              LIVE SHORTCUTS
            </h2>
            <div className="space-y-2 pixel-font-body text-xs text-white/60">
              {[
                ['R', 'Re-submit company (async)'],
                ['E', 'Export'],
                ['C', 'Chat sidebar'],
                ['M', 'Toggle sound'],
                ['+ / -', 'Zoom in / out'],
                ['0', 'Reset zoom'],
                ['?', 'This panel'],
                ['Esc', 'Close panels'],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="pixel-font text-[10px] px-2 py-1 border min-w-[40px] text-center" style={{ borderColor: theme.primary, color: theme.primary }}>
                    {k}
                  </span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelectedAgent(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-agent-detail-title"
        >
          <div className="pixel-card p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 id="live-agent-detail-title" className="pixel-font text-sm" style={{ color: selectedAgent.color }}>
              {selectedAgent.name}
            </h2>
            <p className="pixel-font-body text-xs">{selectedAgent.role}</p>
          </div>
        </div>
      )}

      {thinkingAgent && <ThinkingDrawer agent={thinkingAgent} onClose={() => setThinkingAgent(null)} theme={theme} />}
    </div>
  );
}
