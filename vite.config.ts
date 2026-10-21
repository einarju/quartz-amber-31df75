import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Static site for GitHub Pages at /quartz-amber-31df75/. No server: data comes from the
// private registry repo through the GitHub API after sign-in.
export default defineConfig({
  root: 'app',
  base: '/quartz-amber-31df75/',
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  server: { port: 4325, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
