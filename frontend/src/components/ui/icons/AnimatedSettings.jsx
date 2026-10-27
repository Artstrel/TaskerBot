import React, { useEffect, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';

/**
 * AnimatedSettings icon matching Animate UI Lucide Settings specs.
 * Plays crisp gear rotation with spring damping settling at 180 degrees symmetry.
 */
export default function AnimatedSettings({
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

  const gearVariants = {
    initial: { rotate: 0, scale: 1 },
    animate: {
      rotate: [0, 90, 180],
      scale: [1, 1.1, 1],
      transition: {
        duration: 0.85,
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
      <motion.g
        variants={gearVariants}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </motion.g>
    </motion.svg>
  );
}
