import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // @/ maps to src/ — use in imports: import { Button } from '@/components/ui/Button'
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy /api/* → backend Express server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Live-ops WebSocket → same backend
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Split large libraries into separately-cached vendor chunks.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },

  // Vitest configuration (co-located here to avoid a separate vitest.config.ts)
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
