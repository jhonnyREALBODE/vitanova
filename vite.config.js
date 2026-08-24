import { defineConfig } from 'vite';
import { WHATSAPP_URL, GRUPO_URL } from './src/config/contact.js';

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
    handler: (html) =>
      html
        .replaceAll('%WHATSAPP_URL%', WHATSAPP_URL)
        .replaceAll('%GRUPO_URL%', GRUPO_URL)
        // Carimbo de build: permite abrir o site publicado, ver o fonte e
        // saber na hora QUAL versão está no ar — sem isso, "o deploy não
        // subiu" e "o navegador está com cache" são indistinguíveis.
        .replaceAll('%BUILD_ID%', buildId()),
  },
});

function buildId() {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const sha =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    '';
  return sha ? `${when} ${sha.slice(0, 7)}` : when;
}

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
