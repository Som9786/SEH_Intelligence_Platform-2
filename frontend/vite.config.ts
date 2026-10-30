import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// All data comes from the APIs behind Insights.Gateway (backend/src/Insights.Gateway), never from files in
// this app. /api/* is forwarded to it; set GATEWAY_URL when it isn't on its default address.
const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: process.env.GATEWAY_URL ?? 'http://localhost:5000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: 'localhost', port: 5174, strictPort: true, proxy },
  preview: { host: 'localhost', port: 4174, strictPort: true, proxy },
});
