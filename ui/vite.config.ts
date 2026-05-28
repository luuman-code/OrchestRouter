import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwind(), react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3458',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:3458',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3458',
        changeOrigin: true,
      },
      '/config': {
        target: 'http://localhost:3458',
        changeOrigin: true,
      },
    },
  },
})
