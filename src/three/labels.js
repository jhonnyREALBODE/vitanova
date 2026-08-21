import { Vector3 } from 'three';

/**
 * Rótulos do diagrama em HTML, projetados a partir das posições 3D.
 *
 * Por que HTML e não texto no canvas: fonte nítida em qualquer DPR, herda a
 * tipografia do site, é selecionável por ferramentas de acessibilidade e não
 * custa nada de GPU. O preço é uma projeção por frame — só transform, nunca
 * layout, então não gera reflow.
 *
 * A "área segura" impede que qualquer rótulo invada a coluna de texto do hero
 * ou saia pela borda da tela.
 */
export class DiagramLabels {
  constructor(containerEl) {
    this.container = containerEl;
    this.els = containerEl ? Array.from(containerEl.querySelectorAll('.node-label-3d')) : [];
    this.widths = this.els.map(() => 90);
    this.heights = this.els.map(() => 18);
    this.mode = 'desktop';
    this.safe = { left: 0, right: 0, top: 0, bottom: 0 };
    this._v = new Vector3();
    this._v2 = new Vector3();
    this._points = [];
    this._opacity = this.els.map(() => 0);
  }

  get ready() { return this.els.length > 0; }

  /** Mede os rótulos uma vez por resize (e depois que as fontes carregam). */
  measure() {
    this.els.forEach((el, i) => {
      const prev = el.style.opacity;
      el.style.opacity = '0';
      const r = el.getBoundingClientRect();
      if (r.width) { this.widths[i] = r.width; this.heights[i] = r.height; }
      el.style.opacity = prev;
    });
  }

  setMode(mode) { this.mode = mode; }

  /** @param {{left:number,right:number,top:number,bottom:number}} safe px na viewport */
  setSafeArea(safe) { this.safe = safe; }

  /**
   * @param {Vector3[]} worldPoints
   *   0 = origem, 1..3 = sintomas, 4 = topo visual do núcleo.
   *   O ponto 4 existe porque o núcleo tem raio grande em pixels: ancorar o
   *   rótulo "dopamina" no centro dele o deixaria ilegível sobre o brilho.
   */
  setPoints(worldPoints) { this._points = worldPoints; }

  setOpacity(i, v) {
    if (!this.els[i]) return;
    this._opacity[i] = v;
    this.els[i].style.opacity = String(v);
  }

  /**
   * @param camera câmera da cena
   * @param {number} w largura da viewport
   * @param {number} h altura da viewport
   * @param {number} heroTop deslocamento do topo do hero na viewport (px)
   */
  update(camera, w, h, heroTop) {
    if (!this.ready || !this._points.length) return;

    const pad = 14;

    // X projetado da origem, calculado uma vez por frame
    this._v2.copy(this._points[0]).project(camera);
    const originX = (this._v2.x * 0.5 + 0.5) * w;

    let coreTopY = null;
    if (this._points[4]) {
      this._v2.copy(this._points[4]).project(camera);
      coreTopY = (1 - (this._v2.y * 0.5 + 0.5)) * h;
    }

    for (let i = 0; i < this._points.length && i < this.els.length; i++) {
      const el = this.els[i];
      if (this._opacity[i] <= 0.001) continue;

      this._v.copy(this._points[i]).project(camera);
      const sx = (this._v.x * 0.5 + 0.5) * w;
      const sy = (1 - (this._v.y * 0.5 + 0.5)) * h;

      // atrás da câmera → esconde
      if (this._v.z > 1) { el.style.opacity = '0'; continue; }
      el.style.opacity = String(this._opacity[i]);

      const lw = this.widths[i];
      const lh = this.heights[i];
      const isRoot = i === 0;

      let x;
      let y;

      if (isRoot) {
        // acima do topo visual do núcleo, nunca sobre ele
        const anchor = coreTopY !== null ? Math.min(coreTopY, sy) : sy;
        x = sx - lw / 2;
        y = anchor - lh - 12;
      } else if (this.mode === 'mobile') {
        x = sx - lw / 2;
        y = sy + 15;
      } else {
        // rótulo do lado externo do nó (para longe da origem projetada)
        const toRight = sx >= originX;
        x = toRight ? sx + 17 : sx - lw - 17;
        y = sy - lh / 2;
      }

      // área segura: nunca por cima da coluna de texto nem fora da tela
      const minX = Math.max(pad, this.safe.left);
      const maxX = Math.min(w - pad, this.safe.right || w - pad) - lw;
      x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
      y = Math.min(Math.max(y, this.safe.top + pad), h - lh - pad);

      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y - heroTop)}px, 0)`;
    }
  }
}
