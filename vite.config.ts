import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: './tests/setup.ts', maxWorkers: 1, exclude: ['tests/rules/**', 'functions/**', '**/node_modules/**', 'dist/**'] },
})
