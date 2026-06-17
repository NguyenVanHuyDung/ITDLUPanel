import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8888',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Force-include storage-related modals into their parent chunk
          if (id.includes('GoogleDriveManageModal')) return 'GoogleDriveManageModal';
          if (id.includes('S3StorageManageModal')) return 'S3StorageManageModal';
          if (id.includes('FTPStorageManageModal')) return 'FTPStorageManageModal';
        },
      },
    },
  },
})
