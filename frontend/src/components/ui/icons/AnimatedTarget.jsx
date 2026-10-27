import React, { useEffect, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';

/**
 * AnimatedTarget icon matching Lucide Target geometry with Animate UI micro-interaction standards.
 * Plays concentric spring ripple expanding outward from the bullseye to outer perimeter.
 */
export default function AnimatedTarget({
  size = 18,
  active = false,
  trigger = null,
  hovered = false,
  color = 'currentColor',
  strokeWidth = 2,
  animateOnHover = true,
  className = '',
  style = {},
  ...props
}) {
  const controls = useAnimation();
  const isFirstMount = useRef(true);
  const prevActiveRef = useRef(active);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevActiveRef.current = active;
      return;
    }
    const becameActive = active && !prevActiveRef.current;
    prevActiveRef.current = active;

    if (becameActive || (active && trigger) || hovered) {
      controls.start('animate');
    }
  }, [active, trigger, hovered, controls]);

  const handleMouseEnter = () => {
    if (animateOnHover) {
      controls.start('animate');
    }
  };

  const outerVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.1, 0.97, 1],
      transition: {
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.1,
      },
    },
  };

  const middleVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.22, 0.94, 1],
      transition: {
        duration: 0.52,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.05,
      },
    },
  };

  const bullseyeVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.6, 0.88, 1],
      transition: {
        duration: 0.48,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animate-ui-icon ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        overflow: 'visible',
        pointerEvents: 'none',
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        variants={outerVariants}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="6"
        variants={middleVariants}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="2"
        variants={bullseyeVariants}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      />
    </motion.svg>
  );
}
