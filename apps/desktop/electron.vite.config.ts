import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workspace shared is raw ESM .ts — must be bundled, not require()'d at runtime.
const externalize = externalizeDepsPlugin({
  exclude: ['@knowledge-desktop/shared'],
})

export default defineConfig({
  main: {
    plugins: [externalize],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
        external: ['@lancedb/lancedb'],
      },
    },
  },
  preload: {
    plugins: [externalize],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
      },
    },
  },
})
