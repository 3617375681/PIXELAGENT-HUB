import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AgentOutput, AgentOutputAttachment } from '../types/agent';
import { mockAgents } from '../data/mockData';
import { useChat } from '../hooks/useChat';
import { recordsApi, fetchRecordsBinary, getRecordsApiBaseUrl } from '@/lib/recordsApi';
import {
  MessageSquare,
  Clock,
  User,
  Radio,
  Paperclip,
  Send,
  Film,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  CornerDownLeft,
  Copy,
  Check,
  RefreshCw,
  ChevronsDown,
} from 'lucide-react';

interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  glow: string;
}

export interface ChatPanelProps {
  theme: ThemeConfig;
  activeAgentId: string | null;
  isRunning?: boolean;
  enableSeedance?: boolean;
  /** 当用户使用 /run 指令时回调 */
  onRunMode?: (mode: string, args: string) => void | Promise<void>;
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
    return <div className="h-24 rounded pixel-border-solid border-white/15 bg-black/30 animate-pulse text-[9px] text-white/30 flex items-center justify-center px-2">Loading image...</div>;
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

// ---- Markdown renderer with syntax-highlighted code blocks ----
const MarkdownCodeBlock: React.FC<{ language: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="relative my-2 group">
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity pixel-font text-[8px] px-1.5 py-0.5 rounded bg-black/70 text-white/70 hover:text-white border border-white/15"
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{ margin: 0, fontSize: '12px', borderRadius: 4, padding: '8px 12px' }}
        codeTagProps={{ style: { fontSize: '12px', fontFamily: 'ui-monospace, monospace' } }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

const MarkdownContent: React.FC<{ content: string }> = React.memo(({ content }) => {
  return (
    <div className="pixel-font-body text-sm leading-relaxed prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, '');
            const match = /language-(\w+)/.exec(className || '');
            // Treat as block if it contains a newline OR has a language tag
            const isBlock = match || text.includes('\n');
            if (isBlock) {
              return <MarkdownCodeBlock language={match?.[1] || ''} value={text} />;
            }
            return (
              <code className="bg-white/10 px-1 py-0.5 rounded text-[12px] font-mono" {...props}>
                {children}
              </code>
            );
          },
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mb-1">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/30 pl-3 my-2 italic text-white/60">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-[12px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-white/20 px-2 py-1 text-left bg-white/5 font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-white/15 px-2 py-1">{children}</td>,
          hr: () => <hr className="my-3 border-white/15" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

export const ChatPanel: React.FC<ChatPanelProps> = ({
  theme,
  activeAgentId,
  enableSeedance = false,
  onRunMode,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileUrlsRef = useRef<Map<File, string>>(new Map());

  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Slash menu state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashMatches, setSlashMatches] = useState<ReturnType<typeof useChat>['slashCommands']>([]);

  // Seedance state
  const [seedOpen, setSeedOpen] = useState(false);
  const [sdPrompt, setSdPrompt] = useState('');
  const [sdImageUrl, setSdImageUrl] = useState('');
  const [sdBusy, setSdBusy] = useState(false);
  const [sdGenId, setSdGenId] = useState<string | null>(null);
  const [sdStatus, setSdStatus] = useState('');
  const [sdVideoUrl, setSdVideoUrl] = useState<string | null>(null);
  const [sdErr, setSdErr] = useState<string | null>(null);

  const {
    messages,
    agentOutputs,
    isStreaming,
    sendMessage,
    cancelStream,
    retryLast,
    regenerateLast,
    slashCommands,
  } = useChat({ onRunMode });

  // ---- Manage object URLs for image previews (avoid memory leak) ----
  useEffect(() => {
    const cache = fileUrlsRef.current;
    const currentSet = new Set(picked);
    // Revoke URLs for files no longer attached
    for (const [file, url] of cache) {
      if (!currentSet.has(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }
    // Create URLs for new image files
    for (const f of picked) {
      if (f.type.startsWith('image/') && !cache.has(f)) {
        cache.set(f, URL.createObjectURL(f));
      }
    }
  }, [picked]);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    const cache = fileUrlsRef.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  // ---- Auto-scroll only when user is near the bottom ----
  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, atBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAtBottom(scrollHeight - scrollTop - clientHeight < 80);
  }, []);

  const jumpToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAtBottom(true);
    }
  }, []);

  // ---- Auto-grow textarea ----
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [draft]);

  // Seedance polling
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

  const handleSeedanceCreate = useCallback(async () => {
    const prompt = sdPrompt.trim();
    if (!prompt) {
      setSdErr('Please enter a video prompt');
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
      if (!gid) throw new Error('No generation id found in response');
      setSdGenId(gid);
      const early = pickVideoUrl(raw);
      if (early) setSdVideoUrl(early);
    } catch (e) {
      setSdErr(String(e));
    } finally {
      setSdBusy(false);
    }
  }, [sdPrompt, sdImageUrl]);

  const getAgentInfo = useCallback(
    (msg: AgentOutput) => {
      if (msg.role === 'user' || msg.agentId === 'user') {
        return { name: 'You', color: theme.primary, icon: '👤' };
      }
      return mockAgents.find((a) => a.id === msg.agentId) || { name: 'Assistant', color: '#888', icon: '🤖' };
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

  // ---- File handling ----
  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    setPicked((prev) => [...prev, ...Array.from(list)]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- Drag & drop ----
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPicked((prev) => [...prev, ...files]);
    }
  };

  // ---- Paste image ----
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      setPicked((prev) => [...prev, ...imageFiles]);
    }
  }, []);

  // ---- Slash command detection ----
  const updateSlashMenu = useCallback(
    (value: string, cursorPos: number) => {
      // Use the real cursor position so the slash menu also triggers mid-text
      const textBeforeCursor = value.slice(0, cursorPos);
      const slashMatch = textBeforeCursor.match(/(?:^|\s)\/(\S*)$/);
      if (slashMatch) {
        const query = slashMatch[1].toLowerCase();
        const matches = slashCommands.filter(
          (c) => c.cmd.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query)
        );
        if (matches.length > 0) {
          setSlashMatches(matches);
          setSlashOpen(true);
          setSlashIdx(0);
          return;
        }
      }
      setSlashOpen(false);
      setSlashMatches([]);
      setSlashIdx(0);
    },
    [slashCommands],
  );

  // ---- Send ----
  const handleSend = useCallback(async () => {
    const t = draft.trim();
    if (!t && picked.length === 0) return;
    if (isStreaming) return;

    setSlashOpen(false);
    await sendMessage(draft, picked.length > 0 ? picked : undefined);
    setDraft('');
    setPicked([]);
    // Refocus textarea
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [draft, picked, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash menu keyboard nav
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = slashMatches[slashIdx];
        if (cmd) {
          // Replace the slash text with the full command
          setDraft((prev) => {
            const replaced = prev.replace(/(?:^|\s)\/\S*$/, `/${cmd.cmd} `);
            return replaced;
          });
          setSlashOpen(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

    // Send on Ctrl+Enter or Cmd+Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    const cursorPos = e.target.selectionStart ?? value.length;
    updateSlashMenu(value, cursorPos);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-black/20">
        <MessageSquare size={14} style={{ color: theme.primary }} />
        <span className="pixel-font text-[10px]" style={{ color: theme.primary }}>
          AGENT CHAT
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {isStreaming && (
            <span className="pixel-font text-[7px] text-amber-400 animate-pulse mr-1">STREAMING</span>
          )}
          <Radio size={8} className={messages.length > 0 ? 'text-green-400 animate-pulse' : 'text-white/20'} />
          <span className="pixel-font text-[8px] text-white/30">{messages.length} msgs</span>
        </div>
      </div>

      {/* Messages area (wrapped in relative container so drag overlay + jump button position correctly) */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-auto pixel-scrollbar p-3 space-y-3"
          onDragOver={handleDragOver}
        >
          <AnimatePresence>
            {agentOutputs.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-white/20 gap-3"
              >
                <Zap size={32} style={{ color: theme.primary + '40' }} />
                <p className="pixel-font text-[10px] text-center leading-relaxed">
                  Start a conversation with the AI agents.<br />
                  Type <span style={{ color: theme.primary }}>/</span> for commands, or attach files/images.
                </p>
                <div className="flex flex-wrap gap-1 justify-center max-w-[280px]">
                  {slashCommands.slice(0, 6).map((cmd) => (
                    <button
                      key={cmd.cmd}
                      type="button"
                      onClick={() => {
                        setDraft(`/${cmd.cmd} `);
                        textareaRef.current?.focus();
                      }}
                      className="pixel-font text-[7px] px-1.5 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                    >
                      /{cmd.cmd}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {agentOutputs.map((msg, index) => {
              const agent = getAgentInfo(msg);
              const isLast = index === agentOutputs.length - 1;
              const isActive = activeAgentId === msg.agentId;
              const isUser = msg.role === 'user' || msg.agentId === 'user';
              const isStreamingMsg = isLast && msg.type === 'info' && isStreaming;
              const canRegenerate = !isUser && isLast && !isStreaming && msg.type !== 'error';

              const copyContent = () => {
                void navigator.clipboard.writeText(msg.content);
                setCopiedMsgId(msg.id);
                window.setTimeout(() => setCopiedMsgId((cur) => (cur === msg.id ? null : cur)), 1200);
              };

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
                  className={`group flex gap-2 ${isLast ? 'mb-2' : ''}`}
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
                    {isUser ? (
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
                        {isUser ? 'INPUT' : isStreamingMsg ? 'STREAMING' : typeLabels[msg.type]}
                      </span>
                      {msg.type === 'error' && (
                        <button
                          type="button"
                          onClick={() => retryLast()}
                          className="pixel-font text-[7px] px-1 text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 rounded"
                        >
                          RETRY
                        </button>
                      )}
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
                      className="pixel-card p-2 relative"
                      style={{
                        borderLeftWidth: 3,
                        borderLeftColor: isActive ? agent.color : agent.color + '60',
                        backgroundColor: isActive ? agent.color + '12' : agent.color + '05',
                      }}
                    >
                      {isUser ? (
                        <p className="pixel-font-body text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content || (isStreamingMsg ? '...' : '')}
                        </p>
                      ) : msg.content ? (
                        <MarkdownContent content={msg.content} />
                      ) : (
                        <p className="pixel-font-body text-sm text-white/30">{isStreamingMsg ? '...' : ''}</p>
                      )}
                      {isStreamingMsg && (
                        <span className="inline-block w-2 h-4 bg-white/50 animate-pulse ml-0.5 align-middle" />
                      )}
                      {msg.attachments && msg.attachments.length > 0 ? (
                        <AttachmentGrid items={msg.attachments} theme={theme} />
                      ) : null}

                      {/* Hover actions for assistant messages */}
                      {!isUser && msg.content && (
                        <div className="absolute -bottom-2 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            type="button"
                            onClick={copyContent}
                            title={copiedMsgId === msg.id ? 'Copied!' : 'Copy message'}
                            className="pixel-font text-[8px] px-1.5 py-0.5 rounded bg-black/70 text-white/60 hover:text-white border border-white/15 flex items-center gap-1"
                          >
                            {copiedMsgId === msg.id ? <Check size={9} /> : <Copy size={9} />}
                            {copiedMsgId === msg.id ? 'COPIED' : 'COPY'}
                          </button>
                          {canRegenerate && (
                            <button
                              type="button"
                              onClick={() => regenerateLast()}
                              title="Regenerate response"
                              className="pixel-font text-[8px] px-1.5 py-0.5 rounded bg-black/70 text-white/60 hover:text-white border border-white/15 flex items-center gap-1"
                            >
                              <RefreshCw size={9} />
                              REGEN
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Drag overlay — positioned relative to outer container so it doesn't scroll with content */}
        <AnimatePresence>
          {dragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              style={{ backgroundColor: theme.primary + '15', border: `2px dashed ${theme.primary}40` }}
            >
              <div className="text-center">
                <Paperclip size={32} style={{ color: theme.primary }} className="mx-auto mb-2" />
                <p className="pixel-font text-[10px]" style={{ color: theme.primary }}>Drop files to attach</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Jump-to-bottom button when user has scrolled up */}
        <AnimatePresence>
          {!atBottom && agentOutputs.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              onClick={jumpToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pixel-font text-[9px] px-2.5 py-1 rounded-full bg-black/70 hover:bg-black/85 text-white/80 border border-white/20 flex items-center gap-1 shadow-lg"
              style={{ color: theme.primary }}
              title="Jump to latest"
            >
              <ChevronsDown size={12} />
              {isStreaming ? 'New messages' : 'Jump to latest'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Composer area */}
      <div
        ref={dropZoneRef}
        className="p-3 border-t border-white/10 bg-black/20 space-y-2 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attached files preview */}
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {picked.map((f, i) => {
              const isImg = f.type.startsWith('image/');
              const previewUrl = isImg ? fileUrlsRef.current.get(f) : undefined;
              return (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 pixel-font text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 max-w-full"
                >
                  {isImg && previewUrl && (
                    <img
                      src={previewUrl}
                      alt={f.name}
                      className="w-4 h-4 object-cover rounded"
                    />
                  )}
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="p-0.5 text-white/40 hover:text-white">
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Slash command menu */}
        <AnimatePresence>
          {slashOpen && slashMatches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-full left-3 right-3 mb-1 z-20 pixel-card border-white/20 max-h-48 overflow-y-auto pixel-scrollbar"
              style={{ backgroundColor: theme.background }}
            >
              {slashMatches.map((cmd, i) => (
                <button
                  key={cmd.cmd}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => {
                      const replaced = prev.replace(/(?:^|\s)\/\S*$/, `/${cmd.cmd} `);
                      return replaced;
                    });
                    setSlashOpen(false);
                    textareaRef.current?.focus();
                  }}
                  onMouseEnter={() => setSlashIdx(i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    i === slashIdx ? 'bg-white/10' : ''
                  }`}
                >
                  <span className="pixel-font text-[10px] shrink-0" style={{ color: theme.primary }}>
                    /{cmd.cmd}
                  </span>
                  <span className="pixel-font-body text-[9px] text-white/50 truncate">{cmd.desc}</span>
                  <span className="pixel-font text-[7px] text-white/20 ml-auto shrink-0 hidden sm:inline">{cmd.usage}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="flex flex-col gap-2 pixel-card p-2 border-white/10">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message... (Type / for commands, Ctrl/⌘+Enter to send)"
            rows={1}
            className="pixel-font-body text-sm w-full bg-transparent outline-none placeholder:text-white/15 text-white/70 resize-none overflow-y-auto min-h-[40px] max-h-[200px]"
          />
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} accept="image/*,.pdf,.txt,.md,.json,.csv,.js,.ts,.py" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pixel-btn-secondary p-1.5 shrink-0"
              title="Attach files"
            >
              <Paperclip size={14} />
            </button>
            {isStreaming ? (
              <button
                type="button"
                onClick={cancelStream}
                className="pixel-btn-secondary p-1.5 shrink-0 ml-auto flex items-center gap-1 text-amber-400"
                title="Stop streaming"
              >
                <X size={14} />
                <span className="pixel-font text-[8px] hidden sm:inline">STOP</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!draft.trim() && picked.length === 0}
                className="pixel-btn-secondary p-1.5 shrink-0 ml-auto flex items-center gap-1 disabled:opacity-30"
                title="Send (Ctrl+Enter)"
              >
                <Send size={14} />
                <span className="pixel-font text-[8px] text-white/50 hidden sm:inline">
                  <CornerDownLeft size={10} className="inline" />
                </span>
              </button>
            )}
          </div>
          {isStreaming && (
            <div className="h-0.5 w-full bg-amber-500/30 overflow-hidden rounded">
              <div className="h-full w-1/3 bg-amber-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* Seedance section */}
        {enableSeedance && (
          <div className="border-t border-white/10 pt-2 mt-2">
            <button
              type="button"
              onClick={() => setSeedOpen((v) => !v)}
              className="flex items-center gap-1 w-full pixel-font text-[9px] text-white/50 hover:text-white/80"
            >
              <Film size={12} style={{ color: theme.accent }} />
              Seedance 2.0 Video
              {seedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {seedOpen && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={sdPrompt}
                  onChange={(e) => setSdPrompt(e.target.value)}
                  placeholder="Video description (required)"
                  rows={2}
                  className="w-full pixel-font-body text-[11px] bg-black/30 border border-white/15 rounded p-2 outline-none text-white/80 placeholder:text-white/25"
                  disabled={sdBusy}
                />
                <input
                  value={sdImageUrl}
                  onChange={(e) => setSdImageUrl(e.target.value)}
                  placeholder="Reference image URL (optional, must be publicly accessible)"
                  className="w-full pixel-font-body text-[10px] bg-black/30 border border-white/15 rounded p-1.5 outline-none text-white/70 placeholder:text-white/25"
                  disabled={sdBusy}
                />
                <button
                  type="button"
                  onClick={() => void handleSeedanceCreate()}
                  disabled={sdBusy}
                  className="pixel-btn-secondary text-[10px] py-1 px-2 w-full"
                >
                  {sdBusy ? 'Submitting...' : 'Create Generation Task'}
                </button>
                {sdErr && <p className="text-[10px] text-red-400 pixel-font-body">{sdErr}</p>}
                {sdGenId && <p className="text-[9px] text-white/40 break-all">id: {sdGenId}</p>}
                {sdStatus && !sdVideoUrl && <p className="text-[10px] text-amber-200/90">Status: {sdStatus}</p>}
                {sdVideoUrl && (
                  <a
                    href={sdVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] block truncate"
                    style={{ color: theme.primary }}
                  >
                    Open Video
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
