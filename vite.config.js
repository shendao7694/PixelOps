import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generateUUID = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 : Math.random() * 4 + 8) | 0).toString(16);

export default defineConfig({
  root: 'public',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: 'terser',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'public/index.html'),
        edit: path.resolve(__dirname, 'public/edit/index.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          if (id.includes('src/safe')) {
            return 'safe';
          }
          if (id.includes('src/core')) {
            return 'core';
          }
          if (id.includes('src/fx')) {
            return 'fx';
          }
          if (id.includes('src/maps')) {
            return 'maps';
          }
          if (id.includes('src/render')) {
            return 'render';
          }
          if (id.includes('src/net')) {
            return 'net';
          }
          if (id.includes('src/world')) {
            return 'world';
          }
          if (id.includes('src/game')) {
            return 'game';
          }
          if (id.includes('src/ui')) {
            return 'ui';
          }
        },
        entryFileNames: (chunkInfo) => `chunks/page/${generateUUID()}.js`,
        chunkFileNames: (chunkInfo) => `chunks/${generateUUID()}.js`,
        assetFileNames: (assetInfo) => `assets/${generateUUID()}.[ext]`,
      },
    },
    assetsDir: 'assets',
    copyPublicDir: false,
  },
  publicDir: false,
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      'src': path.resolve(__dirname, 'public/src'),
      'vendor': path.resolve(__dirname, 'public/vendor'),
    },
  },
});