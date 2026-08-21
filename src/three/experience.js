import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Vector3, MathUtils, Color,
} from 'three';

import { Backdrop } from './backdrop.js';
import { DopamineCore } from './core.js';
import { Branches } from './branches.js';
import { ParticleField } from './field.js';
import { DiagramLabels } from './labels.js';
import { PALETTE } from './palette.js';
import { detectTier, PerfMonitor, prefersReducedMotion } from '../lib/quality.js';
import { Timeline, easing, clamp, damp, smoothstep } from '../lib/tween.js';

/** Composição da estrutura em cada layout. Origem sempre em (0,0,0). */
const ENDPOINTS = {
  desktop: [
    { position: new Vector3(3.30, 2.15, -0.35), color: PALETTE.green },  // compulsão
    { position: new Vector3(3.95, -0.05, 0.55), color: PALETTE.green },  // tela
    { position: new Vector3(3.05, -2.25, -0.75), color: PALETTE.terra }, // insônia
  ],
  mobile: [
    { position: new Vector3(-2.05, -2.00, -0.30), color: PALETTE.green },
    { position: new Vector3(0.10, -2.90, 0.50), color: PALETTE.green },
    { position: new Vector3(2.15, -1.90, -0.60), color: PALETTE.terra },
  ],
};

/* Caixa envolvente do que é DESENHADO, não só dos pontos: inclui o raio da
   gaiola do núcleo (~1.15) e o halo dos nós (~0.5). Sem isso a estrutura
   encosta nas bordas e passa por baixo do header em telas pequenas. */
const BBOX = {
  desktop: { cx: 1.65, cy: -0.05, w: 5.60, h: 5.40 },
  mobile: { cx: 0.05, cy: -1.125, w: 5.20, h: 4.55 },
};

/** Retângulo alvo (fração da viewport) onde a estrutura deve caber. */
const TARGET_RECT = {
  desktop: { x0: 0.50, x1: 0.90, y0: 0.16, y1: 0.86 },
  mobile: { x0: 0.06, x1: 0.94, y0: 0.13, y1: 0.40 },
};

const DESKTOP_BREAKPOINT = 1080;
/** Folga à direita da coluna, onde cabem os rótulos dos sintomas. */
const LABEL_GUTTER = 110;
const CAMERA_Z = 12;
const FOV = 42;

export function createExperience({ canvas, heroEl, heroInnerEl, labelsEl, formatEl, headerEl }) {
  const detection = detectTier();
  if (!detection.supported) return null;

  const reduced = prefersReducedMotion();
  const preset = detection.preset;

  // -------------------------------------------------------------------------
  // renderer / cena
  // -------------------------------------------------------------------------
  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
      // precisão deixada no default do three (highp nos dois estágios):
      // declarar mediump só no fragment quebra o link quando um uniform é
      // compartilhado com o vertex shader — falha real em drivers móveis.
    });
  } catch {
    return null;
  }

  let dprCap = preset.dprCap;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(pixelRatio());
  renderer.setClearColor(new Color(PALETTE.dark3), 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 120);
  camera.position.set(0, 0, CAMERA_Z);

  const backdrop = new Backdrop({ rich: preset.richBackdrop });
  scene.add(backdrop.mesh);

  // ---- grupo do hero -------------------------------------------------------
  const heroGroup = new Group();
  scene.add(heroGroup);

  const structure = new Group();
  heroGroup.add(structure);

  const core = new DopamineCore({ detail: preset.coreDetail, radius: 0.62 });
  structure.add(core.group);

  const branches = new Branches({
    segments: preset.tubeSegments,
    radial: preset.tubeRadial,
    streamCount: preset.streamCount,
    halo: preset.halo,
  });
  structure.add(branches.group);

  const heroField = new ParticleField({
    count: preset.fieldCount,
    extent: [30, 17, 14],
    depth: -3,
    color: 0x9dc97a,
    accent: 0xf5f2e4,
    accentRatio: 0.16,
    size: [1.1, 4.2],
    drift: 0.55,
    speed: 1,
    opacity: 0,
    near: 4,
    far: 30,
  });
  heroGroup.add(heroField.points);

  // ---- camada ambiente da seção "Como funciona" ----------------------------
  let ambientField = null;
  if (preset.ambient && !reduced && formatEl) {
    ambientField = new ParticleField({
      count: Math.round(preset.fieldCount * 0.36),
      extent: [30, 18, 10],
      depth: -2,
      color: 0x8ec065,
      accent: 0xe8814f,
      accentRatio: 0.12,
      size: [1.4, 4.4],
      drift: 0.34,
      speed: 0.5,
      opacity: 0,
      near: 5,
      far: 28,
    });
    scene.add(ambientField.points);
    document.documentElement.classList.add('gl-ambient');
  }

  const labels = new DiagramLabels(labelsEl);

  // ---- pós-processamento (só no tier alto, carregado sob demanda) ----------
  let postfx = null;
  let postfxPending = false;
  function enableBloom() {
    if (postfx || postfxPending || reduced || !preset.bloom) return;
    postfxPending = true;
    import('./postfx.js')
      .then(({ PostFX }) => {
        if (disposed) return;
        postfx = new PostFX(renderer, scene, camera, {
          strength: preset.bloomStrength,
          radius: preset.bloomRadius,
          threshold: preset.bloomThreshold,
          scale: preset.bloomScale,
        });
        postfx.setSize(size.w, size.h, pixelRatio());
      })
      .catch(() => { /* sem bloom: a cena continua legível */ })
      .finally(() => { postfxPending = false; });
  }

  // -------------------------------------------------------------------------
  // layout
  // -------------------------------------------------------------------------
  const size = { w: 1, h: 1 };
  let mode = null;
  let structureNdc = { x: 0.66, y: 0.46 };
  const geom = { heroTopDoc: 0, heroHeight: 1, formatTopDoc: 0, formatHeight: 0 };

  function visibleSize() {
    const h = 2 * Math.tan(MathUtils.degToRad(FOV) / 2) * CAMERA_Z;
    return { w: h * camera.aspect, h };
  }

  function layout() {
    size.w = window.innerWidth;
    size.h = window.innerHeight;

    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / Math.max(1, size.h);
    camera.updateProjectionMatrix();

    backdrop.setSize(size.w, size.h);
    heroField.setPixelRatio(renderer.getPixelRatio());
    branches.setPixelRatio(renderer.getPixelRatio());
    if (ambientField) ambientField.setPixelRatio(renderer.getPixelRatio());
    if (postfx) postfx.setSize(size.w, size.h, pixelRatio());

    // Em paisagem de celular sobra largura e falta altura: a composição
    // lado a lado (a mesma do desktop) cabe melhor do que a empilhada.
    const landscapeWide = size.w >= 680 && size.h <= 600 && size.w > size.h;
    const nextMode = size.w >= DESKTOP_BREAKPOINT || landscapeWide ? 'desktop' : 'mobile';
    if (nextMode !== mode) {
      mode = nextMode;
      branches.setEndpoints(ENDPOINTS[mode]);
      labels.setMode(mode);
    }

    /* Retângulo alvo derivado do layout real, não de números fixos: o CSS é
       a fonte da verdade sobre onde o texto começa, e a estrutura 3D se
       encaixa no espaço que sobra. É o que impede colisão com a coluna de
       texto em qualquer largura, inclusive nas que não testamos. */
    const rect = { ...TARGET_RECT[mode] };
    const headerH = headerEl ? headerEl.offsetHeight : 64;
    const scrollNow = window.scrollY || window.pageYOffset || 0;
    const innerRect = heroInnerEl ? heroInnerEl.getBoundingClientRect() : null;

    if (mode === 'desktop') {
      if (innerRect) rect.x0 = clamp((innerRect.right + 44) / size.w, 0.44, 0.72);

      /* O limite direito é a coluna do site, não a borda da tela.
         Ancorando na viewport, `visW` cresce com o aspecto e a estrutura
         cresce junto: 379px de largura em 1440, 873px em 2560 ultrawide,
         enquanto o texto continua preso em 1120px. O resultado é uma
         composição esticada, com o 3D fugindo do conteúdo. Amarrado ao
         wrap, o tamanho fica estável (~420-520px) em qualquer largura. */
      const wrapEl = heroEl.querySelector('.wrap');
      if (wrapEl) {
        const wrapRight = wrapEl.getBoundingClientRect().right;
        rect.x1 = clamp((wrapRight + LABEL_GUTTER) / size.w, rect.x0 + 0.16, 0.90);
      }

      rect.y0 = clamp((headerH + 26) / size.h, 0.08, 0.30);
      rect.y1 = 0.88;
    } else {
      // faixa livre entre o header e o topo do bloco de texto
      const innerTopAtTop = innerRect ? innerRect.top + scrollNow : size.h * 0.46;
      rect.y0 = clamp((headerH + 40) / size.h, 0.05, 0.30);
      rect.y1 = clamp((innerTopAtTop - 40) / size.h, rect.y0 + 0.12, 0.55);
    }

    const vis = visibleSize();
    const box = BBOX[mode];
    const rectW = (rect.x1 - rect.x0) * vis.w;
    const rectH = (rect.y1 - rect.y0) * vis.h;
    const scale = Math.min(rectW / box.w, rectH / box.h);

    const cxN = (rect.x0 + rect.x1) / 2;
    const cyN = (rect.y0 + rect.y1) / 2;
    const worldX = (cxN - 0.5) * vis.w;
    const worldY = (0.5 - cyN) * vis.h;

    structure.scale.setScalar(scale);
    structure.position.set(worldX - box.cx * scale, worldY - box.cy * scale, 0);

    // posição normalizada do núcleo — alimenta o centro do gradiente de fundo
    structureNdc = {
      x: 0.5 + structure.position.x / vis.w,
      y: 0.5 - structure.position.y / vis.h,
    };

    // área segura dos rótulos
    labels.setSafeArea({
      left: mode === 'desktop' && heroInnerEl
        ? heroInnerEl.getBoundingClientRect().right + 14
        : 12,
      right: size.w - 12,
      top: headerH + 4,
      bottom: size.h,
    });
    labels.measure();

    measureDocument();
  }

  function measureDocument() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const heroRect = heroEl.getBoundingClientRect();
    geom.heroTopDoc = heroRect.top + scrollY;
    geom.heroHeight = heroRect.height || 1;
    if (formatEl) {
      const fRect = formatEl.getBoundingClientRect();
      geom.formatTopDoc = fRect.top + scrollY;
      geom.formatHeight = fRect.height;
    }
  }

  // -------------------------------------------------------------------------
  // abertura
  // -------------------------------------------------------------------------
  const state = {
    intro: 0,
    fieldOpacity: 0,
    streamOpacity: 0,
    labelOpacity: [0, 0, 0, 0],
    nodeOpacity: [0, 0, 0],
    cameraZ: reduced ? CAMERA_Z : CAMERA_Z * 0.56,
    ambientOpacity: 0,
  };

  const timeline = new Timeline();
  timeline
    .add({
      at: 0, duration: 1.9, ease: easing.outExpo,
      onUpdate: (p) => { state.cameraZ = MathUtils.lerp(CAMERA_Z * 0.56, CAMERA_Z, p); },
    })
    .add({
      at: 0.05, duration: 0.95, ease: easing.outBack,
      onUpdate: (p) => { state.intro = p; },
    })
    .add({ at: 0.20, duration: 1.5, ease: easing.outCubic, onUpdate: (p) => { state.fieldOpacity = p; } });

  [0, 1, 2].forEach((i) => {
    timeline.add({
      at: 0.38 + i * 0.13, duration: 0.85, ease: easing.outQuart,
      onUpdate: (p) => branches.setBranchReveal(i, p),
      onComplete: () => core.pulse(0.55),
    });
    timeline.add({
      at: 0.95 + i * 0.13, duration: 0.5, ease: easing.outCubic,
      onUpdate: (p) => { state.nodeOpacity[i] = p; },
    });
    timeline.add({
      at: 1.10 + i * 0.13, duration: 0.5, ease: easing.outCubic,
      onUpdate: (p) => { state.labelOpacity[i + 1] = p; },
    });
  });

  timeline
    .add({ at: 0.55, duration: 0.6, ease: easing.outCubic, onUpdate: (p) => { state.labelOpacity[0] = p; } })
    .add({ at: 1.0, duration: 1.0, ease: easing.outCubic, onUpdate: (p) => { state.streamOpacity = p; } });

  // -------------------------------------------------------------------------
  // interação e scroll
  // -------------------------------------------------------------------------
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  function onPointerMove(e) {
    pointer.tx = (e.clientX / size.w) * 2 - 1;
    pointer.ty = (e.clientY / size.h) * 2 - 1;
  }
  if (finePointer && !reduced) window.addEventListener('pointermove', onPointerMove, { passive: true });

  let scrollY = window.scrollY || 0;
  let scrollDirty = true;
  const onScroll = () => { scrollY = window.scrollY || window.pageYOffset || 0; scrollDirty = true; requestRender(); };
  window.addEventListener('scroll', onScroll, { passive: true });

  // -------------------------------------------------------------------------
  // loop
  // -------------------------------------------------------------------------
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let introStart = 0;
  let time = 0;
  let running = false;
  let disposed = false;
  let introDone = reduced;
  let emitTimer = 0;
  // 0 = origem, 1..3 = sintomas, 4 = topo visual do núcleo (âncora do rótulo)
  const labelPoints = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const CORE_TOP = new Vector3(0, 1.15, 0);

  const perf = new PerfMonitor({
    targetFps: 50,
    onDowngrade: (fps) => downgrade(fps),
  });

  function regions() {
    const heroTopVp = geom.heroTopDoc - scrollY;
    const heroVisible = heroTopVp < size.h && heroTopVp + geom.heroHeight > 0;
    let formatVisible = false;
    if (ambientField) {
      const fTopVp = geom.formatTopDoc - scrollY;
      formatVisible = fTopVp < size.h && fTopVp + geom.formatHeight > 0;
    }
    return { heroVisible, formatVisible, heroTopVp };
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    /* O timestamp do rAF é o início do frame e pode ser ANTERIOR ao
       performance.now() lido em start() — sem o clamp inferior, dt fica
       negativo no primeiro frame e propaga índices negativos adiante. */
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0.016));
    last = now;

    const { heroVisible, formatVisible, heroTopVp } = regions();
    if (!heroVisible && !formatVisible) return; // canvas totalmente ocluído

    time += dt;
    if (!introDone) {
      /* A abertura roda em tempo de parede, não em dt acumulado: num aparelho
         a 8fps o dt vem clampado e a intro levaria 4x mais para terminar. */
      if (introStart === 0) introStart = now;
      elapsed = (now - introStart) / 1000;
      introDone = timeline.seek(elapsed);
    }

    step(dt, heroVisible, formatVisible, heroTopVp);
    draw();
    perf.tick(now);
  }

  function step(dt, heroVisible, formatVisible, heroTopVp) {
    // progresso de saída do hero (0 no topo, 1 quando ele já saiu)
    const heroProgress = clamp(-heroTopVp / Math.max(1, geom.heroHeight * 0.85));
    const heroFade = 1 - smoothstep(0.18, 0.9, heroProgress);

    /* A câmera é posicionada ANTES de projetar os rótulos, e a matriz é
       atualizada à mão: `Vector3.project` depende de matrixWorldInverse, que
       normalmente só é recalculada dentro de renderer.render(). Sem isto o
       primeiro quadro projeta com matriz identidade — invisível no modo
       animado (corrige no frame seguinte), mas permanente em
       prefers-reduced-motion, onde só existe um quadro. */
    camera.position.z = state.cameraZ + heroProgress * 1.6;
    camera.updateMatrixWorld();

    heroGroup.visible = heroVisible && heroFade > 0.002;

    if (heroGroup.visible) {
      // parallax de ponteiro + deriva ociosa
      pointer.x = damp(pointer.x, pointer.tx, 3.2, dt);
      pointer.y = damp(pointer.y, pointer.ty, 3.2, dt);
      const idle = reduced ? 0 : Math.sin(time * 0.22) * 0.05;
      structure.rotation.y = pointer.x * 0.16 + idle;
      structure.rotation.x = pointer.y * 0.09 + Math.cos(time * 0.19) * 0.025;

      heroGroup.position.y = heroProgress * 2.2;

      core.setIntro(state.intro * heroFade);
      core.update(dt, time);

      branches.setStreamOpacity(state.streamOpacity * heroFade);
      for (let i = 0; i < 3; i++) {
        const tube = branches.tubes[i];
        if (tube) tube.material.uniforms.uOpacity.value = heroFade;
        const halo = branches.halos[i];
        if (halo) halo.material.uniforms.uOpacity.value = 0.14 * heroFade;
        branches.setNodeOpacity(i, state.nodeOpacity[i] * heroFade);
      }
      branches.update(dt, time);

      heroField.setOpacity(state.fieldOpacity * 0.6 * heroFade);
      heroField.update(dt, time);

      // pulso periódico saindo do núcleo, sincronizado com o fluxo
      emitTimer += dt;
      if (emitTimer > 2.4) { emitTimer = 0; core.pulse(0.5); }

      // rótulos — projeção a partir das posições reais no mundo
      structure.updateWorldMatrix(true, false);
      const heroTop = geom.heroTopDoc - scrollY;
      labelPoints[0].set(0, 0, 0).applyMatrix4(structure.matrixWorld);
      for (let i = 0; i < branches.nodePositions.length; i++) {
        labelPoints[i + 1].copy(branches.nodePositions[i]).applyMatrix4(structure.matrixWorld);
      }
      labelPoints[4].copy(CORE_TOP).applyMatrix4(structure.matrixWorld);
      labels.setPoints(labelPoints);
      for (let i = 0; i < 4; i++) labels.setOpacity(i, state.labelOpacity[i] * heroFade);
      labels.update(camera, size.w, size.h, heroTop);
    } else {
      for (let i = 0; i < 4; i++) labels.setOpacity(i, 0);
    }

    // camada ambiente da seção escura
    if (ambientField) {
      const target = formatVisible && !heroVisible ? 1 : 0;
      state.ambientOpacity = damp(state.ambientOpacity, target, 2.4, dt);
      ambientField.setOpacity(state.ambientOpacity * 0.62);
      if (state.ambientOpacity > 0.002) ambientField.update(dt, time);
    }

    // fundo
    if (heroVisible || !ambientField) {
      backdrop.setRegion('hero');
      backdrop.setCenter(structureNdc.x, structureNdc.y);
    } else {
      backdrop.setRegion('format');
    }
    backdrop.update(dt, time);
  }

  function draw() {
    if (postfx) postfx.render();
    else renderer.render(scene, camera);
  }

  // render sob demanda (modo reduced-motion: sem loop contínuo)
  let renderQueued = false;
  function requestRender() {
    if (!reduced || disposed) return;
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const { heroVisible, formatVisible, heroTopVp } = regions();
      if (!heroVisible && !formatVisible) return;
      step(0.016, heroVisible, formatVisible, heroTopVp);
      draw();
    });
  }

  function start() {
    if (running || disposed) return;
    running = true;
    last = performance.now();
    introStart = 0;
    perf.reset();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // -------------------------------------------------------------------------
  // degradação em tempo real
  // -------------------------------------------------------------------------
  let degradeStep = 0;
  function downgrade(fps) {
    degradeStep++;
    switch (degradeStep) {
      case 1:
        if (postfx) { postfx.dispose(); postfx = null; break; }
        degradeStep++; // sem bloom para cortar: cai para o próximo degrau
        // fallthrough
      case 2:
        dprCap = Math.max(0.8, dprCap * 0.72);
        layout();
        break;
      case 3:
        heroField.setDensity(0.45);
        branches.halos.forEach((h) => { if (h) h.visible = false; });
        break;
      case 4:
        if (ambientField) {
          ambientField.setOpacity(0);
          ambientField.points.visible = false;
          document.documentElement.classList.remove('gl-ambient');
        }
        heroField.setDensity(0.2);
        break;
      default:
        return false; // fim dos degraus: para de medir
    }
    if (import.meta.env?.DEV) console.info(`[vitanova] degradação nível ${degradeStep} (${fps.toFixed(0)}fps)`);
    return true;
  }

  // -------------------------------------------------------------------------
  // ciclo de vida
  // -------------------------------------------------------------------------
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); requestRender(); }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  const onVisibility = () => {
    if (document.hidden) stop();
    else if (!reduced) start();
    else requestRender();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onContextLost = (e) => {
    e.preventDefault();
    stop();
    document.documentElement.classList.remove('gl', 'gl-ambient');
  };
  const onContextRestored = () => {
    document.documentElement.classList.add('gl');
    if (ambientField) document.documentElement.classList.add('gl-ambient');
    layout();
    if (reduced) requestRender(); else start();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  // o documento muda de altura quando as fontes carregam
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (!disposed) { labels.measure(); measureDocument(); requestRender(); } });
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { measureDocument(); }) : null;
  if (ro) ro.observe(document.body);

  // -------------------------------------------------------------------------
  // boot
  // -------------------------------------------------------------------------
  layout();
  document.documentElement.classList.add('gl');

  if (reduced) {
    // sem animação contínua: um quadro estático, já no estado final
    timeline.complete();
    state.intro = 1;
    state.fieldOpacity = 1;
    state.streamOpacity = 0;
    state.cameraZ = CAMERA_Z;
    for (let i = 0; i < 4; i++) state.labelOpacity[i] = 1;
    [0, 1, 2].forEach((i) => { state.nodeOpacity[i] = 1; branches.setBranchReveal(i, 1); branches.setNodeOpacity(i, 1); });
    requestRender();
  } else {
    enableBloom();
    start();
  }

  function dispose() {
    disposed = true;
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener('scroll', onScroll);
    if (finePointer) window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    ro?.disconnect();
    postfx?.dispose();
    core.dispose();
    branches.dispose();
    heroField.dispose();
    ambientField?.dispose();
    backdrop.dispose();
    renderer.dispose();
  }

  return { dispose, detection, get tier() { return preset.name; } };
}
