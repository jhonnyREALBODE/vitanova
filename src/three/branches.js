import {
  Group, Mesh, Points, BufferGeometry, BufferAttribute, TubeGeometry,
  CatmullRomCurve3, Vector3, ShaderMaterial, MeshBasicMaterial, SphereGeometry,
  RingGeometry, Sprite, SpriteMaterial, AdditiveBlending, DoubleSide, Color,
} from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';
import { clamp } from '../lib/tween.js';

const ORIGIN = new Vector3(0, 0, 0);

/**
 * As três ramificações: uma origem, três destinos nomeados.
 *
 * Cada ramo é composto de quatro camadas que se somam:
 *   1. tubo afunilado (grosso na origem, fino no sintoma) com pulso viajando;
 *   2. halo do mesmo caminho, mais largo e fraco, que dá o "volume" do glow;
 *   3. fluxo de partículas percorrendo o caminho (a dopamina em trânsito);
 *   4. nó terminal com anel de pulso expandindo.
 *
 * A geometria é reconstruída quando a composição muda (desktop <-> mobile);
 * fora disso, o custo por frame é só o avanço das partículas na CPU.
 */
export class Branches {
  constructor({ segments = 96, radial = 10, streamCount = 168, halo = true } = {}) {
    this.opts = { segments, radial, streamCount, halo };
    this.group = new Group();
    this.curves = [];
    this.samples = [];        // polilinhas pré-amostradas (evita getPointAt por frame)
    this.nodePositions = [];
    this.defs = [];

    this.tubes = [];
    this.halos = [];
    this.nodes = [];
    this._reveal = [0, 0, 0];

    this.SAMPLES = 96;

    this._buildStream();
  }

  // -------------------------------------------------------------------------
  // construção
  // -------------------------------------------------------------------------

  /** @param {{position:Vector3, color:number}[]} defs */
  setEndpoints(defs) {
    this.defs = defs;
    this._disposePaths();

    this.curves = defs.map((def, i) => makeCurve(def.position, i));
    this.samples = this.curves.map((curve) => {
      const pts = [];
      for (let s = 0; s <= this.SAMPLES; s++) pts.push(curve.getPointAt(s / this.SAMPLES));
      return pts;
    });
    this.nodePositions = defs.map((d) => d.position.clone());

    this.curves.forEach((curve, i) => {
      const color = new Color(defs[i].color);
      this._buildTube(curve, color, i);
      this._buildNode(defs[i].position, color, i);
    });

    this._resetStreamColors();
    this.setBranchReveal(0, this._reveal[0]);
    this.setBranchReveal(1, this._reveal[1]);
    this.setBranchReveal(2, this._reveal[2]);
  }

  _buildTube(curve, color, i) {
    const { segments, radial, halo } = this.opts;

    const geo = taperedTube(curve, segments, 0.085, radial, (u) => 1 - 0.62 * u * u);
    const uniforms = {
      uTime: { value: 0 },
      uColor: { value: color },
      uReveal: { value: 0 },
      uSpeed: { value: 0.34 + i * 0.045 },
      uOpacity: { value: 1 },
    };
    const mat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: TUBE_VERT,
      fragmentShader: TUBE_FRAG,
    });
    const mesh = new Mesh(geo, mat);
    this.group.add(mesh);
    this.tubes[i] = mesh;

    if (halo) {
      const hGeo = taperedTube(curve, Math.max(24, segments >> 1), 0.30, 6, (u) => 1 - 0.70 * u);
      const hMat = new ShaderMaterial({
        uniforms: {
          uTime: uniforms.uTime,
          uColor: { value: color },
          uReveal: uniforms.uReveal,
          uSpeed: uniforms.uSpeed,
          uOpacity: { value: 0.14 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: TUBE_VERT,
        fragmentShader: TUBE_FRAG,
      });
      const hMesh = new Mesh(hGeo, hMat);
      hMesh.renderOrder = -1;
      this.group.add(hMesh);
      this.halos[i] = hMesh;
    }
  }

  _buildNode(pos, color, i) {
    const node = new Group();
    node.position.copy(pos);

    const bulb = new Mesh(
      new SphereGeometry(0.085, 16, 12),
      new MeshBasicMaterial({ color: new Color(PALETTE.dark3) })
    );
    node.add(bulb);

    const rim = new Mesh(
      new RingGeometry(0.085, 0.108, 32),
      new MeshBasicMaterial({
        color, transparent: true, opacity: 1, side: DoubleSide,
        blending: AdditiveBlending, depthWrite: false,
      })
    );
    node.add(rim);

    const glow = new Sprite(new SpriteMaterial({
      map: glowTexture(colorBytes(color), { falloff: 2.4 }),
      transparent: true, depthWrite: false, depthTest: false,
      blending: AdditiveBlending, opacity: 0.75,
    }));
    glow.scale.setScalar(1.15);
    glow.renderOrder = -5;
    node.add(glow);

    const pulseRing = new Mesh(
      new RingGeometry(0.09, 0.115, 32),
      new MeshBasicMaterial({
        color, transparent: true, opacity: 0, side: DoubleSide,
        blending: AdditiveBlending, depthWrite: false,
      })
    );
    node.add(pulseRing);

    node.userData = { rim, glow, pulseRing, bulb, phase: i * 0.9, opacity: 0 };
    node.scale.setScalar(0.0001);
    this.group.add(node);
    this.nodes[i] = node;
  }

  /** Buffer único de partículas para os três ramos (1 draw call). */
  _buildStream() {
    const n = this.opts.streamCount;
    if (!n) { this.stream = null; return; }

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const alphas = new Float32Array(n);
    const sizes = new Float32Array(n);

    this._particles = [];
    for (let i = 0; i < n; i++) {
      this._particles.push({
        branch: i % 3,
        t: Math.random(),
        speed: 0.10 + Math.random() * 0.13,
        jitter: (Math.random() - 0.5) * 0.10,
        size: 3.2 + Math.random() * 4.6,
      });
      sizes[i] = this._particles[i].size;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3).setUsage(35048 /* DynamicDraw */));
    geo.setAttribute('aColor', new BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new BufferAttribute(alphas, 1).setUsage(35048));
    geo.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geo.setDrawRange(0, n);

    this.stream = new Points(geo, new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uMaster: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (9.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uMaster;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, a * vAlpha * uMaster);
          #include <colorspace_fragment>
        }
      `,
    }));
    this.stream.frustumCulled = false;
    this.group.add(this.stream);
  }

  _resetStreamColors() {
    if (!this.stream || !this.defs.length) return;
    const colors = this.stream.geometry.attributes.aColor;
    const branchColors = this.defs.map((d) => new Color(d.color));
    for (let i = 0; i < this._particles.length; i++) {
      const col = branchColors[this._particles[i].branch];
      colors.setXYZ(i, col.r, col.g, col.b);
    }
    colors.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // estado de animação
  // -------------------------------------------------------------------------

  setBranchReveal(i, v) {
    this._reveal[i] = v;
    const tube = this.tubes[i];
    if (tube) tube.material.uniforms.uReveal.value = v;
    // o halo compartilha o uniform de reveal com o tubo
  }

  setNodeOpacity(i, v) {
    const node = this.nodes[i];
    if (!node) return;
    node.userData.opacity = v;
    node.scale.setScalar(Math.max(0.0001, 0.6 + v * 0.4));
    node.userData.rim.material.opacity = v;
    node.userData.glow.material.opacity = 0.75 * v;
    node.visible = v > 0.001;
  }

  setStreamOpacity(v) {
    if (this.stream) this.stream.material.uniforms.uMaster.value = v;
  }

  setPixelRatio(r) {
    if (this.stream) this.stream.material.uniforms.uPixelRatio.value = r;
  }

  update(dt, time) {
    for (const tube of this.tubes) if (tube) tube.material.uniforms.uTime.value = time;

    // nós: anel de pulso expandindo, defasado por ramo
    for (const node of this.nodes) {
      if (!node || !node.visible) continue;
      const { pulseRing, phase, opacity } = node.userData;
      const local = (time * 0.42 + phase) % 2.6;
      const p = clamp(local / 1.5);
      if (p >= 1) {
        pulseRing.material.opacity = 0;
      } else {
        pulseRing.scale.setScalar(1 + p * 6.5);
        pulseRing.material.opacity = (1 - p) * 0.5 * opacity;
      }
    }

    this._updateStream(dt);
  }

  _updateStream(dt) {
    if (!this.stream || !this.samples.length) return;
    const geo = this.stream.geometry;
    const pos = geo.attributes.position;
    const alpha = geo.attributes.aAlpha;
    const arr = pos.array;

    for (let i = 0; i < this._particles.length; i++) {
      const pt = this._particles[i];
      pt.t += pt.speed * dt;
      pt.t -= Math.floor(pt.t); // envolve em [0,1) mesmo com dt anômalo

      const reveal = this._reveal[pt.branch];
      const samples = this.samples[pt.branch];
      if (!samples) continue;

      // a partícula só existe dentro do trecho já revelado do ramo
      const t = pt.t;
      const visible = t < reveal ? 1 : 0;

      const f = t * this.SAMPLES;
      const i0 = Math.min(this.SAMPLES, Math.max(0, Math.floor(f)));
      const i1 = Math.min(this.SAMPLES, i0 + 1);
      const k = f - i0;
      const a = samples[i0];
      const b = samples[i1];

      const o = i * 3;
      arr[o] = a.x + (b.x - a.x) * k;
      arr[o + 1] = a.y + (b.y - a.y) * k + pt.jitter * Math.sin(t * 9.0);
      arr[o + 2] = a.z + (b.z - a.z) * k + pt.jitter;

      // some perto do núcleo e perto do nó, para o fluxo não "nascer" cortado
      alpha.array[i] = visible * Math.min(1, Math.sin(Math.PI * Math.min(1, t)) * 1.9);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  _disposePaths() {
    const kill = (m) => {
      if (!m) return;
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    };
    this.tubes.forEach(kill);
    this.halos.forEach(kill);
    this.nodes.forEach((node) => {
      if (!node) return;
      this.group.remove(node);
      node.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    });
    this.tubes = [];
    this.halos = [];
    this.nodes = [];
  }

  dispose() {
    this._disposePaths();
    if (this.stream) {
      this.group.remove(this.stream);
      this.stream.geometry.dispose();
      this.stream.material.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Curva orgânica origem → sintoma, com desvio lateral e em profundidade. */
function makeCurve(endpoint, i) {
  const dir = endpoint.clone().normalize();
  const perp = new Vector3(-dir.y, dir.x, 0).normalize();
  const s = i % 2 === 0 ? 1 : -1;

  const c1 = endpoint.clone().multiplyScalar(0.26)
    .addScaledVector(perp, 0.42 * s)
    .add(new Vector3(0, 0, 0.55 * s));
  const c2 = endpoint.clone().multiplyScalar(0.66)
    .addScaledVector(perp, -0.34 * s)
    .add(new Vector3(0, 0, -0.40 * s));

  return new CatmullRomCurve3([ORIGIN.clone(), c1, c2, endpoint.clone()], false, 'catmullrom', 0.5);
}

/**
 * TubeGeometry com raio variável — `TubeGeometry` só aceita raio constante,
 * então encolhemos cada anel em direção ao seu centro depois de gerada.
 * Roda uma vez por mudança de layout, não por frame.
 */
function taperedTube(curve, tubularSegments, radius, radialSegments, taper) {
  const geo = new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const pos = geo.attributes.position;
  const perRing = radialSegments + 1;

  const centers = [];
  for (let i = 0; i <= tubularSegments; i++) centers.push(curve.getPointAt(i / tubularSegments));

  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.min(tubularSegments, Math.floor(i / perRing));
    const center = centers[ring];
    const k = taper(ring / tubularSegments);
    v.fromBufferAttribute(pos, i).sub(center).multiplyScalar(k).add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const colorBytes = (color) => [
  Math.round(Math.pow(color.r, 1 / 2.2) * 255),
  Math.round(Math.pow(color.g, 1 / 2.2) * 255),
  Math.round(Math.pow(color.b, 1 / 2.2) * 255),
];

const TUBE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec3 view = normalize(-mv.xyz);
    vRim = pow(1.0 - abs(dot(n, view)), 1.6);
    gl_Position = projectionMatrix * mv;
  }
`;

const TUBE_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uSpeed;
  uniform float uOpacity;

  void main(){
    // desenho progressivo: só existe o trecho já "percorrido"
    float drawn = 1.0 - smoothstep(uReveal - 0.05, uReveal, vUv.x);
    if (drawn <= 0.001) discard;

    // ponta luminosa acompanhando a frente do desenho
    float tip = exp(-abs(vUv.x - uReveal) * 55.0) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));

    float base = 0.13 + vRim * 0.16;
    float band = fract(vUv.x * 1.5 - uTime * uSpeed);
    float pulse = smoothstep(0.0, 0.09, band) * smoothstep(0.30, 0.09, band);

    float a = (base + pulse * 1.35 + tip * 1.8) * drawn * uOpacity;
    vec3 col = uColor * (0.75 + pulse * 1.25 + tip * 2.2);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;
