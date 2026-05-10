import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScreenFlashProps {
  color: string;
  trigger: number;
}

export const ScreenFlash: React.FC<ScreenFlashProps> = ({ color, trigger }) => {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <motion.div
          key={trigger}
          className="fixed inset-0 pointer-events-none z-[150]"
          style={{ backgroundColor: color }}
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
};
