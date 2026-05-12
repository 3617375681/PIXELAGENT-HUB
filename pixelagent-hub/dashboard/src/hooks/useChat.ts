import { useCallback, useRef, useState } from 'react';
import type { AgentOutput, AgentOutputAttachment } from '../types/agent';
import { getRecordsApiBaseUrl } from '@/lib/recordsApi';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: AgentOutputAttachment[];
  status?: 'sending' | 'streaming' | 'done' | 'error';
  error?: string;
  llmUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string };
}

export interface SlashCommand {
  cmd: string;
  desc: string;
  usage: string;
  action: (args: string) => void | Promise<void>;
}

export interface UseChatOptions {
  /** Override the backend chat URL (default: /api/chat) */
  chatUrl?: string;
  /** Called when slash command /run is used */
  onRunMode?: (mode: string, args: string) => void | Promise<void>;
  /** Chat history initializer */
  initialMessages?: ChatMessage[];
}

export function useChat(opts: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initialMessages || []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const baseUrl = opts.chatUrl || getRecordsApiBaseUrl();
  const chatPath = baseUrl ? `${baseUrl}/api/chat` : '/api/chat';

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      if (next.length > 0) {
        next[next.length - 1] = updater(next[next.length - 1]);
      }
      return next;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(async (
    text: string,
    files?: File[],
    opts?: { systemPrompt?: string; historyOverride?: ChatMessage[] },
  ) => {
    const trimmed = text.trim();
    if (!trimmed && (!files || files.length === 0)) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Build user message
    const content = trimmed || 'Analyze these files';
    let userAttachments: AgentOutputAttachment[] | undefined;

    if (files && files.length > 0) {
      userAttachments = await Promise.all(
        files.map(async (f, i) => {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          });
          return {
            id: `file-${Date.now()}-${i}`,
            name: f.name,
            mime: f.type || 'application/octet-stream',
            url: data,
          };
        })
      );
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: userAttachments,
      status: 'done',
    };
    addMessage(userMsg);

    // Build payload — allow caller to override history (used by regenerateLast)
    const historyForApi = opts?.historyOverride ?? messages;
    const apiMessages = historyForApi.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    apiMessages.push({ role: 'user' as const, content });

    const body: Record<string, unknown> = {
      messages: apiMessages,
      stream: true,
      ...(opts?.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
    };

    // Add file data if present
    if (files && files.length > 0) {
      body.files = await Promise.all(
        files.map(async (f) => {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          });
          return { name: f.name, mime: f.type, data };
        })
      );
    }

    // Assistant placeholder
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };
    addMessage(assistantMsg);
    setIsStreaming(true);

    try {
      const res = await fetch(chatPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(import.meta.env.VITE_RECORDS_API_KEY
            ? { 'X-API-Key': import.meta.env.VITE_RECORDS_API_KEY }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as any)?.error?.message || (errBody as any)?.message || `HTTP ${res.status}`
        );
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/event-stream')) {
        // SSE streaming
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6);
              try {
                const event = JSON.parse(raw) as Record<string, unknown>;

                if (line.includes('event: done') || (event as any)._done) {
                  updateLastMessage((msg) => ({
                    ...msg,
                    status: 'done',
                    content: (event.content as string) || msg.content,
                    llmUsage: event.llmUsage as ChatMessage['llmUsage'],
                  }));
                } else if (line.includes('event: text') || typeof event.delta === 'string') {
                  updateLastMessage((msg) => ({
                    ...msg,
                    content: msg.content + (event.delta as string),
                  }));
                } else if (line.includes('event: error')) {
                  updateLastMessage((msg) => ({
                    ...msg,
                    status: 'error',
                    error: (event.message as string) || 'Unknown error',
                  }));
                } else if (line.includes('event: done')) {
                  updateLastMessage((msg) => ({
                    ...msg,
                    status: 'done',
                    content: (event.content as string) || msg.content,
                    llmUsage: event.llmUsage as ChatMessage['llmUsage'],
                  }));
                }
              } catch {
                // Skip unparseable lines
              }
            }
          }
        }
        updateLastMessage((msg) => ({ ...msg, status: 'done' }));
      } else {
        // Non-streaming JSON response
        const json = await res.json();
        updateLastMessage((msg) => ({
          ...msg,
          status: 'done',
          content: (json as any).content || JSON.stringify(json),
          llmUsage: (json as any).llmUsage,
        }));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateLastMessage((msg) => ({ ...msg, status: 'done', content: msg.content || '(cancelled)' }));
      } else {
        updateLastMessage((msg) => ({
          ...msg,
          status: 'error',
          error: String(err?.message || err),
        }));
      }
    } finally {
      setIsStreaming(false);
    }
  }, [messages, addMessage, updateLastMessage, chatPath]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryLast = useCallback(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.status === 'error') {
      setMessages((prev) => prev.slice(0, -2)); // Remove failed assistant + its user
      // Re-send the user message before it
      const userMsg = [...messages].reverse().find((m) => m.role === 'user' && m.id < last.id);
      if (userMsg) {
        void sendMessage(userMsg.content);
      }
    }
  }, [messages, sendMessage]);

  /**
   * Re-run the last user prompt. Removes the latest assistant response (if any)
   * and re-sends the most recent user message with the same conversation context.
   */
  const regenerateLast = useCallback(() => {
    let userIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) return;
    const userMsg = messages[userIdx];
    const truncated = messages.slice(0, userIdx);
    setMessages(truncated);
    void sendMessage(userMsg.content, undefined, { historyOverride: truncated });
  }, [messages, sendMessage]);

  // Slash commands registry
  const slashCommands: SlashCommand[] = [
    {
      cmd: '/clear',
      desc: '清空当前对话',
      usage: '/clear',
      action: () => { clearMessages(); },
    },
    {
      cmd: '/help',
      desc: '显示所有可用命令',
      usage: '/help',
      action: () => {
        const helpText = slashCommands.map((c) => `**${c.cmd}** — ${c.desc}\n\`${c.usage}\``).join('\n');
        addMessage({
          id: `help-${Date.now()}`,
          role: 'system',
          content: `# Available Commands\n\n${helpText}`,
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/run',
      desc: '触发多 Agent 编排模式',
      usage: '/run [pipeline|parallel|debate|vote|roundtable|company]',
      action: (args) => {
        const mode = args.trim();
        if (opts.onRunMode && mode) {
          void opts.onRunMode(mode, args.slice(mode.length).trim());
        } else {
          addMessage({
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `Usage: /run [mode] where mode = pipeline | parallel | debate | vote | roundtable | company`,
            timestamp: Date.now(),
            status: 'done',
          });
        }
      },
    },
    {
      cmd: '/export',
      desc: '导出当前对话为 Markdown',
      usage: '/export',
      action: () => {
        const md = messages.map((m) => {
          const prefix = m.role === 'user' ? '## You' : m.role === 'assistant' ? '## Assistant' : '## System';
          return `${prefix}\n\n${m.content}\n`;
        }).join('\n---\n');
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
      },
    },
    {
      cmd: '/system',
      desc: '设置系统提示词',
      usage: '/system <prompt>',
      action: (_args) => {
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: 'System prompt set for subsequent messages.',
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/tokens',
      desc: '显示当前对话 token 用量',
      usage: '/tokens',
      action: () => {
        const tokenMsgs = messages.filter((m) => m.llmUsage);
        let total = 0;
        let prompt = 0;
        let completion = 0;
        tokenMsgs.forEach((m) => {
          if (m.llmUsage) {
            total += m.llmUsage.total_tokens;
            prompt += m.llmUsage.prompt_tokens;
            completion += m.llmUsage.completion_tokens;
          }
        });
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `## Token Usage\n\n- Total: ${total}\n- Prompt: ${prompt}\n- Completion: ${completion}\n- Est. cost: $${((total / 1000) * 0.002).toFixed(4)}`,
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/model',
      desc: '显示当前模型信息',
      usage: '/model',
      action: () => {
        const last = [...messages].reverse().find((m) => m.llmUsage?.model);
        const model = last?.llmUsage?.model || 'default (auto-select)';
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Current model: **${model}**\n\nTo change models, set \`LLM_PROVIDER\` environment variable on the server (openai | anthropic | deepseek | kimi | ollama | custom).`,
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/session',
      desc: '查看当前会话信息',
      usage: '/session',
      action: () => {
        const msgCount = messages.length;
        const userMsgs = messages.filter((m) => m.role === 'user').length;
        const assistantMsgs = messages.filter((m) => m.role === 'assistant').length;
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `## Session Info\n\n- Messages: ${msgCount}\n- User: ${userMsgs}\n- Assistant: ${assistantMsgs}\n- Started: ${messages[0] ? new Date(messages[0].timestamp).toLocaleString() : 'N/A'}`,
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/debug',
      desc: '切换调试模式（显示原始响应）',
      usage: '/debug',
      action: () => {
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: 'Debug mode toggled. Raw LLM responses will be shown.',
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
    {
      cmd: '/code',
      desc: '切换到代码模式（用 Coder agent）',
      usage: '/code <task description>',
      action: (args) => {
        if (args.trim()) {
          addMessage({
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `Switching to code mode. Task: "${args.trim()}"\nThe Coder agent will be used for this request.`,
            timestamp: Date.now(),
            status: 'done',
          });
          void sendMessage(args.trim());
        } else {
          addMessage({
            id: `sys-${Date.now()}`,
            role: 'system',
            content: 'Usage: /code <task description>',
            timestamp: Date.now(),
            status: 'done',
          });
        }
      },
    },
    {
      cmd: '/image',
      desc: '分析图片（请先上传图片文件）',
      usage: '/image <optional question>',
      action: () => {
        addMessage({
          id: `sys-${Date.now()}`,
          role: 'system',
          content: 'Please attach an image file using the upload button (📎) or drag & drop, then ask your question.',
          timestamp: Date.now(),
          status: 'done',
        });
      },
    },
  ];

  const getSlashCompletions = useCallback((query: string): SlashCommand[] => {
    const q = query.toLowerCase();
    return slashCommands.filter((c) => c.cmd.startsWith('/') && c.cmd.toLowerCase().includes(q));
  }, [slashCommands]);

  // Convert to AgentOutput format for ChatPanel display compatibility
  const agentOutputs = messages.map((m): AgentOutput => ({
    id: m.id,
    agentId: m.role === 'user' ? 'user' : 'assistant',
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    timestamp: m.timestamp,
    type: m.status === 'error' ? 'error' : m.status === 'streaming' ? 'info' : 'output',
    attachments: m.attachments,
  }));

  return {
    messages,
    agentOutputs,
    isStreaming,
    sendMessage,
    cancelStream,
    clearMessages,
    retryLast,
    regenerateLast,
    addMessage,
    slashCommands,
    slashQuery,
    setSlashQuery,
    showSlashMenu,
    setShowSlashMenu,
    getSlashCompletions,
  };
}
