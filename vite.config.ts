import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
        changeOrigin: false,
      },
      '/login':  {
        target: "http://127.0.0.1:8000/",
        changeOrigin: false,
      },
    },
  } as any,
  
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [
        'icons/app-icon-180.png',
        'icons/app-icon-192.png',
        'icons/app-icon-512.png',
      ],
      manifest: {
        name: 'YHTrader',
        short_name: 'YHTrader',
        description: 'Market overview, trading journal, options tools',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          {
            src: '/icons/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api(\/|$)/,
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/api(\/|$)/,
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
    }),
  ],
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
