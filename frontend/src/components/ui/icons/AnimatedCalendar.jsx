import React, { useEffect, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';

/**
 * AnimatedCalendar icon matching Animate UI Lucide Calendar specs.
 * Plays bounce animation on calendar binder rings and subtle frame spring.
 */
export default function AnimatedCalendar({
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

  const ring1Variants = {
    initial: { y: 0 },
    animate: {
      y: [0, -2.2, 0, -0.6, 0],
      transition: {
        duration: 0.5,
        ease: 'easeInOut',
        times: [0, 0.3, 0.55, 0.75, 1],
      },
    },
  };

  const ring2Variants = {
    initial: { y: 0 },
    animate: {
      y: [0, -2.2, 0, -0.6, 0],
      transition: {
        duration: 0.5,
        ease: 'easeInOut',
        times: [0, 0.3, 0.55, 0.75, 1],
        delay: 0.08,
      },
    },
  };

  const frameVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 0.93, 1.04, 1],
      transition: {
        duration: 0.45,
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
      variants={frameVariants}
      initial="initial"
      animate={controls}
      {...props}
    >
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <motion.line
        x1="8"
        x2="8"
        y1="2"
        y2="6"
        variants={ring1Variants}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1="16"
        x2="16"
        y1="2"
        y2="6"
        variants={ring2Variants}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}
