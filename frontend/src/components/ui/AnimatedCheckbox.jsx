import React from 'react';
import { motion } from 'motion/react';

/**
 * AnimatedCheckbox: Provides smooth SVG stroke drawing and spring bounce feedback.
 * Compatible with existing .linear-checkbox styles and Telegram WebApp haptics.
 */
export default function AnimatedCheckbox({
  checked = false,
  onChange,
  className = '',
  size = 20,
  ariaLabel = 'Выполнить задачу',
  style = {},
  disabled = false,
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  return (
    <motion.button
      type="button"
      className={`linear-checkbox ${checked ? 'checked' : ''} ${className}`}
      onClick={handleClick}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        ...style,
      }}
      whileTap={{ scale: 0.85 }}
      animate={{
        scale: checked ? [1, 1.15, 1] : 1,
      }}
      transition={{
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <svg
        width={Math.round(size * 0.65)}
        height={Math.round(size * 0.65)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          display: 'block',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <motion.path
          d="M4 12.5L9.5 18L20 6.5"
          initial={false}
          animate={{
            pathLength: checked ? 1 : 0,
            opacity: checked ? 1 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 30,
          }}
        />
      </svg>
    </motion.button>
  );
}
