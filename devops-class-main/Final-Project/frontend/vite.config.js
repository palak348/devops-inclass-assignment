import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server forwards /api to a backend on :8000, so the
// browser code always uses same-origin relative URLs (same as in Nginx / Ingress).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
});
