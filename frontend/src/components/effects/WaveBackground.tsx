import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/utils';

// Five SVG wave bands — each slightly transparent, each at a different depth
const WAVES = [
  { d: 'M0,192 C360,256 720,128 1440,192 L1440,320 L0,320 Z',  fill: 'rgba(13,148,136,0.15)',  dur: 7,  delay: 0 },
  { d: 'M0,224 C300,160 700,256 1440,200 L1440,320 L0,320 Z',  fill: 'rgba(20,184,166,0.10)',  dur: 9,  delay: 1.5 },
  { d: 'M0,248 C420,200 900,270 1440,230 L1440,320 L0,320 Z',  fill: 'rgba(45,212,191,0.08)', dur: 11, delay: 0.8 },
  { d: 'M0,265 C480,240 960,290 1440,255 L1440,320 L0,320 Z',  fill: 'rgba(94,234,212,0.06)', dur: 8, delay: 2.5 },
  { d: 'M0,280 C600,265 1020,300 1440,275 L1440,320 L0,320 Z', fill: 'rgba(204,251,241,0.10)', dur: 10, delay: 1 },
];

// Large blurred colour orbs (the "mood" of the page)
const ORBS = [
  { w: 720, h: 720, x: '-12%', y: '-25%', color: 'rgba(13,148,136,0.12)',  blur: 90,  dur: 20, i: 0 },
  { w: 600, h: 600, x: '58%',  y: '28%',  color: 'rgba(20,184,166,0.10)',  blur: 100, dur: 24, i: 1 },
  { w: 500, h: 500, x: '18%',  y: '58%',  color: 'rgba(45,212,191,0.08)', blur: 80,  dur: 28, i: 2 },
  { w: 380, h: 380, x: '78%',  y: '5%',   color: 'rgba(34,211,238,0.07)',  blur: 70,  dur: 22, i: 3 },
];

export function WaveBackground() {
  const reduced = prefersReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
    >
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(145deg, #F0FDFA 0%, #ECFDF7 35%, #F0FDFB 65%, #CCFBF1 100%)',
        }}
      />

      {/* Floating colour orbs */}
      {!reduced && ORBS.map((orb) => (
        <motion.div
          key={orb.i}
          className="absolute rounded-full"
          style={{
            width:  orb.w,
            height: orb.h,
            left:   orb.x,
            top:    orb.y,
            background: orb.color,
            filter: `blur(${orb.blur}px)`,
          }}
          animate={{
            x:     [0,  40, -25,  18, 0],
            y:     [0, -30,  20, -12, 0],
            scale: [1, 1.06, 0.97, 1.03, 1],
          }}
          transition={{
            duration: orb.dur,
            repeat:   Infinity,
            ease:     'easeInOut',
            delay:    orb.i * 3.5,
          }}
        />
      ))}

      {/* SVG wave bands pinned to the bottom */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '45vh' }}>
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {WAVES.map((wave, i) =>
            reduced ? (
              <path key={i} d={wave.d} fill={wave.fill} />
            ) : (
              <motion.path
                key={i}
                d={wave.d}
                fill={wave.fill}
                animate={{ y: [0, -10, 5, -7, 0] }}
                transition={{
                  duration: wave.dur,
                  repeat:   Infinity,
                  ease:     'easeInOut',
                  delay:    wave.delay,
                }}
              />
            )
          )}
        </svg>
      </div>
    </div>
  );
}
