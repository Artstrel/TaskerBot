import React, { useState } from 'react';
import { hapticFeedback } from '../api';

// Dynamically check for user-provided OC images in ../assets/mascot/
const userMascotAssets = import.meta.glob('../assets/mascot/*.{png,webp,svg,jpg,jpeg}', {
  eager: true,
  import: 'default',
});

function findUserAsset(state) {
  const extensions = ['png', 'webp', 'svg', 'jpg', 'jpeg'];
  for (const ext of extensions) {
    const path = `../assets/mascot/${state}.${ext}`;
    if (userMascotAssets[path]) {
      return userMascotAssets[path];
    }
  }
  return null;
}

export default function Mascot({
  state = 'idle', // 'idle' | 'happy' | 'done' | 'sleep' | 'thinking'
  size = 40,
  interactive = true,
  className = '',
  caption = null,
  onClick = null,
}) {
  const [bouncing, setBouncing] = useState(false);
  const [hasImgError, setHasImgError] = useState(false);

  const customSrc = findUserAsset(state) || (state !== 'idle' ? findUserAsset('idle') : null);

  const handleClick = (e) => {
    if (interactive) {
      hapticFeedback('light');
      setBouncing(true);
      setTimeout(() => setBouncing(false), 500);
    }
    if (onClick) onClick(e);
  };

  const numericSize = typeof size === 'number' ? size : parseInt(size, 10) || 40;

  return (
    <div
      className={`mascot-container ${bouncing ? 'mascot-bounce' : ''} ${className}`}
      onClick={handleClick}
      style={{
        width: `${numericSize}px`,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      title={interactive ? 'Ваш напарник TaskerBot (нажмите для реакции)' : 'TaskerBot'}
    >
      <div
        className="mascot-avatar-frame"
        style={{
          width: `${numericSize}px`,
          height: `${numericSize}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {customSrc && !hasImgError ? (
          <img
            src={customSrc}
            alt={`Mascot ${state}`}
            onError={() => setHasImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))',
            }}
          />
        ) : (
          <DefaultCompanionSvg state={state} size={numericSize} />
        )}
      </div>

      {caption && (
        <span
          className="mascot-caption"
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: `${numericSize * 2}px`,
          }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

/**
 * Minimalist Linear-style companion vector silhouette fallback
 * until the user drops in their custom OC drawings.
 */
function DefaultCompanionSvg({ state, size }) {
  const isSmall = size <= 48;

  // Eye expressions based on emotional state
  const renderEyes = () => {
    switch (state) {
      case 'happy':
        return (
          <>
            {/* Joyful curved eyes ^ ^ */}
            <path
              d="M17 21 Q21 16 25 21"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M31 21 Q35 16 39 21"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        );
      case 'done':
        return (
          <>
            {/* Star/wink joyful eyes */}
            <path
              d="M18 20 L24 20 M21 17 L21 23"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="35" cy="20" r="3.2" fill="#10b981" />
          </>
        );
      case 'sleep':
        return (
          <>
            {/* Closed peaceful eyes - - */}
            <line x1="17" y1="21" x2="25" y2="21" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="31" y1="21" x2="39" y2="21" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case 'thinking':
        return (
          <>
            {/* Focused dots / processing */}
            <circle cx="21" cy="20" r="3" fill="#ec4899" className="mascot-eye-blink" />
            <circle cx="35" cy="18" r="3" fill="#ec4899" />
          </>
        );
      case 'idle':
      default:
        return (
          <>
            {/* Calm, glowing digital pupils */}
            <circle cx="21" cy="20" r="2.8" fill="#818cf8" className="mascot-eye-glow" />
            <circle cx="35" cy="20" r="2.8" fill="#818cf8" className="mascot-eye-glow" />
          </>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="bodyGradient" x1="8" y1="8" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e202d" />
          <stop offset="1" stopColor="#12131b" />
        </linearGradient>
        <linearGradient id="visorGradient" x1="12" y1="12" x2="44" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0b0d13" />
          <stop offset="1" stopColor="#050608" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Antenna / top notch */}
      <path
        d="M28 8 L28 14"
        stroke="#4f5268"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle
        cx="28"
        cy="7"
        r="2.5"
        fill={state === 'done' ? '#10b981' : state === 'happy' ? '#ec4899' : '#6366f1'}
        className="mascot-antenna-pulse"
      />

      {/* Main Bot Body / Head */}
      <rect
        x="9"
        y="12"
        width="38"
        height="34"
        rx="14"
        fill="url(#bodyGradient)"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth="1.2"
        filter="url(#glow)"
      />

      {/* Cute minimalist side ear nodes */}
      <rect x="5.5" y="24" width="3.5" height="10" rx="1.75" fill="#2d3042" />
      <rect x="47" y="24" width="3.5" height="10" rx="1.75" fill="#2d3042" />

      {/* Digital Visor screen */}
      <rect
        x="13"
        y="15"
        width="30"
        height="18"
        rx="8"
        fill="url(#visorGradient)"
        stroke="rgba(255, 255, 255, 0.06)"
        strokeWidth="0.8"
      />

      {/* Eyes & Expression */}
      {renderEyes()}

      {/* Subtle smiling mouth if not small */}
      {!isSmall && (
        <path
          d={
            state === 'happy' || state === 'done'
              ? 'M24 38 Q28 42 32 38'
              : state === 'sleep'
              ? 'M25 39 Q28 39 31 39'
              : 'M25 38 Q28 40 31 38'
          }
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
