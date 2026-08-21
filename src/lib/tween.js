/**
 * Micro-biblioteca de animação (substitui GSAP).
 * ~2KB, sem dependências: easings, damping frame-rate independent e uma
 * timeline simples o bastante para a sequência de abertura do hero.
 */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolação exponencial independente de framerate (Game Programming Gems). */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Progresso 0→1 de `value` dentro da janela [start, end]. */
export const range = (value, start, end) => clamp((value - start) / (end - start));

export const easing = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t) => {
    const c1 = 1.18, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outSine: (t) => Math.sin((t * Math.PI) / 2),
};

/**
 * Timeline declarativa mínima.
 * tl.add({ at, duration, ease, onUpdate });  tl.seek(elapsedSeconds);
 */
export class Timeline {
  constructor() {
    this.tracks = [];
    this.duration = 0;
  }

  add({ at = 0, duration = 1, ease = easing.outCubic, onUpdate, onComplete }) {
    this.tracks.push({ at, duration, ease, onUpdate, onComplete, done: false });
    this.duration = Math.max(this.duration, at + duration);
    return this;
  }

  seek(elapsed) {
    for (const tr of this.tracks) {
      const raw = clamp((elapsed - tr.at) / tr.duration);
      if (tr.onUpdate) tr.onUpdate(tr.ease(raw), raw);
      if (raw >= 1 && !tr.done) {
        tr.done = true;
        if (tr.onComplete) tr.onComplete();
      }
    }
    return elapsed >= this.duration;
  }

  /** Salta direto para o estado final (usado em prefers-reduced-motion). */
  complete() {
    this.seek(this.duration + 1);
  }
}
