import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const commitDate = execSync('git log -1 --format=%ci').toString().trim()
const commitCount = execSync('git rev-list --count HEAD').toString().trim()

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@pdf-lib/standard-fonts'],
    include: ['pako']
  },
  server: {
    hmr: { overlay: false }
  },
  define: {
    __APP_VERSION__: JSON.stringify(`1.0.${commitCount}`),
    __APP_COMMIT__: JSON.stringify(commitHash),
    __APP_BUILD_DATE__: JSON.stringify(commitDate),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})
