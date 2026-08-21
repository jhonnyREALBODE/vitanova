/**
 * Orçamento de performance.
 *
 * Duas camadas:
 *  1. `detectTier()` — palpite estático (GPU, memória, núcleos, save-data)
 *     feito antes de criar qualquer geometria, para nunca alocar mais do que
 *     o aparelho aguenta.
 *  2. `PerfMonitor` — medição real de framerate depois que a cena está
 *     rodando; se o aparelho não sustentar ~50fps, o experience derruba
 *     recursos em degraus (bloom → resolução → densidade de partículas).
 *
 * A regra é sempre a mesma: preferir cair de qualidade a cair de framerate.
 */

export const PRESETS = {
  high: {
    name: 'high',
    dprCap: 2,
    antialias: true,
    bloom: true,
    bloomStrength: 0.72,
    bloomRadius: 0.62,
    bloomThreshold: 0.62,
    bloomScale: 0.5,      // render targets do bloom a 1/2 da resolução
    fieldCount: 2400,
    streamCount: 168,
    tubeSegments: 96,
    tubeRadial: 10,
    coreDetail: 4,
    halo: true,
    ambient: true,
    richBackdrop: true,
  },
  medium: {
    name: 'medium',
    dprCap: 1.6,
    antialias: true,
    bloom: false,
    fieldCount: 1200,
    streamCount: 96,
    tubeSegments: 64,
    tubeRadial: 7,
    coreDetail: 3,
    halo: true,
    ambient: true,
    richBackdrop: true,
  },
  low: {
    name: 'low',
    dprCap: 1.25,
    antialias: false,
    bloom: false,
    fieldCount: 480,
    streamCount: 0,
    tubeSegments: 40,
    tubeRadial: 5,
    coreDetail: 2,
    halo: false,
    ambient: false,
    richBackdrop: false,
  },
};

const WEAK_GPU = /(adreno[^0-9]*[1-5][0-9][0-9])|(mali-[tg][0-9])|(mali-4)|(powervr)|(videocore)|(swiftshader)|(llvmpipe)|(intel.*(hd|uhd) graphics (3|4|5|6)[0-9]{2})/i;
const STRONG_GPU = /(apple m[1-9])|(rtx)|(gtx 1[0-9]{3})|(radeon (rx|pro))|(adreno[^0-9]*(6[5-9][0-9]|7[0-9][0-9]|8[0-9][0-9]))|(apple a1[4-9])|(apple gpu)/i;

function readRendererString(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return String(gl.getParameter(gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/** @returns {{supported:boolean, tier:string, preset:object, webgl2:boolean, reason:string}} */
export function detectTier() {
  const probe = document.createElement('canvas');
  let gl = null;
  let webgl2 = false;
  try {
    gl = probe.getContext('webgl2');
    webgl2 = !!gl;
    if (!gl) gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl) {
    return { supported: false, tier: 'none', preset: PRESETS.low, webgl2: false, reason: 'sem webgl' };
  }

  /* Override de QA: ?tier=high|medium|low força o preset, para conseguir
     validar cada nível de qualidade sem precisar do aparelho correspondente. */
  const forced = new URLSearchParams(window.location.search).get('tier');
  if (forced && PRESETS[forced]) {
    const lose0 = gl.getExtension('WEBGL_lose_context');
    if (lose0) lose0.loseContext();
    return { supported: true, tier: forced, preset: { ...PRESETS[forced] }, webgl2, reason: 'forçado via ?tier' };
  }

  const rendererStr = readRendererString(gl);
  const mobile = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const mem = navigator.deviceMemory || (mobile ? 4 : 8);
  const cores = navigator.hardwareConcurrency || (mobile ? 4 : 8);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

  let score = 2;
  const notes = [];

  if (mobile) { score -= 0.6; notes.push('mobile'); }
  if (!webgl2) { score -= 1; notes.push('webgl1'); }
  if (mem >= 8) { score += 1; } else if (mem <= 3) { score -= 1.1; notes.push('mem<=3'); }
  if (cores >= 8) { score += 0.8; } else if (cores <= 4) { score -= 0.6; notes.push('cores<=4'); }
  if (maxTex < 4096) { score -= 0.8; notes.push('maxtex'); }
  if (WEAK_GPU.test(rendererStr)) { score -= 1.6; notes.push('gpu fraca'); }
  else if (STRONG_GPU.test(rendererStr)) { score += 1; }
  if (saveData) { score -= 2.5; notes.push('save-data'); }
  // telas grandes com DPR alto custam caro em fill rate
  if (mobile && (window.devicePixelRatio || 1) >= 3) { score -= 0.3; }

  // libera o contexto de sondagem
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  const tier = score >= 2.7 ? 'high' : score >= 1.3 ? 'medium' : 'low';
  return {
    supported: true,
    tier,
    preset: { ...PRESETS[tier] },
    webgl2,
    reason: `score ${score.toFixed(2)}${notes.length ? ' — ' + notes.join(', ') : ''}`,
  };
}

/**
 * Mede o framerate real e dispara degraus de degradação.
 * Ignora os primeiros frames (compilação de shader / upload de geometria).
 */
export class PerfMonitor {
  constructor({ onDowngrade, targetFps = 50, warmupMs = 1200, windowMs = 1000, strikes = 2 } = {}) {
    this.onDowngrade = onDowngrade;
    this.targetFps = targetFps;
    this.warmupMs = warmupMs;
    this.windowMs = windowMs;
    this.maxStrikes = strikes;
    this.reset();
  }

  reset() {
    this.startedAt = performance.now();
    this.windowStart = this.startedAt;
    this.frames = 0;
    this.strikes = 0;
    this.stopped = false;
  }

  /** Chamado uma vez por frame renderizado. */
  tick(now) {
    if (this.stopped) return;
    if (now - this.startedAt < this.warmupMs) {
      this.windowStart = now;
      this.frames = 0;
      return;
    }
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return;

    const fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.windowStart = now;

    if (fps < this.targetFps) {
      this.strikes++;
      if (this.strikes >= this.maxStrikes) {
        this.strikes = 0;
        const keepGoing = this.onDowngrade ? this.onDowngrade(fps) : false;
        if (!keepGoing) this.stopped = true;
      }
    } else {
      this.strikes = Math.max(0, this.strikes - 1);
    }
  }

  stop() { this.stopped = true; }
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
