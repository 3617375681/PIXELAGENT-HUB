import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentOutput, AgentOutputAttachment } from '../types/agent';
import { mockAgents } from '../data/mockData';
import { TypewriterText } from './effects/TypewriterText';
import { recordsApi, fetchRecordsBinary, getRecordsApiBaseUrl } from '@/lib/recordsApi';
import { MessageSquare, Clock, User, Radio, Paperclip, Send, Film, ChevronDown, ChevronUp, X } from 'lucide-react';

interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  glow: string;
}

export interface ChatPanelProps {
  messages: AgentOutput[];
  theme: ThemeConfig;
  activeAgentId: string | null;
  isRunning?: boolean;
  /** 有会话且传入 `onSend` 时启用输入区（上传 + 文字触发 company 异步任务）。 */
  sessionId?: string | null;
  onSend?: (text: string, files: File[]) => void | Promise<void>;
  /** 显示 Seedance 2.0 视频生成入口（走后端代理）。 */
  enableSeedance?: boolean;
}

function pickGenerationId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const v = o.generation_id ?? o.generationId ?? o.id;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function pickVideoUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const k of ['video_url', 'output_url', 'url']) {
    const u = o[k];
    if (typeof u === 'string' && u.startsWith('http')) return u;
  }
  const out = o.output ?? o.result;
  if (out && typeof out === 'object') {
    const r = out as Record<string, unknown>;
    for (const k of ['url', 'video_url', 'video']) {
      const u = r[k];
      if (typeof u === 'string' && u.startsWith('http')) return u;
    }
  }
  return null;
}

function pickStatus(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const o = body as Record<string, unknown>;
  const s = o.status ?? o.state;
  return typeof s === 'string' ? s : '';
}

const SessionAttachmentImage: React.FC<{ pathOrUrl: string; alt: string }> = ({ pathOrUrl, alt }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const path = pathOrUrl.startsWith('http') ? new URL(pathOrUrl).pathname + new URL(pathOrUrl).search : pathOrUrl;
    void (async () => {
      try {
        const blob = await fetchRecordsBinary(path);
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setSrc(objectUrl);
      } catch {
        if (!revoked) setSrc(null);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pathOrUrl]);
  if (!src) {
    return <div className="h-24 rounded pixel-border-solid border-white/15 bg-black/30 animate-pulse text-[9px] text-white/30 flex items-center justify-center px-2">加载图片…</div>;
  }
  return <img src={src} alt={alt} className="max-h-40 rounded object-contain border border-white/10" />;
};

function attachmentOpenHref(url: string): string {
  if (url.startsWith('http')) return url;
  const base = getRecordsApiBaseUrl();
  return base ? `${base}${url.startsWith('/') ? url : `/${url}`}` : url;
}

function AttachmentGrid({ items, theme }: { items: AgentOutputAttachment[]; theme: ThemeConfig }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a, i) => {
        const isImg = a.mime.startsWith('image/');
        const openHref = attachmentOpenHref(a.url);
        if (isImg) {
          return (
            <a key={`${a.id || a.name}-${i}`} href={openHref} target="_blank" rel="noreferrer" className="block max-w-[200px]">
              <SessionAttachmentImage pathOrUrl={a.url} alt={a.name} />
            </a>
          );
        }
        return (
          <a
            key={`${a.id || a.name}-${i}`}
            href={openHref}
            target="_blank"
            rel="noreferrer"
            className="pixel-font text-[9px] px-2 py-1 rounded border border-white/20 text-white/70 hover:border-white/40"
            style={{ borderColor: `${theme.primary}55`, color: theme.primary }}
          >
            {a.name}
          </a>
        );
      })}
    </div>
  );
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  theme,
  activeAgentId,
  isRunning = false,
  sessionId,
  onSend,
  enableSeedance = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [typedMessages, setTypedMessages] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<File[]>([]);
  const [seedOpen, setSeedOpen] = useState(false);
  const [sdPrompt, setSdPrompt] = useState('');
  const [sdImageUrl, setSdImageUrl] = useState('');
  const [sdBusy, setSdBusy] = useState(false);
  const [sdGenId, setSdGenId] = useState<string | null>(null);
  const [sdStatus, setSdStatus] = useState('');
  const [sdVideoUrl, setSdVideoUrl] = useState<string | null>(null);
  const [sdErr, setSdErr] = useState<string | null>(null);

  const composerEnabled = Boolean(sessionId && onSend);

  const handleSeedanceCreate = useCallback(async () => {
    const prompt = sdPrompt.trim();
    if (!prompt) {
      setSdErr('请填写视频 prompt');
      return;
    }
    setSdBusy(true);
    setSdErr(null);
    setSdVideoUrl(null);
    setSdGenId(null);
    setSdStatus('');
    try {
      const body: Record<string, unknown> = { prompt };
      const iu = sdImageUrl.trim();
      if (iu) body.image_url = iu;
      const raw = await recordsApi.seedanceCreateVideo(body);
      const gid = pickGenerationId(raw);
      if (!gid) throw new Error('响应中未找到 generation id');
      setSdGenId(gid);
      const early = pickVideoUrl(raw);
      if (early) setSdVideoUrl(early);
    } catch (e) {
      setSdErr(String(e));
    } finally {
      setSdBusy(false);
    }
  }, [sdPrompt, sdImageUrl]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && !typedMessages.has(lastMsg.id)) {
      setTypedMessages((prev) => new Set([...prev, lastMsg.id]));
    }
  }, [messages, typedMessages]);

  useEffect(() => {
    if (!sdGenId || sdVideoUrl) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await recordsApi.seedanceGetVideo(sdGenId);
        if (cancelled) return;
        const st = pickStatus(j);
        setSdStatus(st || '…');
        const vu = pickVideoUrl(j);
        if (vu) {
          setSdVideoUrl(vu);
          return;
        }
      } catch (e) {
        if (!cancelled) setSdErr(String(e));
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sdGenId, sdVideoUrl]);

  const getAgentInfo = useCallback(
    (msg: AgentOutput) => {
      if (msg.role === 'user' || msg.agentId === 'user') {
        return { name: '你', color: theme.primary, icon: '👤' };
      }
      return mockAgents.find((a) => a.id === msg.agentId) || { name: 'Unknown', color: '#888', icon: '❓' };
    },
    [theme.primary],
  );

  const typeColors: Record<string, string> = {
    info: '#00d4ff',
    output: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  const typeLabels: Record<string, string> = {
    info: 'INFO',
    output: 'OUTPUT',
    warning: 'WARN',
    error: 'ERROR',
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    setPicked((prev) => [...prev, ...Array.from(list)]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (!onSend || isRunning) return;
    const t = draft.trim();
    if (!t && picked.length === 0) return;
    await onSend(draft, picked);
    setDraft('');
    setPicked([]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-black/20">
        <MessageSquare size={14} style={{ color: theme.primary }} />
        <span className="pixel-font text-[10px]" style={{ color: theme.primary }}>
          AGENT CHAT
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Radio size={8} className={messages.length > 0 ? 'text-green-400 animate-pulse' : 'text-white/20'} />
          <span className="pixel-font text-[8px] text-white/30">{messages.length} msgs</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto pixel-scrollbar p-3 space-y-3">
        <AnimatePresence>
          {messages.map((msg, index) => {
            const agent = getAgentInfo(msg);
            const isLast = index === messages.length - 1;
            const isActive = activeAgentId === msg.agentId;
            const shouldType = isLast && typedMessages.has(msg.id) && msg.role !== 'user';

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                className={`flex gap-2 ${isLast ? 'mb-2' : ''}`}
              >
                <motion.div
                  className="w-7 h-7 flex items-center justify-center flex-shrink-0 pixel-border-solid"
                  style={{
                    borderColor: isActive ? agent.color : agent.color + '40',
                    backgroundColor: agent.color + '20',
                    fontSize: 14,
                  }}
                  animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  {msg.role === 'user' || msg.agentId === 'user' ? (
                    <User size={14} color={agent.color} />
                  ) : (
                    <span>{agent.icon}</span>
                  )}
                </motion.div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="pixel-font text-[8px]" style={{ color: agent.color }}>
                      {agent.name}
                    </span>
                    <span
                      className="pixel-font text-[7px] px-1"
                      style={{
                        backgroundColor: typeColors[msg.type] + '20',
                        color: typeColors[msg.type],
                        border: `1px solid ${typeColors[msg.type]}`,
                      }}
                    >
                      {msg.role === 'user' ? 'INPUT' : typeLabels[msg.type]}
                    </span>
                    <span className="pixel-font text-[7px] text-white/20 flex items-center gap-0.5 ml-auto">
                      <Clock size={8} />
                      {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div
                    className="pixel-card p-2"
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: isActive ? agent.color : agent.color + '60',
                      backgroundColor: isActive ? agent.color + '12' : agent.color + '05',
                    }}
                  >
                    {shouldType ? (
                      <TypewriterText text={msg.content} speed={20} className="pixel-font-body text-sm leading-relaxed" />
                    ) : (
                      <p className="pixel-font-body text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.attachments && msg.attachments.length > 0 ? (
                      <AttachmentGrid items={msg.attachments} theme={theme} />
                    ) : null}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-white/10 bg-black/20 space-y-2">
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {picked.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 pixel-font text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 max-w-full"
              >
                <span className="truncate max-w-[140px]">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="p-0.5 text-white/40 hover:text-white">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 pixel-card p-2 border-white/10">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              composerEnabled ? '补充说明（会与当前会话 task 合并后提交 company 异步任务）' : '在 Live 页选择会话后可发送'
            }
            rows={2}
            disabled={!composerEnabled || isRunning}
            className="pixel-font-body text-sm w-full bg-transparent outline-none placeholder:text-white/15 text-white/70 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />
            <button
              type="button"
              disabled={!composerEnabled || isRunning}
              onClick={() => fileInputRef.current?.click()}
              className="pixel-btn-secondary p-1.5 shrink-0"
              title="附件"
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              disabled={!composerEnabled || isRunning}
              onClick={() => void handleSend()}
              className="pixel-btn-secondary p-1.5 shrink-0 ml-auto flex items-center gap-1"
              title="发送 (Ctrl+Enter)"
            >
              <Send size={14} />
              <span className="pixel-font text-[8px] text-white/50 hidden sm:inline">Ctrl+Enter</span>
            </button>
          </div>
          {isRunning && <div className="h-0.5 w-full bg-green-500/30 overflow-hidden rounded"><div className="h-full w-1/3 bg-green-400 animate-pulse" /></div>}
        </div>
        {enableSeedance && (
          <div className="border-t border-white/10 pt-2 mt-2">
            <button
              type="button"
              onClick={() => setSeedOpen((v) => !v)}
              className="flex items-center gap-1 w-full pixel-font text-[9px] text-white/50 hover:text-white/80"
            >
              <Film size={12} style={{ color: theme.accent }} />
              Seedance 2.0 视频
              {seedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {seedOpen && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={sdPrompt}
                  onChange={(e) => setSdPrompt(e.target.value)}
                  placeholder="视频描述（必填）"
                  rows={2}
                  className="w-full pixel-font-body text-[11px] bg-black/30 border border-white/15 rounded p-2 outline-none text-white/80 placeholder:text-white/25"
                  disabled={sdBusy}
                />
                <input
                  value={sdImageUrl}
                  onChange={(e) => setSdImageUrl(e.target.value)}
                  placeholder="参考图 URL（可选，需公网可访问）"
                  className="w-full pixel-font-body text-[10px] bg-black/30 border border-white/15 rounded p-1.5 outline-none text-white/70 placeholder:text-white/25"
                  disabled={sdBusy}
                />
                <button
                  type="button"
                  onClick={() => void handleSeedanceCreate()}
                  disabled={sdBusy}
                  className="pixel-btn-secondary text-[10px] py-1 px-2 w-full"
                >
                  {sdBusy ? '提交中…' : '创建生成任务'}
                </button>
                {sdErr && <p className="text-[10px] text-red-400 pixel-font-body">{sdErr}</p>}
                {sdGenId && <p className="text-[9px] text-white/40 break-all">id: {sdGenId}</p>}
                {sdStatus && !sdVideoUrl && <p className="text-[10px] text-amber-200/90">状态: {sdStatus}</p>}
                {sdVideoUrl && (
                  <a
                    href={sdVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] block truncate"
                    style={{ color: theme.primary }}
                  >
                    打开视频
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
