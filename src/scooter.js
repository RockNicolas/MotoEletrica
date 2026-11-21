// Scooter elétrica modelada 100% em código (sem arquivos 3D externos).
// Eixos: x = frente, y = cima, z = lateral. Unidades em metros.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const WHEEL_R = 0.273;
export const REAR_X = -0.62;
export const FRONT_X = 0.7;
const AX_Y = WHEEL_R;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- helpers ---------- */

function panel(shape, { depth, bevel, bevelSize = bevel * 0.7, segments = 7, curveSegments = 40, deform, uvXZ } = {}) {
  let g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize,
    bevelSegments: segments,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  if (deform) {
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      deform(v);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  if (uvXZ) {
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) * uvXZ;
      uv[i * 2 + 1] = pos.getZ(i) * uvXZ;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return g;
}

function rod(a, b, r, mat, seg = 18) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function bar2D(x0, y0, x1, y1, w, t, z, mat) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, t), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  m.rotation.z = Math.atan2(dy, dx);
  return m;
}

function rrect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function arcBand(cx, cy, r0, r1, a0, a1) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r1, a0, a1, false);
  s.absarc(cx, cy, r0, a1, a0, true);
  s.closePath();
  return s;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.redraw = () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    t.needsUpdate = true;
  };
  return t;
}

function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#efe3cc');
  g.addColorStop(0.45, '#c6b18c');
  g.addColorStop(1, '#8d7a58');
  return g;
}

function repeatTex(t, x, y) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// couro: grão + costura em pesponto
function leatherBump() {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 128 + (Math.random() - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(w, 2);
    ctx.moveTo(2, 0);
    ctx.lineTo(2, h);
    ctx.stroke();
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 6]);
    for (const o of [-9, 13]) {
      ctx.beginPath();
      ctx.moveTo(0, 2 + o);
      ctx.lineTo(w, 2 + o);
      ctx.moveTo(2 + o, 0);
      ctx.lineTo(2 + o, h);
      ctx.stroke();
    }
  });
  return repeatTex(t, 1, 1);
}

// pneu: desenho de banda de rodagem em "V"
function treadBump() {
  const t = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillRect(0, 0, w, h * 0.2);
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 5;
    for (const [y0, y1] of [
      [h * 0.8, h],
      [h * 0.2, 0],
    ]) {
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w * 0.5, y1);
      ctx.lineTo(w, y0);
      ctx.stroke();
    }
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, h * 0.495, w, 2);
  });
  return repeatTex(t, 64, 1);
}

/* ---------- materials ---------- */

export function makeMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: '#ece7de',
      metalness: 0.12,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    gloss: new THREE.MeshPhysicalMaterial({
      color: '#101013',
      metalness: 0.35,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
    }),
    rimInner: new THREE.MeshStandardMaterial({ color: '#141417', metalness: 0.6, roughness: 0.38, side: THREE.DoubleSide }),
    plastic: new THREE.MeshStandardMaterial({ color: '#121214', roughness: 0.62, metalness: 0.08 }),
    leather: new THREE.MeshPhysicalMaterial({
      color: '#1b1612',
      bumpMap: leatherBump(),
      bumpScale: 2.2,
      roughness: 0.58,
      sheen: 0.6,
      sheenColor: new THREE.Color('#6b5236'),
      sheenRoughness: 0.55,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: '#111112', roughness: 0.88, metalness: 0 }),
    tire: new THREE.MeshStandardMaterial({ color: '#131314', roughness: 0.82, metalness: 0, bumpMap: treadBump(), bumpScale: 2.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 1, roughness: 0.18 }),
    brushed: new THREE.MeshStandardMaterial({ color: '#9a9da3', metalness: 1, roughness: 0.3 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#2b2c31', metalness: 0.75, roughness: 0.38 }),
    gold: new THREE.MeshStandardMaterial({ color: '#cdb892', metalness: 1, roughness: 0.22 }),
    lens: new THREE.MeshPhysicalMaterial({
      color: '#d9e4f2',
      emissive: new THREE.Color('#eef4ff'),
      emissiveIntensity: 0.6,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
    }),
    drl: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.2) }),
    tail: new THREE.MeshStandardMaterial({
      color: '#2a0204',
      emissive: new THREE.Color('#ff1622'),
      emissiveIntensity: 1.6,
      roughness: 0.25,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: '#3a2000',
      emissive: new THREE.Color('#ff9418'),
      emissiveIntensity: 0.35,
      roughness: 0.3,
    }),
  };
}

/* ---------- textures ---------- */

function discTexture() {
  return canvasTexture(512, 512, (ctx, w) => {
    const c = w / 2;
    // RingGeometry(0.048, 0.104): uv é planar, raio externo = metade da textura
    const rOut = c;
    const rIn = c * (0.048 / 0.104);
    const grad = ctx.createRadialGradient(c, c, rIn, c, c, rOut);
    grad.addColorStop(0, '#8e9298');
    grad.addColorStop(0.5, '#c9ccd2');
    grad.addColorStop(1, '#a3a7ad');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, rOut, 0, Math.PI * 2);
    ctx.fill();
    // furos de ventilação (transparentes via alphaTest)
    ctx.globalCompositeOperation = 'destination-out';
    for (let ring = 0; ring < 2; ring++) {
      const n = 18;
      const rr = rIn + (rOut - rIn) * (ring ? 0.68 : 0.42);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * (Math.PI / n);
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, w * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

function motorFaceTexture() {
  return canvasTexture(1024, 1024, (ctx, w) => {
    const c = w / 2;
    const R = c;
    const g = ctx.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, R);
    g.addColorStop(0, '#4a4c52');
    g.addColorStop(0.7, '#2a2b30');
    g.addColorStop(1, '#1b1c20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    // ranhuras
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (const k of [0.94, 0.9, 0.56, 0.5, 0.3]) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, R * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // texto em arco
    ctx.fillStyle = goldGradient(ctx, 0, 0, w, w);
    ctx.font = `600 ${Math.round(w * 0.042)}px Michroma, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'MOTOELETRICA  •  MOTOR ELÉTRICO  •  MOTOELETRICA  •  MOTOR ELÉTRICO  •  ';
    const rr = R * 0.73;
    const step = (Math.PI * 2) / text.length;
    for (let i = 0; i < text.length; i++) {
      const a = i * step - Math.PI / 2;
      ctx.save();
      ctx.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
    // parafusos
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = c + Math.cos(a) * R * 0.4;
      const y = c + Math.sin(a) * R * 0.4;
      const bg = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 18);
      bg.addColorStop(0, '#e9e9ea');
      bg.addColorStop(1, '#6b6d72');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    // centro
    ctx.fillStyle = goldGradient(ctx, c - 80, c - 80, c + 80, c + 80);
    ctx.beginPath();
    ctx.arc(c, c, R * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1d21';
    ctx.beginPath();
    ctx.arc(c, c, R * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

function badgeTexture() {
  return canvasTexture(1024, 176, (ctx, w, h) => {
    const r = h / 2;
    ctx.fillStyle = '#0d0d0f';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r, h);
    ctx.arc(r, r, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, 0, 0, w, h);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = goldGradient(ctx, 0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${Math.round(h * 0.34)}px Michroma, "Arial Black", sans-serif`;
    ctx.fillText('MOTOELETRICA', w / 2, h / 2 + 2);
  });
}

/* ---------- wheel ---------- */

function buildWheel(m, { rear, discTex, motorTex }) {
  const g = new THREE.Group();

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.214, 0.059, 48, 160), m.tire);
  tire.scale.z = 1.04;
  g.add(tire);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.088, 72, 1, true), m.rimInner);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);

  for (const s of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.161, 0.0085, 12, 96), m.gloss);
    lip.position.z = s * 0.044;
    g.add(lip);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.151, 0.0034, 8, 110), m.gold);
    stripe.position.z = s * 0.047;
    g.add(stripe);
  }

  if (!rear) {
    // raios em Y
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const off of [-0.13, 0.13]) {
        for (const z of [0.02, -0.02]) {
          g.add(
            bar2D(
              Math.cos(a) * 0.04,
              Math.sin(a) * 0.04,
              Math.cos(a + off) * 0.154,
              Math.sin(a + off) * 0.154,
              0.015,
              0.012,
              z,
              m.gloss,
            ),
          );
        }
      }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.1, 32), m.brushed);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.048, 0.104, 72, 1),
      new THREE.MeshStandardMaterial({
        map: discTex,
        alphaTest: 0.5,
        metalness: 1,
        roughness: 0.28,
        side: THREE.DoubleSide,
      }),
    );
    disc.position.z = 0.057;
    g.add(disc);
  } else {
    // motor no cubo
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.126, 72), m.graphite);
    motor.rotation.x = Math.PI / 2;
    g.add(motor);
    const faceMat = new THREE.MeshStandardMaterial({ map: motorTex, metalness: 0.7, roughness: 0.38 });
    for (const s of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.117, 72), faceMat);
      face.position.z = s * 0.0635;
      if (s < 0) face.rotation.y = Math.PI;
      g.add(face);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.0048, 10, 96), m.gold);
      ring.position.z = s * 0.063;
      g.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const z of [0.03, -0.03]) {
        g.add(bar2D(Math.cos(a) * 0.112, Math.sin(a) * 0.112, Math.cos(a) * 0.155, Math.sin(a) * 0.155, 0.013, 0.01, z, m.gloss));
      }
    }
  }
  return g;
}

/* ---------- scooter ---------- */

export function buildScooter() {
  const m = makeMaterials();
  const discTex = discTexture();
  const motorTex = motorFaceTexture();
  const badgeTex = badgeTexture();

  const root = new THREE.Group(); // posição na pista
  const pitch = new THREE.Group(); // empinada leve (pivô no contato traseiro)
  pitch.position.set(REAR_X, 0, 0);
  root.add(pitch);
  const bike = new THREE.Group();
  bike.position.set(-REAR_X, 0, 0);
  pitch.add(bike);

  const add = (mesh) => {
    bike.add(mesh);
    return mesh;
  };

  /* rodas */
  const rearWheel = buildWheel(m, { rear: true, motorTex });
  rearWheel.position.set(REAR_X, AX_Y, 0);
  add(rearWheel);
  const frontWheel = buildWheel(m, { rear: false, discTex });
  frontWheel.position.set(FRONT_X, AX_Y, 0);
  add(frontWheel);

  for (const x of [REAR_X, FRONT_X]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 6), m.chrome);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(x, AX_Y, 0);
    add(axle);
  }

  /* assoalho */
  add(new THREE.Mesh(panel(rrect(-0.24, 0.215, 0.36, 0.285, 0.03), { depth: 0.26, bevel: 0.03 }), m.paint));
  // tapete de borracha com frisos
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.008, 0.25), m.rubber);
  mat.position.set(0.06, 0.318, 0);
  add(mat);
  for (let i = 0; i < 9; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.23), m.plastic);
    rib.position.set(-0.15 + i * 0.05, 0.324, 0);
    add(rib);
  }
  // friso dourado lateral
  for (const s of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.009, 0.004), m.gold);
    trim.position.set(0.06, 0.25, s * 0.1615);
    add(trim);
  }
  // caixa da bateria / chassi
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.2), m.graphite);
  battery.position.set(0.06, 0.18, 0);
  add(battery);

  /* escudo frontal */
  {
    const s = new THREE.Shape();
    s.moveTo(0.29, 0.24);
    s.lineTo(0.38, 0.24);
    s.quadraticCurveTo(0.4, 0.44, 0.49, 0.6);
    s.bezierCurveTo(0.55, 0.72, 0.53, 0.88, 0.45, 0.97);
    s.lineTo(0.36, 0.985);
    s.bezierCurveTo(0.31, 0.84, 0.3, 0.56, 0.27, 0.34);
    s.quadraticCurveTo(0.265, 0.26, 0.29, 0.24);
    add(
      new THREE.Mesh(
        panel(s, {
          depth: 0.32,
          bevel: 0.04,
          bevelSize: 0.025,
          deform: (v) => {
            v.z *= 1 - 0.3 * sstep(0.7, 1.0, v.y);
            v.x -= 1.3 * v.z * v.z;
          },
        }),
        m.paint,
      ),
    );
  }

  /* carenagem traseira */
  {
    const s = new THREE.Shape();
    s.moveTo(-0.15, 0.24);
    s.bezierCurveTo(-0.13, 0.47, -0.2, 0.65, -0.34, 0.71);
    s.lineTo(-0.9, 0.745);
    s.bezierCurveTo(-1.02, 0.752, -1.06, 0.69, -1.03, 0.625);
    s.lineTo(-0.97, 0.595);
    s.absarc(REAR_X, AX_Y, 0.385, 2.4, 0.72, true);
    s.quadraticCurveTo(-0.25, 0.4, -0.26, 0.24);
    s.lineTo(-0.15, 0.24);
    add(
      new THREE.Mesh(
        panel(s, {
          depth: 0.3,
          bevel: 0.055,
          bevelSize: 0.035,
          deform: (v) => {
            v.z *= 0.84 + 0.16 * sstep(0.3, 0.62, v.y);
          },
        }),
        m.paint,
      ),
    );
  }

  /* banco */
  {
    const s = new THREE.Shape();
    s.moveTo(-0.33, 0.765);
    s.bezierCurveTo(-0.32, 0.83, -0.37, 0.86, -0.47, 0.862);
    s.bezierCurveTo(-0.6, 0.865, -0.66, 0.845, -0.72, 0.85);
    s.bezierCurveTo(-0.84, 0.86, -0.93, 0.88, -0.965, 0.845);
    s.bezierCurveTo(-0.985, 0.82, -0.97, 0.79, -0.93, 0.785);
    s.lineTo(-0.36, 0.76);
    s.quadraticCurveTo(-0.335, 0.755, -0.33, 0.765);
    add(
      new THREE.Mesh(
        panel(s, {
          depth: 0.24,
          bevel: 0.042,
          bevelSize: 0.03,
          uvXZ: 6,
          deform: (v) => {
            v.z *= 1 - 0.22 * sstep(0.8, 0.91, v.y);
          },
        }),
        m.leather,
      ),
    );
  }

  /* para-lamas */
  add(
    new THREE.Mesh(
      panel(arcBand(FRONT_X, AX_Y, 0.298, 0.318, 0.12, 2.25), { depth: 0.1, bevel: 0.012, bevelSize: 0.008, segments: 4 }),
      m.paint,
    ),
  );
  add(
    new THREE.Mesh(
      panel(arcBand(REAR_X, AX_Y, 0.298, 0.31, 0.4, 2.05), { depth: 0.09, bevel: 0.01, bevelSize: 0.006, segments: 3 }),
      m.plastic,
    ),
  );

  /* garfo dianteiro */
  const steer = new THREE.Vector3(-0.27, 0.727, 0).normalize();
  for (const z of [-0.088, 0.088]) {
    const A = new THREE.Vector3(FRONT_X, AX_Y, z);
    add(rod(A.clone().addScaledVector(steer, -0.02), A.clone().addScaledVector(steer, 0.27), 0.023, m.gloss));
    add(rod(A.clone().addScaledVector(steer, 0.25), A.clone().addScaledVector(steer, 0.66), 0.016, m.chrome));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.023, 16, 12), m.gloss);
    cap.position.copy(A).addScaledVector(steer, -0.02);
    add(cap);
  }
  // pinça de freio dourada
  {
    const a = 2.55;
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.034, 0.03), m.gold);
    cal.position.set(FRONT_X + Math.cos(a) * 0.088, AX_Y + Math.sin(a) * 0.088, 0.064);
    cal.rotation.z = a + Math.PI / 2;
    add(cal);
  }

  /* balança + amortecedor */
  for (const z of [-0.1, 0.1]) {
    add(bar2D(REAR_X, AX_Y, -0.24, 0.3, 0.062, 0.03, z, m.graphite));
  }
  {
    const z = 0.112;
    const a = new THREE.Vector3(-0.67, 0.3, z);
    const b = new THREE.Vector3(-0.86, 0.6, z);
    add(rod(a, b, 0.012, m.chrome));
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    // mola em hélice
    const pts = [];
    const turns = 9;
    for (let i = 0; i <= 260; i++) {
      const t = i / 260;
      const ang = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(ang) * 0.026, t * len * 0.78 + len * 0.08, Math.sin(ang) * 0.026));
    }
    const spring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.0055, 6, false),
      m.gold,
    );
    spring.position.copy(a);
    spring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    add(spring);
    for (const k of [0.04, 0.92]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 18), m.gloss);
      eye.position.copy(a).addScaledVector(dir, len * k);
      eye.rotation.x = Math.PI / 2;
      add(eye);
    }
  }

  /* cabeça de direção + farol */
  {
    const s = new THREE.Shape();
    s.moveTo(0.27, 0.955);
    s.bezierCurveTo(0.27, 1.03, 0.31, 1.065, 0.38, 1.07);
    s.lineTo(0.5, 1.065);
    s.bezierCurveTo(0.57, 1.06, 0.6, 1.02, 0.585, 0.975);
    s.bezierCurveTo(0.575, 0.94, 0.54, 0.93, 0.5, 0.935);
    s.lineTo(0.3, 0.94);
    s.quadraticCurveTo(0.272, 0.94, 0.27, 0.955);
    add(
      new THREE.Mesh(
        panel(s, {
          depth: 0.2,
          bevel: 0.04,
          bevelSize: 0.03,
          deform: (v) => {
            v.z *= 1 - 0.18 * sstep(1.0, 1.1, v.y);
          },
        }),
        m.paint,
      ),
    );
  }
  const headlight = new THREE.Group();
  headlight.position.set(0.612, 1.0, 0);
  add(headlight);
  {
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.012, 16, 64), m.chrome);
    bezel.rotation.y = Math.PI / 2;
    headlight.add(bezel);
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(0.072, 48), m.brushed);
    bowl.rotation.y = Math.PI / 2;
    bowl.position.x = -0.004;
    headlight.add(bowl);
    const drl = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.0065, 10, 64), m.drl);
    drl.rotation.y = Math.PI / 2;
    drl.position.x = 0.006;
    headlight.add(drl);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 48, 16, 0, Math.PI * 2, 0, 0.76), m.lens);
    lens.rotation.z = -Math.PI / 2;
    lens.position.x = -0.074;
    headlight.add(lens);
  }

  /* guidão + espelhos */
  {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.66, 16), m.gloss);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0.37, 1.09, 0);
    add(bar);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 20), m.rubber);
      grip.rotation.x = Math.PI / 2;
      grip.position.set(0.37, 1.09, s * 0.29);
      add(grip);
      const end = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.012, 20), m.chrome);
      end.rotation.x = Math.PI / 2;
      end.position.set(0.37, 1.09, s * 0.355);
      add(end);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.14), m.brushed);
      lever.position.set(0.415, 1.088, s * 0.27);
      lever.rotation.y = s * 0.12;
      add(lever);
      add(rod(new THREE.Vector3(0.37, 1.1, s * 0.2), new THREE.Vector3(0.335, 1.27, s * 0.265), 0.006, m.chrome, 10));
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.gloss);
      head.scale.set(0.022, 0.044, 0.064);
      head.position.set(0.335, 1.29, s * 0.275);
      add(head);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 32), m.mirror);
      glass.scale.set(0.058, 0.04, 1);
      glass.rotation.y = -Math.PI / 2;
      glass.position.set(0.312, 1.29, s * 0.275);
      add(glass);
      // pisca dianteiro
      const blink = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m.amber);
      blink.scale.set(0.022, 0.016, 0.03);
      blink.position.set(0.56, 0.99, s * 0.145);
      add(blink);
    }
  }

  /* lanterna + piscas traseiros */
  {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.24, 8, 16), m.tail);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(-1.07, 0.7, 0);
    add(tail);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m.amber);
      b.scale.set(0.02, 0.014, 0.028);
      b.position.set(-1.055, 0.655, s * 0.17);
      add(b);
    }
  }

  /* alça traseira */
  {
    const pts = [
      new THREE.Vector3(-0.64, 0.8, 0.19),
      new THREE.Vector3(-0.88, 0.805, 0.196),
      new THREE.Vector3(-1.0, 0.805, 0.15),
      new THREE.Vector3(-1.045, 0.805, 0),
      new THREE.Vector3(-1.0, 0.805, -0.15),
      new THREE.Vector3(-0.88, 0.805, -0.196),
      new THREE.Vector3(-0.64, 0.8, -0.19),
    ];
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.011, 10, false), m.gloss));
  }

  /* emblemas laterais */
  const badgeMat = new THREE.MeshStandardMaterial({
    map: badgeTex,
    transparent: true,
    metalness: 0.4,
    roughness: 0.3,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  for (const s of [-1, 1]) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.05), badgeMat);
    badge.position.set(-0.635, 0.692, s * 0.2058);
    if (s < 0) badge.rotation.y = Math.PI;
    add(badge);
  }

  /* descanso lateral (recolhe ao sair) */
  const stand = new THREE.Group();
  stand.position.set(-0.02, 0.165, 0.12);
  add(stand);
  {
    const legLen = 0.2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, legLen, 10), m.graphite);
    leg.position.y = legLen / 2;
    stand.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.026), m.graphite);
    foot.position.y = legLen;
    stand.add(foot);
  }
  const Y = new THREE.Vector3(0, 1, 0);
  const standDown = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(-0.07, -0.16, 0.1).normalize());
  const standUp = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(-0.2, 0.012, 0.02).normalize());
  stand.quaternion.copy(standDown);

  bike.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  const anchors = {
    farol: new THREE.Vector3(0.64, 1.0, 0),
    motor: new THREE.Vector3(REAR_X, AX_Y, 0.07),
    freio: new THREE.Vector3(FRONT_X - 0.07, AX_Y + 0.05, 0.065),
    recarga: new THREE.Vector3(-0.27, 0.5, 0.19),
  };

  return {
    root,
    pitch,
    bike,
    rearWheel,
    frontWheel,
    headlight,
    mats: m,
    anchors,
    badgeTex,
    motorTex,
    setStand(k) {
      stand.quaternion.slerpQuaternions(standDown, standUp, k);
    },
  };
}
