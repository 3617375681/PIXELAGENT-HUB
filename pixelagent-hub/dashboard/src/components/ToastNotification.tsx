import React, { useState } from 'react';
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

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
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
          >
            <div
              className="w-5 h-5 flex items-center justify-center pixel-border-solid"
              style={{
                borderColor: typeColors[toast.type],
                backgroundColor: typeColors[toast.type] + '20',
                fontSize: 12,
              }}
            >
              {typeIcons[toast.type]}
            </div>
            <span className="pixel-font text-[9px] flex-1" style={{ color: typeColors[toast.type] }}>
              {toast.message}
            </span>
            <button
              onClick={() => onRemove(toast.id)}
              className="pixel-font text-[8px] text-white/30 hover:text-white/60 px-1"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}
