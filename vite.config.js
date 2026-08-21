import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    target: 'es2019',
    cssTarget: 'safari14',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        // Só o core do three vai para o chunk compartilhado. Os addons de
        // pós-processamento ficam no chunk dinâmico do postfx, para que
        // aparelhos sem bloom nunca cheguem a baixá-los.
        manualChunks(id) {
          if (id.includes('node_modules/three/build/')) return 'three';
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
