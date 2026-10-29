import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { stormPlugin } from './server/storm.js'

export default defineConfig({
  plugins: [react(), stormPlugin()],
  server: { port: 5180, strictPort: true, open: false },
  define: { 'process.env.IS_PREACT': JSON.stringify('false') },
})
