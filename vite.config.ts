import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { offlineAssetsPlugin } from './build/pwaPlugin'

export default defineConfig({
  plugins: [react(), offlineAssetsPlugin()],
  server: {
    port: 5173,
  },
})
