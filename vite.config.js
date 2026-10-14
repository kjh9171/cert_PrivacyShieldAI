import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        // 무거운 파서는 별도 청크로 분리해 초기 번들을 가볍게 유지
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})