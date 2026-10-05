import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      "stock.in.corvo.fun",
    ],
    proxy: {
      '/api':  {
        target: "http://127.0.0.1:18001/",
        ws: true,
        changeOrigin: false,
      },
      '/login':  {
        target: "http://127.0.0.1:18001/",
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
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        categories: ['finance', 'productivity', 'utilities'],
        background_color: '#0b1220',
        theme_color: '#0b1220',
        shortcuts: [
          {
            name: '交易日志 Journal',
            short_name: 'Journal',
            description: '查看持仓、交易记录与分析',
            url: '/journal',
            icons: [{ src: '/icons/app-icon-192.png', sizes: '192x192' }],
          },
          {
            name: '期权工具 Options',
            short_name: 'Options',
            description: '期权策略分析、盈亏图与计算器',
            url: '/options',
            icons: [{ src: '/icons/app-icon-192.png', sizes: '192x192' }],
          },
        ],
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
      devOptions: {
        // 默认在 dev 模式也启用 Service Worker（PWA Push 依赖 SW，没有 SW 就没有 pushManager）
        // 注意：vite dev 下 SW 不会被 HMR，改完 sw-custom.js / Push 逻辑请 ⚠️ 刷新页面（或 chrome://serviceworker-internals → unregister）
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
        resolveTempFolder: () => resolve(process.cwd(), 'node_modules', '.vite-pwa-dev'),
        suppressWarnings: true,
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api(\/|$)/,
          /^\/login(\/|$)/,
          /^\/logout(\/|$)/,
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['/sw-custom.js'],
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
