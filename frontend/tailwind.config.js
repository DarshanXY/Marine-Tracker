/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],

  theme: {
    extend: {
      // ─── Design Tokens ─────────────────────────────────────
      // Mirror these in src/styles/globals.css as CSS variables.
      colors: {
        // ── "Pisces turquoise" — vivid teal / Tiffany aqua / deep sea ──
        ocean: {
          950: '#134E4A', // deep sea teal
          800: '#115E59', // darkest turquoise
          700: '#0F766E', // dark turquoise
          600: '#0D9488', // primary — turquoise
          500: '#14B8A6', // vivid teal
          400: '#2DD4BF', // bright Tiffany turquoise
          300: '#5EEAD4', // light aqua
          100: '#CCFBF1', // mint foam
          50:  '#F0FDFA', // pale foam
        },
        // Cyan sparkle accent (the glass-tile glints in the palette)
        sky: {
          700: '#0891B2',
          400: '#22D3EE',
          100: '#CFFAFE',
        },
        // Success / nature greens
        success: {
          700: '#059669',
          500: '#10B981',
          400: '#34D399',
          100: '#D1FAE5',
        },
        // Status
        danger:  '#EF4444',
        warn:    '#F59E0B',
        purple:  '#8B5CF6',
        // Surfaces
        surface: {
          white: '#FFFFFF',
          light: '#F8FAFC',
          blue:  '#EFF7FC',
        },
        // Role colors (used by RoleBadge component)
        role: {
          admin:       '#EF4444',
          ministry:    '#3B82F6',
          coastguard:  '#0D9488',
          field:       '#10B981',
          researcher:  '#8B5CF6',
          ngo:         '#F97316',
          public:      '#64748B',
        },
        // Line / border
        border: '#E2E8F0',
      },

      // ─── Typography ────────────────────────────────────────
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'Menlo', 'monospace'],
      },

      // ─── Animations ────────────────────────────────────────
      animation: {
        'shimmer':         'shimmer 2.5s linear infinite',
        'float':           'float 6s ease-in-out infinite',
        'float-slow':      'float 10s ease-in-out infinite',
        'pulse-slow':      'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave':            'wave 8s ease-in-out infinite',
        'particle-drift':  'particleDrift 20s linear infinite',
        'fade-in':         'fadeIn 0.4s ease-out',
        'fade-in-up':      'fadeInUp 0.5s ease-out',
        'slide-in-right':  'slideInRight 0.35s ease-out',
        'count-up':        'fadeInUp 0.6s ease-out forwards',
        'shimmer-sweep':   'shimmerSweep 0.6s ease-out forwards',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
        wave: {
          '0%, 100%': { transform: 'translateX(0) scaleY(1)' },
          '50%':      { transform: 'translateX(-25px) scaleY(0.96)' },
        },
        particleDrift: {
          '0%':   { transform: 'translateY(100vh) translateX(0) opacity(0)' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { transform: 'translateY(-20px) translateX(30px) opacity(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        shimmerSweep: {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(100%)' },
        },
      },

      // ─── Shadows ───────────────────────────────────────────
      boxShadow: {
        'glass':         '0 8px 32px rgba(13,148,136,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'glass-lg':      '0 20px 60px rgba(13,148,136,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover':    '0 24px 80px rgba(13,148,136,0.15), 0 8px 24px rgba(0,0,0,0.08)',
        'glow-primary':  '0 0 20px rgba(20,184,166,0.38)',
        'glow-success':  '0 0 20px rgba(16,185,129,0.35)',
        'glow-danger':   '0 0 20px rgba(239,68,68,0.35)',
        'glow-warn':     '0 0 20px rgba(245,158,11,0.35)',
        'input-focus':   '0 0 0 3px rgba(13,148,136,0.15)',
      },

      // ─── Border Radius ─────────────────────────────────────
      borderRadius: {
        'glass':    '16px',
        'glass-lg': '20px',
      },

      // ─── Backdrop Blur ─────────────────────────────────────
      backdropBlur: {
        'glass': '20px',
      },
    },
  },

  plugins: [],
};
