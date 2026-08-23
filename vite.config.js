import { defineConfig } from 'vite';
import { WHATSAPP_URL } from './src/config/contact.js';

/**
 * Injeta os links de contato no HTML em tempo de build.
 *
 * O site é HTML estático: preencher os CTAs por JavaScript deixaria o botão
 * mais importante da página dependendo do bundle carregar. Substituindo no
 * build, o href sai literal no HTML publicado e a fonte da verdade continua
 * sendo um arquivo só (src/config/contact.js).
 */
const contactLinks = () => ({
  name: 'vitanova-contact-links',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replaceAll('%WHATSAPP_URL%', WHATSAPP_URL),
  },
});

export default defineConfig({
  plugins: [contactLinks()],
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
