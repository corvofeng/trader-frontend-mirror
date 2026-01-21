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
        ws: true,
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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-echarts': ['echarts', 'echarts-gl'],
          'vendor-lightweight-charts': ['lightweight-charts'],
          'vendor-chartjs': ['chart.js', 'react-chartjs-2'],
          'vendor-utils': ['date-fns', 'date-fns-tz'],
        },
      },
    },
    // target: 'esnext', // This enables top-level await support
  },
});
