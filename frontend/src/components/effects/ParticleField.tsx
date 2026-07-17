import { useEffect, useRef, useCallback } from 'react';
import { prefersReducedMotion } from '@/lib/utils';

// Palette: ocean-600, ocean-500, ocean-400, success-500, ocean-300 (turquoise)
const PALETTE: [number, number, number][] = [
  [13,  148, 136],
  [20,  184, 166],
  [45,  212, 191],
  [16,  185, 129],
  [94,  234, 212],
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  maxOpacity: number;
  phase: number;
  phaseSpeed: number;
  color: [number, number, number];
}

function make(w: number, h: number, fromBottom = false): Particle {
  return {
    x:          Math.random() * w,
    y:          fromBottom ? h + Math.random() * 60 : Math.random() * h,
    vx:         (Math.random() - 0.5) * 0.3,
    vy:         -(Math.random() * 0.4 + 0.1),
    size:       Math.random() * 2.5 + 0.8,
    opacity:    0,
    maxOpacity: Math.random() * 0.35 + 0.08,
    phase:      Math.random() * Math.PI * 2,
    phaseSpeed: Math.random() * 0.018 + 0.004,
    color:      PALETTE[Math.floor(Math.random() * PALETTE.length)],
  };
}

export function ParticleField({ count = 48 }: { count?: number }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const ptRef      = useRef<Particle[]>([]);
  const rafRef     = useRef<number>(0);
  const reduced    = prefersReducedMotion();

  const init = useCallback((w: number, h: number) => {
    ptRef.current = Array.from({ length: count }, () => make(w, h));
  }, [count]);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      init(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      ptRef.current.forEach((p, idx) => {
        p.phase += p.phaseSpeed;
        p.x     += p.vx + Math.sin(p.phase) * 0.25;
        p.y     += p.vy;
        p.opacity = p.maxOpacity * (0.5 + 0.5 * Math.sin(p.phase * 1.8));

        if (p.y < -30) {
          ptRef.current[idx] = make(w, h, true);
          return;
        }

        const [r, g, b] = p.color;
        const alpha = Math.max(0, p.opacity);

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();

        // Soft glow halo
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        glow.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.3})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [init, reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  );
}
