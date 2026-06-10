import { useEffect, useRef, type CSSProperties } from 'react';
import './AgentAvatar.css';

interface AgentAvatarProps {
  className?: string;
  motion?: 'track' | 'idle';
  size?: number;
}

export function AgentAvatar({ className = '', motion = 'track', size = 132 }: AgentAvatarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const eyeOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || motion !== 'track') return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const writeEyeOffset = (x: number, y: number) => {
      root.style.setProperty('--agent-eye-x', `${x.toFixed(2)}px`);
      root.style.setProperty('--agent-eye-y', `${y.toFixed(2)}px`);
      frameRef.current = null;
    };

    const scheduleEyeOffset = (x: number, y: number) => {
      eyeOffsetRef.current = { x, y };
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        writeEyeOffset(eyeOffsetRef.current.x, eyeOffsetRef.current.y);
      });
    };

    const resetEyeOffset = () => scheduleEyeOffset(0, 0);

    const handlePointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches) {
        resetEyeOffset();
        return;
      }

      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < 1) {
        resetEyeOffset();
        return;
      }

      const maxX = Math.max(4, rect.width * 0.055);
      const maxY = Math.max(3, rect.height * 0.042);
      const strength = Math.min(distance / 320, 1);

      scheduleEyeOffset(
        (deltaX / distance) * maxX * strength,
        (deltaY / distance) * maxY * strength,
      );
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', resetEyeOffset);
    window.addEventListener('blur', resetEyeOffset);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', resetEyeOffset);
      window.removeEventListener('blur', resetEyeOffset);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [motion]);

  return (
    <div
      ref={rootRef}
      className={`agent-avatar agent-avatar--${motion} ${className}`.trim()}
      role="img"
      aria-label="AI 助手头像"
      style={{ '--agent-size': `${size}px` } as CSSProperties}
    >
      <div className="agent-avatar__orb">
        <span className="agent-avatar__glint" aria-hidden="true" />
        <span className="agent-avatar__eyes" aria-hidden="true">
          <span className="agent-avatar__eye" />
          <span className="agent-avatar__eye" />
        </span>
      </div>
    </div>
  );
}
