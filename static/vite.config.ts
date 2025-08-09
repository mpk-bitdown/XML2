
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true
    },
    define: {
      __API__: JSON.stringify(env.VITE_API_BASE || '')
    }
  }
})
