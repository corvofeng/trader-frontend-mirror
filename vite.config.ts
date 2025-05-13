import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      "stock.in.corvo.fun",
    ],
    proxy: {
      '/api':  {
        target: "http://127.0.0.1:8000/",
        changeOrigin: true,
      },
      '/login':  {
        target: "http://127.0.0.1:8000/",
        changeOrigin: true,
      },
    },
  },
  
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // target: 'esnext', // This enables top-level await support
  },
});