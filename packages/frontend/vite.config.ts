import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const backendUrl = process.env.BACKEND_INTERNAL_URL

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    allowedHosts: true,
    proxy: {
      // Mirrors what nginx does in production: strip /api prefix and forward to backend
      '/api': {
        target: backendUrl,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
