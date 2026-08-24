/**
 * Ponto único de verdade do contato da Vita Nova.
 *
 * Os links de WhatsApp do site são gerados a partir daqui em tempo de build
 * (ver o plugin `contactLinks` em vite.config.js), então o HTML publicado sai
 * com o href literal — o CTA funciona mesmo que o JavaScript falhe ou demore.
 * Para trocar o número ou a mensagem, edite só este arquivo.
 */

/** Código do país (55) + DDD (11) + número, sem símbolos. */
export const WHATSAPP_NUMBER = '5511936196768';

/** Mensagem pré-preenchida na conversa. */
export const WHATSAPP_DEFAULT_MESSAGE = 'Oi! Vim pelo Instagram da Vita Nova 🌿';

/**
 * Monta o link wa.me com a mensagem codificada para URL.
 * @param {string} [message] mensagem específica de um botão, se houver
 */
export function whatsappUrl(message = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Link direto de conversa 1:1. Mantido para quando for preciso. */
export const WHATSAPP_URL = whatsappUrl();

/**
 * Página do grupo aberto — destino atual dos CTAs do site.
 *
 * Hoje é uma rota do próprio Worker (`public/grupo/index.html`). Se a página
 * for para outro repositório e ganhar domínio próprio, basta trocar por essa
 * URL absoluta aqui: os três CTAs do site acompanham.
 */
export const GRUPO_URL = '/grupo';
