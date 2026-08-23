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

/** Link padrão, usado por todos os CTAs "Falar no WhatsApp". */
export const WHATSAPP_URL = whatsappUrl();
