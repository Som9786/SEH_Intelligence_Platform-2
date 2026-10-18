import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fully static: all data is read from public/catalog at runtime; there is no API proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: 'localhost', port: 5174, strictPort: true },
  preview: { host: 'localhost', port: 4174, strictPort: true },
});
