// Showroom 3D + coreografia da scooter controlada pelo scroll.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildScooter, WHEEL_R } from './scooter.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- linha do tempo (progresso 0..1 da seção pinada) ---------- */

// distância percorrida pela scooter (m)
export function driveDistance(p) {
  const creep = 0.35 * sstep(0.56, 0.66, p);
  const t = clamp01((p - 0.64) / 0.34);
  return creep + 46 * Math.pow(t, 2.2);
}

const KEYS = [
  { p: 0.0, pos: [3.0, 0.62, 3.6], tgt: [0.05, 0.86, 0], fov: 34, sx: 0.17, sy: 0.0 },
  { p: 0.12, pos: [2.3, 0.7, 3.85], tgt: [0.0, 0.8, 0], fov: 34, sx: 0.14, sy: 0.0 },
  { p: 0.28, pos: [0.3, 0.86, 4.6], tgt: [-0.12, 0.6, 0], fov: 32, sx: 0.2, sy: 0.0 },
  { p: 0.46, pos: [-0.4, 0.8, 3.25], tgt: [-0.15, 0.55, 0], fov: 34, sx: 0.0, sy: 0.0 },
  { p: 0.58, pos: [-2.7, 0.95, 2.5], tgt: [0.4, 0.62, 0], fov: 38, sx: 0.0, sy: 0.0 },
  { p: 0.68, pos: [-3.3, 0.85, 1.35], tgt: [2.6, 0.7, 0], fov: 38, sx: 0.0, sy: 0.0 },
];

function keySegment(p) {
  const n = KEYS.length;
  if (p <= KEYS[0].p) return { i: 0, t: 0, u: 0 };
  for (let i = 0; i < n - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (p <= b.p) {
      let t = (p - a.p) / (b.p - a.p);
      t = lerp(t, t * t * (3 - 2 * t), 0.6);
      return { i, t, u: (i + t) / (n - 1) };
    }
  }
  return { i: n - 2, t: 1, u: 1 };
}

/* ---------- utilidades de cena ---------- */

function hexEdges(R, x0, x1, z0, z1) {
  const edges = [];
  const seen = new Set();
  const w = 1.5 * R;
  const h = Math.sqrt(3) * R;
  for (let q = Math.floor(x0 / w) - 1; q <= Math.ceil(x1 / w) + 1; q++) {
    for (let r = Math.floor(z0 / h) - 2; r <= Math.ceil(z1 / h) + 2; r++) {
      const cx = q * w;
      const cz = (r + (q & 1) * 0.5) * h;
      if (cx - R < x0 || cx + R > x1 || cz - h / 2 < z0 || cz + h / 2 > z1) continue;
      for (let k = 0; k < 6; k++) {
        const a0 = (k * Math.PI) / 3;
        const a1 = ((k + 1) * Math.PI) / 3;
        const ax = cx + R * Math.cos(a0);
        const az = cz + R * Math.sin(a0);
        const bx = cx + R * Math.cos(a1);
        const bz = cz + R * Math.sin(a1);
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const key = `${Math.round(mx * 200)}_${Math.round(mz * 200)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ x: mx, z: mz, angle: Math.atan2(bz - az, bx - ax) });
      }
    }
  }
  return edges;
}

function hexInstanced(edges, R, y, material, thick = 0.035) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, material, edges.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(R * 0.86, thick * 0.7, thick);
  const p = new THREE.Vector3();
  edges.forEach((e, i) => {
    p.set(e.x, y, e.z);
    q.setFromAxisAngle(Y, -e.angle);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#1e1e23';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#030304');
  const lm = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide });
  const R = 0.55;
  env.add(hexInstanced(hexEdges(R, -8, 8, -6, 6), R, 2.1, lm(5, 5, 4.7), 0.06));
  const soft = (w, h, col, pos) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), col);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  soft(6, 1.6, lm(2.6, 2.5, 2.35), [1.5, 1.4, 4.5]); // softbox frontal
  soft(5, 1.2, lm(3.0, 2.0, 1.0), [-3.5, 0.6, -4]); // contra-luz dourada
  soft(4, 1.0, lm(1.2, 1.6, 2.4), [4.5, 0.4, -3]); // contra-luz fria
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), lm(0.025, 0.025, 0.03));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.6;
  env.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.015, 0.1, 60);
  pmrem.dispose();
  return rt.texture;
}

/* ---------- cena ---------- */

export function createScene(canvas, opts = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const lowPower = coarse || weak || Math.min(screen.width, screen.height) < 600;
  // modo leve (celular / máquina modesta): sem reflexo, sem bloom, sem luzes de área
  const lite = lowPower || (import.meta.env.DEV && location.search.includes('lite'));
  const reduced =
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (import.meta.env.DEV && location.search.includes('nointro'));

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: lite,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const BASE_DPR = Math.min(window.devicePixelRatio || 1, lowPower ? 1.0 : 1.5);
  const QUALITY = [1, 0.8, 0.62, 0.5];
  let qLevel = Number(sessionStorage.getItem('gm-q') || 0) || 0;
  let slowT = 0;
  let DPR = BASE_DPR;
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  if (!lite) RectAreaLightUniformsLib.init();
  renderer.debug.onShaderError = () => opts.onFail && opts.onFail();

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#060607');
  scene.background = BG;
  scene.fog = new THREE.FogExp2(BG, 0.048);
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.12, 90);

  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => (lite ? opts.onFail && opts.onFail() : location.reload()));

  /* piso espelhado */
  const FLOOR_W = 150;
  const FLOOR_D = 44;
  const reflector = lite ? null : new Reflector(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D), {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    color: 0x777777,
    multisample: 0,
  });
  if (reflector) {
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(20, 0, 0);
    scene.add(reflector);
  }

  const tiles = tileTexture();
  tiles.repeat.set(FLOOR_W / 1.2, FLOOR_D / 1.2);
  const floorTop = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_W, FLOOR_D),
    new THREE.MeshStandardMaterial({
      map: tiles,
      color: lite ? 0x4a4a4a : 0xffffff,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0.08,
      transparent: !lite,
      opacity: lite ? 1 : 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  floorTop.rotation.x = -Math.PI / 2;
  floorTop.position.set(20, 0.003, 0);
  floorTop.renderOrder = 1;
  scene.add(floorTop);

  /* teto de hexágonos (assinatura da loja): 1 plano, linhas com antialias analítico */
  const CEIL_Y = 2.85;
  const LIGHT = new THREE.Color(1.2, 1.17, 1.1);
  const ceilMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: lite ? LIGHT.clone().multiplyScalar(0.72) : LIGHT },
      uFog: { value: 0.048 },
      uCell: { value: 0.95 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vV;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vV = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uFog; uniform float uCell;
      varying vec3 vW; varying vec3 vV;
      float hexD(vec2 p){ p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
      void main(){
        vec2 uv = vW.xz / uCell * vec2(1.0, 1.0);
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        vec2 id = uv - gv;
        float edge = 0.5 - hexD(gv);          // distância até a borda (em células)
        float fw = max(fwidth(edge) * 1.2, 0.0005);   // nunca 0: smoothstep(a,a,x) gera NaN e o bloom apaga a tela
        float tw = 0.022;                      // meia espessura da linha
        float w = max(tw, fw * 0.8);           // nunca mais fina que ~1px
        float line = 1.0 - smoothstep(w - fw, w + fw, edge);
        line *= min(1.0, tw / w);              // conserva a energia (some suave ao longe)
        float hsh = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float delay = 0.2 + length(id * uCell - vec2(0.5, 0.0)) * 0.07 + hsh * 0.12;
        float on = clamp((uTime - delay) / 0.45, 0.0, 1.0);
        on = on * on * (3.0 - 2.0 * on);
        float fog = exp(-uFog * uFog * dot(vV, vV));
        vec3 c = uColor * line * on * fog;
        c = clamp(c, 0.0, 4.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(150, 44), ceilMat);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(20, CEIL_Y, 0);
  ceiling.renderOrder = 5;
  scene.add(ceiling);

  /* scooter */
  const scooter = buildScooter();
  scene.add(scooter.root);
  const paint = scooter.mats.paint;
  const targetPaint = paint.color.clone();

  /* sombras de contato (blobs) */
  const blobTex = radialTexture([
    [0, 'rgba(0,0,0,0.92)'],
    [0.45, 'rgba(0,0,0,0.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  const blobMat = (o) =>
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: o, fog: true });
  const blobs = new THREE.Group();
  const blobBody = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat(0.85));
  blobBody.scale.set(2.7, 0.85, 1);
  blobBody.position.set(0.0, 0.004, 0);
  const blobRear = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat(1));
  blobRear.scale.set(0.42, 0.22, 1);
  blobRear.position.set(-0.62, 0.005, 0);
  const blobFront = blobRear.clone();
  blobFront.material = blobMat(1);
  blobFront.position.x = 0.7;
  for (const b of [blobBody, blobRear, blobFront]) {
    b.rotation.x = -Math.PI / 2;
    blobs.add(b);
  }
  blobs.traverse((o) => (o.renderOrder = 2));
  scene.add(blobs);

  /* iluminação (acompanha a scooter) */
  const rig = new THREE.Group();
  scene.add(rig);
  rig.add(new THREE.HemisphereLight('#aab6cc', '#0b0907', 0.12));
  const keyTarget = new THREE.Object3D();
  keyTarget.position.set(0, 0.5, 0);
  rig.add(keyTarget);
  const key = new THREE.SpotLight('#fff1dc', 16, 0, 0.42, 0.9, 2);
  key.position.set(1.0, 5.2, 3.0);
  key.target = keyTarget;
  rig.add(key);
  if (lite) {
    const dir = (color, intensity, x, y, z) => {
      const d = new THREE.DirectionalLight(color, intensity);
      d.position.set(x, y, z);
      d.target = keyTarget;
      rig.add(d);
    };
    dir('#ffe4bd', 1.6, -2.6, 1.6, -2.3);
    dir('#b7cdff', 1.1, 2.8, 1.4, -2.4);
    dir('#ffffff', 0.5, 0.6, 1.7, 4.2);
  } else {
    const rimWarm = new THREE.RectAreaLight('#ffe4bd', 3.5, 3.4, 1.0);
    rimWarm.position.set(-2.6, 1.3, -2.3);
    rimWarm.lookAt(0, 0.6, 0);
    rig.add(rimWarm);
    const rimCool = new THREE.RectAreaLight('#b7cdff', 2.4, 3.2, 1.0);
    rimCool.position.set(2.8, 1.1, -2.4);
    rimCool.lookAt(0, 0.6, 0);
    rig.add(rimCool);
    const fill = new THREE.RectAreaLight('#ffffff', 0.7, 4, 1.4);
    fill.position.set(0.6, 1.7, 4.2);
    fill.lookAt(0, 0.6, 0);
    rig.add(fill);
  }

  /* farol: luz + feixe */
  const headSpot = new THREE.SpotLight('#eef4ff', 0, 16, 0.42, 0.6, 1.4);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(5, -1.0, 0);
  scooter.headlight.add(headSpot, headTarget);
  headSpot.target = headTarget;

  const beamGeo = new THREE.ConeGeometry(0.85, 4.2, 48, 1, true);
  beamGeo.translate(0, -2.1, 0);
  beamGeo.rotateZ(Math.PI / 2 - 0.09);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color(1.0, 1.05, 1.15) } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI; uniform vec3 uC;
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){
        float d = abs(dot(normalize(vN + vec3(1e-5)), normalize(vV + vec3(1e-5))));
        float edge = d * d;
        float h = clamp(vH, 0.0, 1.0);
        float a = edge * h * h * sqrt(h) * uI;
        gl_FragColor = vec4(uC, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.x = 0.03;
  beam.renderOrder = 6;
  scooter.headlight.add(beam);

  /* rastro da lanterna */
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color(3.2, 0.18, 0.22) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uI; uniform vec3 uC; varying vec2 vUv;
      void main(){
        float along = pow(vUv.x, 2.0);
        float across = pow(max(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0), 1.5);
        gl_FragColor = vec4(uC, along * across * uI);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const trail = new THREE.Group();
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  trailGeo.translate(-0.5, 0, 0);
  const t1 = new THREE.Mesh(trailGeo, trailMat);
  const t2 = new THREE.Mesh(trailGeo, trailMat);
  t2.rotation.x = Math.PI / 2;
  trail.add(t1, t2);
  trail.position.set(-1.09, 0.7, 0);
  trail.visible = false;
  t1.renderOrder = t2.renderOrder = 7;
  scooter.bike.add(trail);
  const tailGlow = new THREE.PointLight('#ff2a36', 0.25, 2.2, 2);
  tailGlow.position.set(-1.15, 0.62, 0);
  scooter.bike.add(tailGlow);

  /* riscos de velocidade */
  const STREAKS = 110;
  const streakMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 2.0, 1.7),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), streakMat, STREAKS);
  const streakPos = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STREAKS; i++) {
    let y;
    let z;
    do {
      y = 0.08 + rand() * 2.3;
      z = -3.8 + rand() * 7.6;
    } while (Math.abs(z) < 0.55 && y < 1.45);
    streakPos.push(new THREE.Vector3(-2 + rand() * 58, y, z));
  }
  streaks.visible = false;
  streaks.renderOrder = 8;
  streaks.frustumCulled = false;
  scene.add(streaks);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();

  /* pós-processamento */
  const rt = lite ? null : new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = lite ? null : new EffectComposer(renderer, rt);
  if (composer) composer.addPass(new RenderPass(scene, camera));
  // 1 pixel inválido (NaN/Inf) espalha pelo bloom e deixa a tela preta: zera antes
  composer?.addPass(
    new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
          c.rgb = clamp(c.rgb, vec3(0.0), vec3(24.0));
          gl_FragColor = vec4(c.rgb, 1.0);
        }`,
    }),
  );
  const bloom = lite ? { enabled: false } : new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 1.3);
  if (composer) {
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* curvas de câmera */
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.tgt)), false, 'centripetal');

  /* estado */
  let W = 1;
  let H = 1;
  let targetP = 0;
  let P = 0;
  let lastS = 0;
  let speed = 0;
  let introT = reduced ? 1 : 0;
  let clock = 0;
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  const off = new THREE.Vector3();

  function resize(w, h) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H, false);
    if (composer) {
      composer.setPixelRatio(DPR);
      composer.setSize(W, H);
    }
    const rs = lowPower ? 0.35 : 0.5;
    reflector?.getRenderTarget().setSize(Math.round(W * DPR * rs), Math.round(H * DPR * rs));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  function applyQuality() {
    DPR = BASE_DPR * QUALITY[qLevel];
    renderer.setPixelRatio(DPR);
    bloom.enabled = qLevel < 2;
    resize(W, H);
  }

  function setProgress(p) {
    targetP = clamp01(p);
  }

  function setColor(hex) {
    targetPaint.set(hex);
  }

  function updateCascade(t) {
    ceilMat.uniforms.uTime.value = t;
  }

  function update(dt) {
    clock += dt;
    introT = Math.min(1, introT + dt / 2.6);
    const intro = 1 - Math.pow(1 - introT, 3);
    updateCascade(reduced ? 99 : clock);

    // progresso suavizado (sensação de "vídeo" sendo arrastado)
    P += (targetP - P) * (1 - Math.exp(-dt * 9));
    if (Math.abs(targetP - P) < 1e-5) P = targetP;
    const p = P;

    /* scooter */
    const s = driveDistance(p);
    const vel = (s - lastS) / Math.max(dt, 1e-3);
    lastS = s;
    const spTarget = clamp01(Math.abs(vel) / 16);
    speed += (spTarget - speed) * (1 - Math.exp(-dt * 8));

    scooter.root.position.x = s;
    const spin = -s / WHEEL_R;
    scooter.rearWheel.rotation.z = spin;
    scooter.frontWheel.rotation.z = spin;
    const lift = 0.05 * sstep(0.645, 0.69, p) * (1 - sstep(0.71, 0.8, p));
    scooter.pitch.rotation.z = lift;
    scooter.setStand(sstep(0.5, 0.58, p));
    blobs.position.x = s;
    blobFront.material.opacity = 1 - clamp01(lift / 0.03);

    paint.color.lerp(targetPaint, 1 - Math.exp(-dt * 7));

    // luzes
    const on = sstep(0.14, 0.24, p);
    const m = scooter.mats;
    m.lens.emissiveIntensity = 0.55 + on * 5.5 + Math.sin(clock * 2) * 0.05 * (1 - on);
    m.drl.color.setRGB(1.4 + on * 1.4, 1.6 + on * 1.5, 2.0 + on * 1.6);
    headSpot.intensity = on * 30;
    beamMat.uniforms.uI.value = on * 0.42 * (1 - sstep(0.9, 1, p) * 0.5);
    m.tail.emissiveIntensity = 1.4 + on * 1.6;
    tailGlow.intensity = 0.25 + on * 0.6;
    trail.visible = speed > 0.01;
    trailMat.uniforms.uI.value = clamp01(speed * 1.4);
    trail.scale.set(0.15 + speed * 3.4, 0.05, 0.05);

    rig.position.x = s;

    // riscos de velocidade
    streaks.visible = speed > 0.02;
    if (streaks.visible) {
      streakMat.opacity = clamp01(speed * 1.1) * 0.75;
      const len = 0.08 + speed * 2.8;
      for (let i = 0; i < STREAKS; i++) {
        _s.set(len * (0.5 + (i % 5) * 0.18), 0.006, 0.006);
        _m.compose(streakPos[i], _q, _s);
        streaks.setMatrixAt(i, _m);
      }
      streaks.instanceMatrix.needsUpdate = true;
    }

    /* câmera */
    const seg = keySegment(p);
    posCurve.getPoint(seg.u, camPos);
    tgtCurve.getPoint(seg.u, camTgt);
    const a = KEYS[seg.i];
    const b = KEYS[Math.min(seg.i + 1, KEYS.length - 1)];
    let fov = lerp(a.fov, b.fov, seg.t);
    let sx = lerp(a.sx, b.sx, seg.t);
    let sy = lerp(a.sy, b.sy, seg.t);

    const aspect = W / H;
    const portrait = aspect < 1.1;
    let fit = 1;
    if (portrait) {
      fov += 8;
      const detail = sstep(0.3, 0.42, p) * (1 - sstep(0.54, 0.64, p));
      fit = clamp(0.78 / aspect, 1, 1.9) * (1 + 0.22 * detail);
      sx = 0;
      sy = lerp(0.2, 0.12, sstep(0.1, 0.22, p));
    } else if (aspect < 1.45) {
      fit = 1.15;
      sx *= 0.6;
    }

    const idle = reduced ? 0 : (1 - sstep(0.0, 0.1, p)) * Math.sin(clock * 0.22) * 0.09;
    const orbit = (1 - intro) * 0.6 + idle;
    off.subVectors(camPos, camTgt).applyAxisAngle(Y, orbit);
    off.multiplyScalar(fit * (1 + (1 - intro) * 0.5));
    camPos.copy(camTgt).add(off);
    camPos.y += (1 - intro) * 0.25;

    const follow = 6.5 * (1 - Math.exp(-s / 5.5));
    camPos.x += follow;
    camTgt.x += follow + Math.min(s, 30) * 0.3;

    // leve tremida na arrancada
    const shake = speed * 0.006;
    camPos.y += Math.sin(clock * 41) * shake;
    camPos.z += Math.sin(clock * 33 + 1) * shake;

    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    if (Math.abs(camera.fov - fov) > 1e-3) camera.fov = fov;
    camera.setViewOffset(W, H, -sx * W, -sy * H, W, H); // sx>0 empurra a moto p/ direita, sy>0 p/ baixo
    camera.updateProjectionMatrix();

    return { p, s, speed };
  }

  let state = { p: 0, s: 0, speed: 0 };
  function render(dt) {
    // se o computador não aguenta, baixa a resolução sozinho (até 50%)
    if (clock > 2 && dt < 0.099) {
      slowT = dt > 0.028 ? slowT + dt : Math.max(0, slowT - dt * 2);
      if (slowT > 1.2 && qLevel < QUALITY.length - 1) {
        qLevel++;
        slowT = 0;
        try { sessionStorage.setItem('gm-q', String(qLevel)); } catch {}
        applyQuality();
      }
    }
    state = update(Math.min(dt, 0.05));
    if (composer) composer.render();
    else renderer.render(scene, camera);
    return state;
  }

  const _v = new THREE.Vector3();
  function getAnchors() {
    const out = {};
    for (const [k, v] of Object.entries(scooter.anchors)) {
      _v.copy(v);
      scooter.bike.localToWorld(_v);
      _v.project(camera);
      out[k] = { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, ok: _v.z < 1 && _v.z > -1 };
    }
    return out;
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      scooter.badgeTex.userData.redraw();
      scooter.motorTex.userData.redraw();
    });
  }

  // compila TODOS os shaders agora (rastro, riscos, feixe) para não engasgar na 1ª vez que aparecem
  if (!lite) {
    trail.visible = true;
    streaks.visible = true;
    renderer.compile(scene, camera);
    trail.visible = false;
    streaks.visible = false;
  }

  if (qLevel) {
    DPR = BASE_DPR * QUALITY[qLevel];
    bloom.enabled = qLevel < 2;
  }
  if (import.meta.env.DEV) window.__dbg = { renderer, scene, camera, composer, bloom, reflector, ceilMat, beamMat, trailMat, streakMat };
  return { resize, setProgress, setColor, render, getAnchors, lowPower, reduced };
}
