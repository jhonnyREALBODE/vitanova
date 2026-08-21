import { Mesh, PlaneGeometry, ShaderMaterial, Color, Vector2 } from 'three';
import { SIMPLEX_3D, DITHER } from './shaders/noise.js';
import { BACKDROP } from './palette.js';
import { damp } from '../lib/tween.js';

/**
 * Fundo em clip-space (um quad que sempre cobre a tela inteira).
 * Substitui o `radial-gradient` do CSS quando o WebGL está ativo, e faz
 * crossfade entre a paleta do hero e a da seção "Como funciona" — é o que
 * permite usar UM único canvas fixo para as duas regiões da página.
 */
export class Backdrop {
  constructor({ rich = true } = {}) {
    const preset = BACKDROP.hero;

    this.material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: {
        uInner: { value: preset.inner.clone() },
        uMid: { value: preset.mid.clone() },
        uOuter: { value: preset.outer.clone() },
        uCenter: { value: new Vector2(...preset.center) },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          // quad de tela cheia, independente da câmera
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uInner;
        uniform vec3 uMid;
        uniform vec3 uOuter;
        uniform vec2 uCenter;
        uniform float uAspect;
        uniform float uTime;
        uniform float uIntensity;
        ${rich ? SIMPLEX_3D : ''}
        ${DITHER}

        void main(){
          vec2 p = vUv - uCenter;
          p.x *= uAspect;
          float d = length(p) * 1.18;

          vec3 col = mix(uInner, uMid, smoothstep(0.0, 0.52, d));
          col = mix(col, uOuter, smoothstep(0.42, 1.02, d));

          ${rich ? `
          // nebulosa muito lenta, amplitude baixa: dá volume sem chamar atenção
          float n = snoise(vec3(vUv * 2.1, uTime * 0.025));
          col += vec3(0.030, 0.052, 0.018) * n;
          ` : ''}

          // vinheta: empurra o olho para o centro da composição
          col *= 1.0 - 0.34 * smoothstep(0.5, 1.3, d);
          col *= uIntensity;

          // dither de 1 LSB — sem isso o gradiente escuro faz banding em OLED
          col += (dither8(gl_FragCoord.xy) - 0.5) * 0.0045;

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;

    this._target = {
      inner: preset.inner.clone(),
      mid: preset.mid.clone(),
      outer: preset.outer.clone(),
      center: new Vector2(...preset.center),
      intensity: preset.intensity,
    };
  }

  /** @param {'hero'|'format'} key */
  setRegion(key) {
    const p = BACKDROP[key] || BACKDROP.hero;
    this._target.inner.copy(p.inner);
    this._target.mid.copy(p.mid);
    this._target.outer.copy(p.outer);
    this._target.center.set(p.center[0], p.center[1]);
    this._target.intensity = p.intensity;
  }

  /** Recentra o gradiente conforme a composição (desktop x mobile). */
  setCenter(x, y) {
    this._target.center.set(x, y);
  }

  setSize(width, height) {
    this.material.uniforms.uAspect.value = width / Math.max(1, height);
  }

  update(dt, time) {
    const u = this.material.uniforms;
    u.uTime.value = time;

    const k = 4.5;
    dampColor(u.uInner.value, this._target.inner, k, dt);
    dampColor(u.uMid.value, this._target.mid, k, dt);
    dampColor(u.uOuter.value, this._target.outer, k, dt);
    u.uCenter.value.x = damp(u.uCenter.value.x, this._target.center.x, k, dt);
    u.uCenter.value.y = damp(u.uCenter.value.y, this._target.center.y, k, dt);
    u.uIntensity.value = damp(u.uIntensity.value, this._target.intensity, k, dt);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

const dampColor = (/** @type {Color} */ cur, /** @type {Color} */ tgt, k, dt) => {
  cur.r = damp(cur.r, tgt.r, k, dt);
  cur.g = damp(cur.g, tgt.g, k, dt);
  cur.b = damp(cur.b, tgt.b, k, dt);
};
