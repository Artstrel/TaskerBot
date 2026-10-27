import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * AnimatedAccordion: Smoothly expands and collapses child content with height and opacity transitions.
 */
export default function AnimatedAccordion({
  isOpen = false,
  children,
  className = '',
  duration = 0.24,
}) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: duration * 0.75, ease: 'easeOut' },
          }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
