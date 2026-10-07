import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentOutput, AgentOutputAttachment } from '../types/agent';

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

export interface SubmitResult {
  /** Status text shown as the assistant reply. */
  content: string;
  /** Mark the assistant message as error instead of success. */
  error?: boolean;
}

export interface UseChatOptions {
  /** Required: handle user submission. Should kick off a workflow / API call and return a short status string. */
  onSubmit: (text: string, files?: File[]) => Promise<SubmitResult>;
  initialMessages?: ChatMessage[];
}

type ChatConversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const CHAT_STORAGE_KEY = 'pa.chat.conversations.v1';

function createConversation(title = 'New chat', initialMessages: ChatMessage[] = []): ChatConversation {
  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    updatedAt: Date.now(),
    messages: initialMessages,
  };
}

export function useChat(opts: UseChatOptions) {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatConversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return [createConversation('New chat', opts.initialMessages || [])];
  });
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatConversation[];
        if (Array.isArray(parsed) && parsed[0]?.id) return parsed[0].id;
      }
    } catch {
      // ignore
    }
    return '';
  });
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!currentConversationId && conversations[0]?.id) {
      setCurrentConversationId(conversations[0].id);
    }
  }, [currentConversationId, conversations]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations.slice(0, 30)));
    } catch {
      // ignore storage quota errors
    }
  }, [conversations]);

  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentConversationId) || conversations[0] || null,
    [conversations, currentConversationId]
  );
  const messages = currentConversation?.messages || [];

  const updateCurrentConversation = useCallback((updater: (conv: ChatConversation) => ChatConversation) => {
    setConversations((prev) => {
      if (prev.length === 0) return prev;
      const currentId = (currentConversationId && prev.some((c) => c.id === currentConversationId))
        ? currentConversationId
        : prev[0].id;
      return prev.map((conv) => (conv.id === currentId ? updater(conv) : conv));
    });
  }, [currentConversationId]);

  const addMessage = useCallback((msg: ChatMessage) => {
    updateCurrentConversation((conv) => ({
      ...conv,
      updatedAt: Date.now(),
      messages: [...conv.messages, msg],
    }));
  }, [updateCurrentConversation]);

  const updateLastMessage = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    updateCurrentConversation((conv) => {
      const next = [...conv.messages];
      if (next.length > 0) {
        next[next.length - 1] = updater(next[next.length - 1]);
      }
      return {
        ...conv,
        updatedAt: Date.now(),
        messages: next,
      };
    });
  }, [updateCurrentConversation]);

  const clearMessages = useCallback(() => {
    updateCurrentConversation((conv) => ({
      ...conv,
      updatedAt: Date.now(),
      messages: [],
    }));
  }, [updateCurrentConversation]);

  const switchConversation = useCallback((id: string) => {
    if (isStreaming) return;
    setCurrentConversationId(id);
  }, [isStreaming]);

  const createNewConversation = useCallback(() => {
    if (isStreaming) return;
    const created = createConversation('New chat');
    setConversations((prev) => [created, ...prev].slice(0, 30));
    setCurrentConversationId(created.id);
  }, [isStreaming]);

  const deleteConversation = useCallback((id: string) => {
    if (isStreaming) return;
    setConversations((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((c) => c.id !== id);
      if (!next.some((c) => c.id === currentConversationId)) {
        setCurrentConversationId(next[0]?.id || '');
      }
      return next;
    });
  }, [currentConversationId, isStreaming]);

  const sendMessage = useCallback(async (text: string, files?: File[]) => {
    const trimmed = text.trim();
    if (!trimmed && (!files || files.length === 0)) return;
    if (isStreaming) return;

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

    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: userAttachments,
      status: 'done',
    });

    addMessage({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: 'Contacting Records API…',
      timestamp: Date.now(),
      status: 'streaming',
    });

    setIsStreaming(true);
    try {
      const result = await opts.onSubmit(content, files);
      updateLastMessage((msg) => ({
        ...msg,
        status: result.error ? 'error' : 'done',
        content: result.content,
        error: result.error ? result.content : undefined,
      }));
    } catch (err: any) {
      updateLastMessage((msg) => ({
        ...msg,
        status: 'error',
        content: String(err?.message || err),
        error: String(err?.message || err),
      }));
    } finally {
      setIsStreaming(false);
    }
    if (currentConversation && currentConversation.title === 'New chat') {
      const autoTitle = content.slice(0, 32) + (content.length > 32 ? '…' : '');
      updateCurrentConversation((conv) => ({ ...conv, title: autoTitle, updatedAt: Date.now() }));
    }
  }, [opts, addMessage, updateLastMessage, isStreaming, currentConversation, updateCurrentConversation]);

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
    clearMessages,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
    })),
    currentConversationId: currentConversation?.id || '',
    switchConversation,
    createNewConversation,
    deleteConversation,
  };
}
