// PixelAgent Hub — Chat Page
// 聊天页面 — 核心交互入口

import { chatSync, chatStream, healthCheck, ChatResponse } from '../../utils/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: Array<{ id: string; name: string; mime: string; url: string }>;
  status: 'sending' | 'streaming' | 'done' | 'error';
  error?: string;
  llmUsage?: any;
}

interface SlashCommand {
  cmd: string;
  desc: string;
  usage: string;
}

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ===== Slash Commands Registry =====
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: 'clear', desc: 'Clear current conversation', usage: '/clear' },
  { cmd: 'help', desc: 'Show available commands', usage: '/help' },
  { cmd: 'export', desc: 'Export chat as Markdown', usage: '/export' },
  { cmd: 'tokens', desc: 'Show token usage', usage: '/tokens' },
  { cmd: 'model', desc: 'Show current model', usage: '/model' },
  { cmd: 'session', desc: 'Show session info', usage: '/session' },
  { cmd: 'code', desc: 'Switch to code mode', usage: '/code <task>' },
  { cmd: 'image', desc: 'Analyze image (attach file first)', usage: '/image <question>' },
  { cmd: 'run', desc: 'Trigger agent orchestration', usage: '/run <mode>' },
  { cmd: 'debug', desc: 'Toggle debug mode', usage: '/debug' },
];

Page({
  data: {
    messages: [] as ChatMessage[],
    draft: '',
    streaming: false,
    streamAbort: null as WechatMiniprogram.RequestTask | null,
    pickedFiles: [] as Array<{ name: string; path: string; size: number }>,
    showSlashMenu: false,
    slashQuery: '',
    slashMatches: [] as SlashCommand[],
    slashIdx: 0,
    showImageViewer: false,
    imageViewerUrl: '',
    scrollToView: '',
    sessionId: '',
    tokensTotal: 0,
    debugMode: false,
  },

  onLoad(options: { sessionId?: string }) {
    if (options.sessionId) {
      this.setData({ sessionId: options.sessionId });
    }
    this.checkApiConnection();
  },

  async checkApiConnection() {
    try {
      const res = await healthCheck();
      if (res?.ok) {
        console.log('[Chat] Backend connected');
      }
    } catch {
      console.warn('[Chat] Backend not reachable');
    }
  },

  // ===== Message Input =====
  onDraftInput(e: any) {
    const value: string = e.detail.value;
    this.setData({ draft: value });
    this.detectSlash(value);
  },

  detectSlash(value: string) {
    // Match slash command at end of text
    const match = value.match(/(?:^|\s)\/(\S*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const matches = SLASH_COMMANDS.filter(
        (c) => c.cmd.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        this.setData({
          showSlashMenu: true,
          slashQuery: query,
          slashMatches: matches,
          slashIdx: 0,
        });
        return;
      }
    }
    this.setData({ showSlashMenu: false, slashMatches: [] });
  },

  onSlashSelect(e: any) {
    const idx = e.currentTarget.dataset.index;
    const cmd = this.data.slashMatches[idx];
    if (cmd) {
      const replaced = this.data.draft.replace(/(?:^|\s)\/\S*$/, `/${cmd.cmd} `);
      this.setData({ draft: replaced, showSlashMenu: false });
    }
  },

  // ===== File Handling =====
  onPickFile() {
    wx.chooseMessageFile({
      count: 5,
      type: 'all',
      success: (res) => {
        this.setData({
          pickedFiles: [...this.data.pickedFiles, ...res.tempFiles.map((f) => ({
            name: f.name || 'file',
            path: f.path,
            size: f.size,
          }))],
        });
      },
    });
  },

  onPickImage() {
    wx.chooseMedia({
      count: 4,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          pickedFiles: [...this.data.pickedFiles, ...res.tempFiles.map((f, i) => ({
            name: `image_${Date.now()}_${i}.jpg`,
            path: f.tempFilePath,
            size: f.size,
          }))],
        });
      },
    });
  },

  onRemoveFile(e: any) {
    const idx = e.currentTarget.dataset.index;
    const files = [...this.data.pickedFiles];
    files.splice(idx, 1);
    this.setData({ pickedFiles: files });
  },

  onPreviewFile(e: any) {
    const idx = e.currentTarget.dataset.index;
    const file = this.data.pickedFiles[idx];
    if (file) {
      wx.showToast({ title: file.name, icon: 'none' });
    }
  },

  // ===== Send Message =====
  async onSend() {
    const { draft, pickedFiles, streaming } = this.data;
    if (streaming) return;
    const text = draft.trim();
    if (!text && pickedFiles.length === 0) return;

    // Check if it's a slash command
    const slashMatch = text.match(/^\/(\S+)\s*(.*)$/);
    if (slashMatch) {
      this.executeSlashCommand(slashMatch[1], slashMatch[2]);
      this.setData({ draft: '', showSlashMenu: false });
      return;
    }

    const content = text || 'Analyze these files';

    // Build user message
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'done',
    };

    // Process attachments
    if (pickedFiles.length > 0) {
      const attachments = await this.processFiles(pickedFiles);
      userMsg.attachments = attachments;
    }

    this.setData({
      messages: [...this.data.messages, userMsg],
      draft: '',
      pickedFiles: [],
      showSlashMenu: false,
      scrollToView: userMsg.id,
    });

    // Add assistant placeholder
    const assistantMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };

    this.setData({
      messages: [...this.data.messages, assistantMsg],
      streaming: true,
      scrollToView: assistantMsg.id,
    });

    // Build API messages
    const apiMessages = this.data.messages
      .filter((m) => m.status === 'done' || m.status === 'streaming')
      .map((m) => ({ role: m.role, content: m.content }));

    // Only add the new user content if not already added
    if (apiMessages[apiMessages.length - 1]?.role !== 'user') {
      apiMessages.push({ role: 'user' as const, content });
    }

    // Try SSE streaming first
    this.sendStreaming(apiMessages, assistantMsg, pickedFiles);
  },

  async processFiles(files: Array<{ name: string; path: string; size: number }>) {
    const attachments: ChatMessage['attachments'] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = `file-${Date.now()}-${i}`;
      const isImage = f.name.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i) ||
        f.path.match(/\.(png|jpg|jpeg|gif|webp|bmp)/i);

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          (wx as any).getFileSystemManager().readFile({
            filePath: f.path,
            encoding: 'base64',
            success: (res: any) => resolve(res.data as string),
            fail: reject,
          });
        });

        const mime = isImage ? 'image/png' : 'application/octet-stream';
        attachments.push({
          id,
          name: f.name,
          mime,
          url: `data:${mime};base64,${base64}`,
        });
      } catch {
        // Fallback: use temp path
        attachments.push({
          id,
          name: f.name,
          mime: isImage ? 'image/png' : 'application/octet-stream',
          url: f.path,
        });
      }
    }
    return attachments;
  },

  sendStreaming(
    apiMessages: Array<{ role: string; content: any }>,
    assistantMsg: ChatMessage,
    files?: Array<{ name: string; path: string; size: number }>,
  ) {
    const updateMsg = (updates: Partial<ChatMessage>) => {
      const msgs = [...this.data.messages];
      const idx = msgs.findIndex((m) => m.id === assistantMsg.id);
      if (idx >= 0) {
        msgs[idx] = { ...msgs[idx], ...updates };
        this.setData({ messages: msgs, scrollToView: assistantMsg.id });
      }
    };

    // Build file data if present
    let fileData: Array<{ name: string; mime: string; data: string }> | undefined;
    if (files && files.length > 0) {
      fileData = [];
      for (const f of files) {
        fileData.push({
          name: f.name,
          mime: 'application/octet-stream',
          data: f.path, // WeChat will resolve the temp file
        });
      }
    }

    // Fallback to JSON mode since chunked requests may not work in all WeChat versions
    this.sendJsonMode(apiMessages, assistantMsg);
    return;
  },

  async sendJsonMode(
    apiMessages: Array<{ role: string; content: any }>,
    assistantMsg: ChatMessage,
  ) {
    try {
      const res: ChatResponse = await chatSync(apiMessages);

      const msgs = [...this.data.messages];
      const idx = msgs.findIndex((m) => m.id === assistantMsg.id);
      if (idx >= 0) {
        msgs[idx] = {
          ...msgs[idx],
          content: res.content || '',
          status: 'done',
          llmUsage: res.llmUsage,
        };
        this.setData({
          messages: msgs,
          streaming: false,
          scrollToView: assistantMsg.id,
          tokensTotal: this.data.tokensTotal + ((res.llmUsage?.total_tokens) || 0),
        });
      }
    } catch (e: any) {
      const msgs = [...this.data.messages];
      const idx = msgs.findIndex((m) => m.id === assistantMsg.id);
      if (idx >= 0) {
        msgs[idx] = {
          ...msgs[idx],
          content: msgs[idx].content || '',
          status: 'error',
          error: e.message || 'Request failed',
        };
        this.setData({ messages: msgs, streaming: false });
      }
    }
  },

  onCancelStream() {
    const req = this.data.streamAbort;
    if (req) {
      req.abort();
    }
    this.setData({ streaming: false, streamAbort: null });
  },

  // ===== Slash Command Execution =====
  executeSlashCommand(cmd: string, args: string) {
    switch (cmd.toLowerCase()) {
      case 'clear':
        this.setData({ messages: [], tokensTotal: 0 });
        wx.showToast({ title: 'Chat cleared', icon: 'success' });
        break;

      case 'help': {
        const helpText = SLASH_COMMANDS.map(
          (c) => `**/${c.cmd}** — ${c.desc}\n\`${c.usage}\``
        ).join('\n\n');
        this.addSystemMessage('# Available Commands\n\n' + helpText);
        break;
      }

      case 'export':
        this.exportChat();
        break;

      case 'tokens': {
        let total = 0;
        let prompt = 0;
        let completion = 0;
        this.data.messages.forEach((m) => {
          if (m.llmUsage) {
            total += m.llmUsage.total_tokens || 0;
            prompt += m.llmUsage.prompt_tokens || 0;
            completion += m.llmUsage.completion_tokens || 0;
          }
        });
        const cost = ((total / 1000) * 0.002).toFixed(4);
        this.addSystemMessage(
          `## Token Usage\n\n- Total: ${total}\n- Prompt: ${prompt}\n- Completion: ${completion}\n- Est. cost: $${cost}`
        );
        break;
      }

      case 'model': {
        const last = [...this.data.messages].reverse().find((m) => m.llmUsage?.model);
        const model = last?.llmUsage?.model || 'default (auto-select)';
        this.addSystemMessage(
          `Current model: **${model}**\n\nSet \`LLM_PROVIDER\` on the server to change (openai | anthropic | deepseek | kimi | ollama | custom).`
        );
        break;
      }

      case 'session': {
        const msgs = this.data.messages.length;
        const user = this.data.messages.filter((m) => m.role === 'user').length;
        const assistant = this.data.messages.filter((m) => m.role === 'assistant').length;
        const started = this.data.messages[0]
          ? new Date(this.data.messages[0].timestamp).toLocaleString()
          : 'N/A';
        this.addSystemMessage(
          `## Session Info\n\n- Messages: ${msgs}\n- User: ${user}\n- Assistant: ${assistant}\n- Started: ${started}\n- Session ID: ${this.data.sessionId || 'new'}`
        );
        break;
      }

      case 'debug':
        this.setData({ debugMode: !this.data.debugMode });
        this.addSystemMessage(
          `Debug mode: **${this.data.debugMode ? 'ON' : 'OFF'}**\n${this.data.debugMode ? 'Raw LLM responses will be shown.' : 'Normal mode.'}`
        );
        break;

      case 'code':
        if (args.trim()) {
          this.addSystemMessage(
            `Switching to code mode. Task: "${args.trim()}"\nThe Coder agent will be used for this request.`
          );
          // Trigger code generation via chat
          this.sendChatMessage(args.trim());
        } else {
          this.addSystemMessage('Usage: `/code <task description>`');
        }
        break;

      case 'image':
        if (args.trim()) {
          this.addSystemMessage(
            'Please attach an image file using the upload button first, then ask your question. Use the 📎 or 📷 button above.'
          );
        } else {
          this.addSystemMessage(
            'Use `/image <question>` with an attached image to analyze it. Tap 📷 to select an image.'
          );
        }
        break;

      case 'run':
        if (args.trim()) {
          const parts = args.trim().split(/\s+/);
          const mode = parts[0];
          const modeArgs = parts.slice(1).join(' ');
          this.addSystemMessage(
            `Orchestration mode "${mode}" triggered.\nArguments: ${modeArgs || '(none)'}\n\nValid modes: company | pipeline | parallel | debate | vote | roundtable`
          );
          // Navigate back to dashboard to run
          wx.showModal({
            title: 'Run Orchestration',
            content: `Run ${mode} mode on the dashboard?`,
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({ url: '/pages/index/index' });
              }
            },
          });
        } else {
          this.addSystemMessage(
            'Usage: `/run <mode>` where mode = pipeline | parallel | debate | vote | roundtable | company'
          );
        }
        break;

      default:
        this.addSystemMessage(`Unknown command: /${cmd}\nType /help to see all commands.`);
    }
  },

  sendChatMessage(text: string) {
    this.setData({ draft: text });
    this.onSend();
  },

  addSystemMessage(content: string) {
    const msg: ChatMessage = {
      id: genId(),
      role: 'system',
      content,
      timestamp: Date.now(),
      status: 'done',
    };
    this.setData({
      messages: [...this.data.messages, msg],
      scrollToView: msg.id,
    });
  },

  // ===== Export =====
  exportChat() {
    const md = this.data.messages
      .map((m) => {
        const prefix =
          m.role === 'user' ? '## You' :
          m.role === 'assistant' ? '## Assistant' : '## System';
        return `${prefix}\n\n${m.content}\n`;
      })
      .join('\n---\n');

    wx.setClipboardData({
      data: md,
      success: () => {
        wx.showToast({ title: 'Copied to clipboard!', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: 'Failed to copy', icon: 'error' });
      },
    });
  },

  // ===== Retry =====
  onRetryLast(e: any) {
    const idx = e.detail?.index;
    if (idx !== undefined) {
      // Retry specific message
      const msgs = [...this.data.messages];
      // Remove failed assistant message
      msgs.splice(idx, 1);
      this.setData({ messages: msgs });
    }
  },

  // ===== Navigation =====
  onBackToDashboard() {
    wx.navigateTo({ url: '/pages/index/index' });
  },

  // ===== Keyboard Confirm =====
  onConfirm() {
    this.onSend();
  },

  // ===== Image Preview =====
  onPreviewImage(e: any) {
    const url = e.detail?.url || e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({
        urls: [url],
        current: url,
      });
    }
  },
});
