import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '.',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/index.jsx',
      output: {
        entryFileNames: 'js/index.js',
        assetFileNames: function (assetInfo) {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/index.css';
          }
          // Put fonts in css/ directory alongside the CSS
          return 'css/[name][extname]';
        },
        format: 'iife'
      }
    }
  }
});
