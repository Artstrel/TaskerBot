import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Copies dist/index.html to dist/404.html and dist/auth/callback/index.html
// so GitHub Pages serves /TaskerBot/auth/callback with HTTP 200 OK and supports SPA deep links.
const spaStaticRoutesPlugin = () => ({
  name: 'spa-static-routes',
  closeBundle() {
    const distDir = path.resolve(process.cwd(), 'dist')
    const indexHtml = path.join(distDir, 'index.html')
    if (!fs.existsSync(indexHtml)) return

    // 1. Copy to 404.html for general SPA fallback on GitHub Pages
    fs.copyFileSync(indexHtml, path.join(distDir, '404.html'))

    // 2. Copy to auth/callback/index.html so OAuth redirect_uri returns HTTP 200 OK on GitHub Pages
    const callbackDir = path.join(distDir, 'auth', 'callback')
    fs.mkdirSync(callbackDir, { recursive: true })
    fs.copyFileSync(indexHtml, path.join(callbackDir, 'index.html'))
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + '/..', '')
  const basePath = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/'

  return {
    plugins: [react(), spaStaticRoutesPlugin()],
    base: basePath,
    envDir: '../',
    envPrefix: ['VITE_', 'GEMINI_', 'GROQ_', 'OPENROUTER_'],
    define: {
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(
        env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || ''
      ),
      'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(
        env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || ''
      ),
      'import.meta.env.VITE_OPENROUTER_API_KEY': JSON.stringify(
        env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || ''
      ),
      'import.meta.env.VITE_TELEGRAM_CLIENT_ID': JSON.stringify(
        process.env.VITE_TELEGRAM_CLIENT_ID || env.VITE_TELEGRAM_CLIENT_ID || env.TELEGRAM_OIDC_CLIENT_ID || '8987055615'
      ),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})

