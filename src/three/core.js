import {
  Group, Mesh, IcosahedronGeometry, ShaderMaterial, Sprite, SpriteMaterial,
  AdditiveBlending, LineSegments, WireframeGeometry, LineBasicMaterial, Color,
} from 'three';
import { SIMPLEX_3D } from './shaders/noise.js';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';
import { damp } from '../lib/tween.js';

/**
 * O núcleo: a origem única da metáfora.
 *
 * Não é uma esfera — é uma massa orgânica que respira, deformada por simplex
 * noise no vertex shader (custo desprezível: alguns milhares de vértices),
 * com casca de fresnel aditiva e uma gaiola geodésica que gira devagar para
 * dar leitura de profundidade sem depender de pós-processamento.
 */
export class DopamineCore {
  constructor({ detail = 4, radius = 1 } = {}) {
    this.group = new Group();
    this.energy = 1;
    this._targetEnergy = 1;

    // ---- massa interna -------------------------------------------------
    this.uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.17 },
      uEnergy: { value: 1 },
      uDeep: { value: new Color(PALETTE.greenDeep) },
      uMid: { value: new Color(PALETTE.greenMid) },
      uHot: { value: new Color(PALETTE.green) },
    };

    this.blob = new Mesh(
      new IcosahedronGeometry(radius, detail),
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          ${SIMPLEX_3D}
          uniform float uTime;
          uniform float uAmp;
          varying vec3 vNormal;
          varying vec3 vView;
          varying float vNoise;

          void main(){
            float t = uTime * 0.30;
            float n1 = snoise(position * 1.30 + vec3(0.0, t, 0.0));
            float n2 = snoise(position * 2.85 - vec3(t * 0.8, 0.0, t * 0.45));
            float n = n1 * 0.68 + n2 * 0.32;
            vNoise = n;

            vec3 displaced = position * (1.0 + n * uAmp);
            // normal aproximada: barata e visualmente suficiente nesta escala
            vec3 nrm = normalize(normal + n * 0.30);

            vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
            vNormal = normalize(normalMatrix * nrm);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uDeep;
          uniform vec3 uMid;
          uniform vec3 uHot;
          uniform float uTime;
          uniform float uEnergy;
          varying vec3 vNormal;
          varying vec3 vView;
          varying float vNoise;

          void main(){
            float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.1);

            // centro escuro -> borda quente: é o contraste que faz a massa
            // ler como volume em vez de disco chapado
            vec3 col = mix(uDeep * 0.55, uMid, smoothstep(-0.7, 0.9, vNoise));
            col *= 0.35 + 0.65 * fres;
            col = mix(col, uHot, pow(fres, 1.6) * 0.9);
            col += uHot * pow(fres, 5.0) * 2.2 * uEnergy;

            // "veias" de energia percorrendo a massa
            float veins = smoothstep(0.62, 0.98, sin(vNoise * 6.5 + uTime * 1.5) * 0.5 + 0.5);
            col += uHot * veins * 0.20 * uEnergy;

            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      })
    );
    this.group.add(this.blob);

    // ---- casca de fresnel (halo volumétrico barato) ---------------------
    this.shellUniforms = {
      uColor: { value: new Color(PALETTE.green) },
      uStrength: { value: 1 },
    };
    this.shell = new Mesh(
      new IcosahedronGeometry(radius * 1.34, Math.max(2, detail - 1)),
      new ShaderMaterial({
        uniforms: this.shellUniforms,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uStrength;
          varying vec3 vNormal;
          varying vec3 vView;
          void main(){
            float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
            gl_FragColor = vec4(uColor * f * 1.5 * uStrength, f * uStrength);
            #include <colorspace_fragment>
          }
        `,
      })
    );
    this.group.add(this.shell);

    // ---- gaiola geodésica ----------------------------------------------
    this.cage = new LineSegments(
      new WireframeGeometry(new IcosahedronGeometry(radius * 1.85, 1)),
      new LineBasicMaterial({
        color: new Color(PALETTE.green),
        transparent: true,
        opacity: 0.13,
        blending: AdditiveBlending,
        depthWrite: false,
      })
    );
    this.group.add(this.cage);

    // ---- glow de fundo --------------------------------------------------
    this.glow = new Sprite(
      new SpriteMaterial({
        map: glowTexture([157, 219, 106], { falloff: 2.6 }),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        opacity: 0.42,
      })
    );
    this.glow.scale.setScalar(radius * 5.8);
    this.glow.renderOrder = -10;
    this.group.add(this.glow);

    this.setIntro(0);
  }

  /** 0 = ausente, 1 = presente. Usado pela timeline de abertura. */
  setIntro(t) {
    this._intro = t;
    const s = Math.max(0.0001, t);
    this.blob.scale.setScalar(s);
    this.shell.scale.setScalar(s);
    this.cage.scale.setScalar(s);
    this.glow.material.opacity = 0.42 * t;
    this.shellUniforms.uStrength.value = t;
    this.cage.material.opacity = 0.13 * t;
  }

  /** Impulso de energia — disparado quando um pulso sai pelas ramificações. */
  pulse(amount = 0.9) {
    this._targetEnergy = 1 + amount;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;

    this._targetEnergy = damp(this._targetEnergy, 1, 2.6, dt);
    this.energy = damp(this.energy, this._targetEnergy, 9, dt);
    this.uniforms.uEnergy.value = this.energy;

    // respiração lenta + rotação da gaiola em eixo diferente da massa
    const intro = this._intro;
    const breathe = 1 + Math.sin(time * 0.85) * 0.022 + (this.energy - 1) * 0.05;
    const s = Math.max(0.0001, intro * breathe);
    this.blob.scale.setScalar(s);
    this.shell.scale.setScalar(s);
    this.cage.scale.setScalar(Math.max(0.0001, intro));
    this.glow.material.opacity = (0.40 + (this.energy - 1) * 0.30) * intro;

    this.cage.rotation.y += dt * 0.10;
    this.cage.rotation.x += dt * 0.045;
    this.blob.rotation.y -= dt * 0.06;
  }

  dispose() {
    [this.blob, this.shell, this.cage].forEach((m) => {
      m.geometry.dispose();
      m.material.dispose();
    });
    this.glow.material.dispose();
  }
}
