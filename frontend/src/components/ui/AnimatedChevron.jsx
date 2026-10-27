import React from 'react';
import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

/**
 * AnimatedChevron: Rotates smoothly from 0 to 180 degrees based on open state.
 */
export default function AnimatedChevron({
  isOpen = false,
  size = 16,
  color = 'var(--text-tertiary)',
  className = '',
}) {
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ rotate: isOpen ? 180 : 0 }}
      transition={{
        type: 'spring',
        stiffness: 340,
        damping: 26,
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transformOrigin: 'center center',
      }}
      aria-hidden="true"
    >
      <ChevronDown size={size} color={color} />
    </motion.div>
  );
}
