import React, { useEffect, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';

/**
 * AnimatedShoppingCart icon matching Animate UI Lucide ShoppingCart specs.
 * Plays rolling forward impulse with dynamic basket dip and spring restitution.
 */
export default function AnimatedShoppingCart({
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

  const groupVariants = {
    initial: { x: 0 },
    animate: {
      x: [0, 1.8, -0.6, 0],
      transition: {
        duration: 0.6,
        ease: 'easeInOut',
        times: [0, 0.4, 0.75, 1],
      },
    },
  };

  const basketVariants = {
    initial: { y: 0, rotate: 0 },
    animate: {
      y: [0, -1.8, 0, -0.5, 0],
      rotate: [0, -3, 2, 0],
      transition: {
        duration: 0.6,
        ease: 'easeInOut',
        times: [0, 0.3, 0.55, 0.75, 1],
      },
    },
  };

  const wheelVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.25, 0.9, 1],
      transition: {
        duration: 0.5,
        ease: 'easeInOut',
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
      <motion.g variants={groupVariants} initial="initial" animate={controls}>
        <motion.g
          variants={basketVariants}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '7px 18px' }}
        >
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </motion.g>
        <motion.circle
          cx="8"
          cy="21"
          r="1"
          variants={wheelVariants}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '8px 21px' }}
        />
        <motion.circle
          cx="19"
          cy="21"
          r="1"
          variants={wheelVariants}
          initial="initial"
          animate={controls}
          style={{ transformOrigin: '19px 21px' }}
        />
      </motion.g>
    </motion.svg>
  );
}
