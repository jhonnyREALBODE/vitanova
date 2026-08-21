import './styles/base.css';
import './styles/nav.css';
import './styles/hero.css';
import './styles/sections.css';

import { initReveal, initHeaderState } from './lib/reveal.js';

const heroEl = document.querySelector('.hero');
const headerEl = document.querySelector('header.site');

// UI primeiro: nada do site depende do WebGL para funcionar.
initReveal();
initHeaderState(headerEl, heroEl);

// A cena 3D entra depois, em chunk separado — se falhar (WebGL bloqueado,
// GPU na blocklist, extensão de privacidade), a página continua completa
// com os fundos CSS originais.
const canvas = document.getElementById('gl-canvas');

if (canvas && heroEl) {
  import('./three/experience.js')
    .then(({ createExperience }) => {
      const experience = createExperience({
        canvas,
        heroEl,
        heroInnerEl: document.querySelector('.hero-inner'),
        labelsEl: document.getElementById('diagram-labels'),
        formatEl: document.getElementById('formato'),
        headerEl,
      });

      if (!experience) {
        canvas.remove();
        return;
      }
      if (import.meta.env.DEV) {
        console.info(`[vitanova] tier ${experience.detection.tier} — ${experience.detection.reason}`);
      }
      window.addEventListener('pagehide', () => experience.dispose(), { once: true });
    })
    .catch(() => canvas.remove());
} else if (canvas) {
  canvas.remove();
}
