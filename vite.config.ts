import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => ({
  base: './',
  resolve: command === 'serve' ? { alias: [{ find: /^cesium$/, replacement: resolve('node_modules/cesium/Build/Cesium/index.js') }] } : {},
  build: { rollupOptions: { external: ['cesium'] } },
  test: { include: ['tests/**/*.test.ts'] }
}))
