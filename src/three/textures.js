import { CanvasTexture, SRGBColorSpace } from 'three';

const cache = new Map();

/**
 * Textura radial procedural para sprites de glow.
 * Gerada em canvas 2D (nenhum asset externo, nada para baixar).
 */
export function glowTexture(rgb, { size = 128, falloff = 2.2 } = {}) {
  const key = `${rgb}|${size}|${falloff}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const img = ctx.createImageData(size, size);
  const [r, g, b] = rgb;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const a = Math.pow(1 - d, falloff);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function disposeTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
