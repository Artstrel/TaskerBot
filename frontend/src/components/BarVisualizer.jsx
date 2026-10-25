import React, { useEffect, useRef } from 'react';

/**
 * BarVisualizer - Audio Waveform Visualizer inspired by LiveKit Agent Audio Visualizer
 * Bottom-aligned vertical frequency bars reacting to real microphone audio in real-time.
 * Uses Web Audio API (AnalyserNode) with direct DOM updates for silky-smooth 60fps performance.
 *
 * @param {MediaStream} stream - Active microphone audio stream
 * @param {'recording' | 'processing' | 'idle'} state - Visualizer state
 * @param {number} barCount - Number of bars (default: 7)
 * @param {number} height - Maximum container height in px (default: 72)
 * @param {number} barWidth - Width of each bar in px (default: 9)
 * @param {number} gap - Spacing between bars in px (default: 6)
 * @param {string} className - Additional CSS class
 */
export default function BarVisualizer({
  stream = null,
  state = 'recording',
  barCount = 7,
  height = 72,
  barWidth = 9,
  gap = 6,
  className = '',
}) {
  const containerRef = useRef(null);
  const barsRef = useRef([]);
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);

  const minHeight = 8;
  const maxHeight = Math.max(height - 4, 32);

  useEffect(() => {
    // Clean up any existing animation frame and audio context
    const cleanup = () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioCtxRef.current) {
        try {
          if (audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => {});
          }
        } catch (_) {}
        audioCtxRef.current = null;
      }
    };

    cleanup();

    // 1. Processing state: Elegant traveling wave animation indicating AI transcription
    if (state === 'processing') {
      let phase = 0;
      const animateProcessing = () => {
        phase += 0.08;
        barsRef.current.forEach((barEl, i) => {
          if (!barEl) return;
          // Staggered sine wave traveling left to right
          const wave = Math.sin(phase + (i * 0.7));
          // Normalized wave between 0.2 and 0.85
          const normalized = (wave + 1) * 0.35 + 0.15;
          const barH = minHeight + normalized * (maxHeight - minHeight);
          barEl.style.height = `${Math.round(barH)}px`;
          barEl.style.opacity = `${0.5 + normalized * 0.5}`;
        });
        animFrameRef.current = requestAnimationFrame(animateProcessing);
      };
      animFrameRef.current = requestAnimationFrame(animateProcessing);
      return cleanup;
    }

    // 2. Idle state: resting pill dots
    if (state === 'idle' || !stream) {
      barsRef.current.forEach((barEl) => {
        if (!barEl) return;
        barEl.style.height = `${minHeight}px`;
        barEl.style.opacity = '0.4';
      });
      return cleanup;
    }

    // 3. Recording state: Real-time frequency visualization via Web Audio API
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return cleanup;
      }

      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // Gives 32 frequency bins
      analyser.smoothingTimeConstant = 0.7; // Smooth transitions without latency
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Current smoothed heights for interpolation
      const smoothed = new Array(barCount).fill(minHeight);

      // Human speech frequency range mapping (concentrated in 100Hz - 3.5kHz)
      // Bin indices tuned for voice formant resonance across the 7 bars
      const binIndices = [1, 2, 3, 5, 7, 10, 14];

      const renderFrame = () => {
        analyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          const bin = binIndices[i % binIndices.length] || i + 1;
          const rawVal = dataArray[Math.min(bin, bufferLength - 1)] || 0;

          // Apply slight noise gate (ignore quiet background hum)
          const gated = rawVal > 18 ? rawVal - 18 : 0;
          const normalized = Math.min(gated / 170, 1.0); // Boost speech responsiveness

          // Dynamic target height
          const target = minHeight + Math.pow(normalized, 1.15) * (maxHeight - minHeight);

          // Fast attack, smooth decay (classic audio visualizer envelope)
          const attackDecay = target > smoothed[i] ? 0.45 : 0.22;
          smoothed[i] += (target - smoothed[i]) * attackDecay;

          const barEl = barsRef.current[i];
          if (barEl) {
            barEl.style.height = `${Math.round(smoothed[i])}px`;
            // Subtle brightness boost with loudness
            const brightness = 0.65 + (smoothed[i] / maxHeight) * 0.35;
            barEl.style.opacity = `${Math.min(brightness, 1.0)}`;
          }
        }

        animFrameRef.current = requestAnimationFrame(renderFrame);
      };

      animFrameRef.current = requestAnimationFrame(renderFrame);
    } catch (err) {
      console.warn('Web Audio API visualization fallback:', err);
      // Fallback CSS animation if Web Audio is restricted
      barsRef.current.forEach((barEl, i) => {
        if (!barEl) return;
        barEl.style.height = `${minHeight}px`;
      });
    }

    return cleanup;
  }, [stream, state, barCount, height, minHeight, maxHeight]);

  return (
    <div
      ref={containerRef}
      className={`livekit-bar-visualizer ${state} ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-end', // Aligned to bottom boundary as requested
        justifyContent: 'center',
        gap: `${gap}px`,
        height: `${height}px`,
        minHeight: `${height}px`,
        width: '100%',
        paddingBottom: '2px',
        boxSizing: 'border-box',
      }}
      aria-label="Audio Visualizer"
    >
      {Array.from({ length: barCount }).map((_, index) => (
        <span
          key={index}
          ref={(el) => {
            barsRef.current[index] = el;
          }}
          className={`visualizer-bar bar-${index} ${state}`}
          style={{
            width: `${barWidth}px`,
            minWidth: `${barWidth}px`,
            height: `${minHeight}px`,
            borderRadius: '9999px',
            transition: 'height 0.05s ease-out, opacity 0.08s ease-out',
            willChange: 'height, opacity',
          }}
        />
      ))}
    </div>
  );
}
