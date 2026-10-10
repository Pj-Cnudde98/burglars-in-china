import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The brush font ships ~90 unicode-range chunks; only the few the UI uses are fetched, then runtime-cached.
        globIgnores: ['**/ma-shan-zheng*']
      },
      manifest: {
        name: 'Burglars in China',
        short_name: 'Burglars',
        description: 'Our 20-day China trip: plan, map, food and more',
        theme_color: '#0d0a0a',
        background_color: '#0d0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
