import {
  Points, BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending, Color,
} from 'three';

/**
 * Campo de poeira luminosa.
 *
 * Tudo é animado no vertex shader a partir de sementes por partícula: os
 * buffers são estáticos e nunca voltam para a CPU. É o que permite manter
 * milhares de pontos com custo praticamente zero de JavaScript — e é o
 * primeiro recurso a ser cortado quando o PerfMonitor pede degradação.
 */
export class ParticleField {
  constructor({
    count = 1600,
    extent = [26, 15, 12],
    depth = -3,
    color = 0x9dc97a,
    accent = 0xf5f2e4,
    accentRatio = 0.18,
    size = [1.2, 4.0],
    drift = 0.45,
    speed = 1,
    opacity = 0.55,
    near = 4,
    far = 26,
  } = {}) {
    this.maxCount = count;

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const tints = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * extent[0];
      positions[i * 3 + 1] = (Math.random() - 0.5) * extent[1];
      positions[i * 3 + 2] = (Math.random() - 0.5) * extent[2] + depth;

      seeds[i * 3] = 0.4 + Math.random() * 1.4;
      seeds[i * 3 + 1] = 0.4 + Math.random() * 1.4;
      seeds[i * 3 + 2] = Math.random();

      sizes[i] = size[0] + Math.random() * (size[1] - size[0]);
      tints[i] = Math.random() < accentRatio ? 1 : 0;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 3));
    geo.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geo.setAttribute('aTint', new BufferAttribute(tints, 1));
    geo.setDrawRange(0, count);

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uDrift: { value: drift },
        uSpeed: { value: speed },
        uOpacity: { value: opacity },
        uColor: { value: new Color(color) },
        uAccent: { value: new Color(accent) },
        uNear: { value: near },
        uFar: { value: far },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        attribute float aSize;
        attribute float aTint;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uDrift;
        uniform float uSpeed;
        uniform float uNear;
        uniform float uFar;
        varying float vFade;
        varying float vTint;
        varying float vTwinkle;

        void main(){
          float t = uTime * uSpeed;
          vec3 p = position;
          p.x += sin(t * aSeed.x * 0.32 + aSeed.z * 6.2831) * uDrift;
          p.y += cos(t * aSeed.y * 0.27 + aSeed.x * 6.2831) * uDrift;
          p.z += sin(t * aSeed.z * 0.21 + aSeed.y * 6.2831) * uDrift * 0.6;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;

          // some no fundo (profundidade) e bem na frente da câmera
          vFade = smoothstep(uFar, uFar * 0.45, dist) * smoothstep(uNear * 0.4, uNear, dist);
          vTint = aTint;
          vTwinkle = 0.62 + 0.38 * sin(t * (0.8 + aSeed.z * 1.6) + aSeed.x * 12.0);

          gl_PointSize = aSize * uPixelRatio * (10.0 / max(0.001, dist));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uOpacity;
        varying float vFade;
        varying float vTint;
        varying float vTwinkle;

        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.06, d);
          vec3 col = mix(uColor, uAccent, vTint);
          gl_FragColor = vec4(col, a * vFade * vTwinkle * uOpacity);
          #include <colorspace_fragment>
        }
      `,
    });

    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  setPixelRatio(r) { this.material.uniforms.uPixelRatio.value = r; }

  setOpacity(v) {
    this.material.uniforms.uOpacity.value = v;
    this.points.visible = v > 0.002;
  }

  /** Reduz a densidade sem realocar buffers (usado na degradação em tempo real). */
  setDensity(ratio) {
    const n = Math.max(1, Math.floor(this.maxCount * ratio));
    this.points.geometry.setDrawRange(0, n);
  }

  update(_dt, time) { this.material.uniforms.uTime.value = time; }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
