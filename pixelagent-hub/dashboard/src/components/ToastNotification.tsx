import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const typeColors: Record<string, string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#00d4ff',
  warning: '#f59e0b',
};

const typeIcons: Record<string, string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
  warning: '⚠',
};

const TOAST_LIFETIME_MS = 4500;

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  return (
    <div
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [paused, setPaused] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const remainingRef = useRef<number>(TOAST_LIFETIME_MS);
  const startedAtRef = useRef<number>(Date.now());

  const scheduleClose = useCallback(
    (delay: number) => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      startedAtRef.current = Date.now();
      timeoutRef.current = window.setTimeout(() => onRemove(toast.id), delay);
    },
    [onRemove, toast.id],
  );

  useEffect(() => {
    scheduleClose(remainingRef.current);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnter = () => {
    if (paused) return;
    setPaused(true);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      remainingRef.current = Math.max(500, remainingRef.current - (Date.now() - startedAtRef.current));
    }
  };

  const handleLeave = () => {
    if (!paused) return;
    setPaused(false);
    scheduleClose(remainingRef.current);
  };

  return (
    <motion.div
      layout
      initial={{ x: 200, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 200, opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="pixel-card p-3 flex items-center gap-3 pointer-events-auto min-w-[200px]"
      style={{
        borderColor: typeColors[toast.type],
        backgroundColor: typeColors[toast.type] + '15',
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      role={toast.type === 'error' ? 'alert' : undefined}
    >
      <div
        className="w-5 h-5 flex items-center justify-center pixel-border-solid"
        style={{
          borderColor: typeColors[toast.type],
          backgroundColor: typeColors[toast.type] + '20',
          fontSize: 12,
        }}
        aria-hidden="true"
      >
        {typeIcons[toast.type]}
      </div>
      <span className="pixel-font text-[9px] flex-1" style={{ color: typeColors[toast.type] }}>
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="pixel-font text-[8px] text-white/30 hover:text-white/60 px-1"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </motion.div>
  );
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
