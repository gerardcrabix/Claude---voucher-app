import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Consultation seule hors ligne (section 4) : on ne fait que mettre en
      // cache le "shell" applicatif (JS/CSS/HTML/icônes). Les données elles-
      // mêmes vivent déjà dans IndexedDB, qui fonctionne nativement hors
      // ligne — aucune stratégie réseau supplémentaire n'est nécessaire pour
      // elles à ce stade (MVP local, sans backend).
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Bons — suivi des bons d’achat',
        short_name: 'Bons',
        description: "Suivi partagé des bons d'achat, avec alerte anti-oubli.",
        start_url: '.',
        display: 'standalone',
        background_color: '#f6f5f2',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
