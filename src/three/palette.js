import { Color } from 'three';

/** Espelha os tokens de --dark-* / --glow-* do CSS (src/styles/base.css). */
export const PALETTE = {
  dark1: 0x16330d,
  dark2: 0x0c1c07,
  dark3: 0x050f03,
  ink: 0x17330a,
  green: 0x9ddb6a,
  greenMid: 0x5c8a2e,
  greenDeep: 0x2b5410,
  terra: 0xe8814f,
  terraDeep: 0xc1512b,
  paper: 0xf5f2e4,
};

export const c = (hex) => new Color(hex);

/** Paletas de fundo por região da página. */
export const BACKDROP = {
  hero: {
    inner: c(0x1c3f10),
    mid: c(PALETTE.dark2),
    outer: c(PALETTE.dark3),
    center: [0.66, 0.46],
    intensity: 1,
  },
  format: {
    inner: c(0x1a3a0e),
    mid: c(0x0d1d06),
    outer: c(0x081204),
    center: [0.2, 0.18],
    intensity: 0.72,
  },
};
