import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const mouse = new THREE.Vector2();
const mouseSmooth = new THREE.Vector2();
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

// ---------- Hero: tulip model + drifting pollen ----------

const heroScene = new THREE.Scene();
heroScene.fog = new THREE.FogExp2(0xf6f4ee, 0.07);
const heroCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
heroCam.position.set(0, 0, 6);

const sun = new THREE.DirectionalLight(0xfff4e8, 2.2);
sun.position.set(-3, 5, 4);
const rim = new THREE.DirectionalLight(0xdbe8ea, 1.2);
rim.position.set(4, 1, -3);
heroScene.add(new THREE.HemisphereLight(0xfffaf2, 0xb7c4b4, 1.6), sun, rim);

const heroGroup = new THREE.Group();
const flower = new THREE.Group(); // tilted toward the camera, spun on its stem in the render loop
flower.rotation.x = 0.45;
flower.scale.setScalar(0.001);
heroGroup.add(flower);
let bloom = 0.001; // target scale: grows to 1 once the model has loaded

// Tulip with Irma's petal + pistil textures; the OBJ's two materials ("Petal._Yellow", "Pistill")
// each get their own colour + normal map. Textures load alongside the mesh.
// Bump MODEL_V whenever a file in renders/models changes, so browsers skip their cached copy.
const MODEL_V = 6;
const texLoader = new THREE.TextureLoader();
const loadTex = (url, srgb) => texLoader.loadAsync(url).then((t) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
});
const M = 'renders/models';
Promise.all([
  new OBJLoader().loadAsync(`${M}/tulip.obj?v=${MODEL_V}`),
  loadTex(`${M}/Tulip_Petal_Diffuse.png?v=${MODEL_V}`, true),
  loadTex(`${M}/Tulip_Petal_Normal.png?v=${MODEL_V}`, false),
  loadTex(`${M}/Pistill_Diffuse.png?v=${MODEL_V}`, true),
  loadTex(`${M}/Pistill_Normals.png?v=${MODEL_V}`, false),
]).then(([obj, petalMap, petalNormal, pistilMap, pistilNormal]) => {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const petal = new THREE.MeshPhysicalMaterial({
    map: petalMap, normalMap: petalNormal, normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.6, side: THREE.DoubleSide,
    sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xf6e7c4),
  });
  const pistil = new THREE.MeshStandardMaterial({
    map: pistilMap, normalMap: pistilNormal, normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.7, side: THREE.DoubleSide,
  });
  const pick = (m) => (m.name === 'Pistill' ? pistil : petal);
  obj.traverse((m) => {
    if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);
  });
  const k = 3.2 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(k);
  obj.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-k);
  flower.add(obj);
  bloom = 1;

  // Pistil vertices in flower space: the pollen puffs below spawn from these
  obj.updateMatrixWorld(true);
  const pts = [];
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const mats = [].concat(m.material);
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    const toFlower = new THREE.Matrix4().multiplyMatrices(obj.matrix, m.matrix);
    for (const g of groups) {
      if (mats[g.materialIndex] !== pistil) continue;
      for (let i = g.start; i < g.start + g.count; i++) {
        pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toFlower));
      }
    }
  });
  if (pts.length) emitFrom = pts;
});

// Fine orbit lines
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7f9a80, transparent: true, opacity: 0.35 });
const rings = [2.2, 2.6].map((r, i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 200), ringMat);
  m.rotation.x = Math.PI / 2.4 + i * 0.5;
  heroGroup.add(m);
  return m;
});

// Pollen field: soft round motes in the tulip's orange, coral, gold and cream
const PCOUNT = 900;
const pPos = new Float32Array(PCOUNT * 3);
const pCol = new Float32Array(PCOUNT * 3);
const tints = [0xe8a066, 0xd9705a, 0xe6c35c, 0xfff1dc].map((c) => new THREE.Color(c));
for (let i = 0; i < PCOUNT; i++) {
  const r = 3 + Math.random() * 12;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  pPos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
  const c = tints[i % tints.length];
  pCol.set([c.r, c.g, c.b], i * 3);
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dot = document.createElement('canvas');
dot.width = dot.height = 64;
const dctx = dot.getContext('2d');
const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
dg.addColorStop(0, 'rgba(255,255,255,1)');
dg.addColorStop(0.4, 'rgba(255,255,255,0.6)');
dg.addColorStop(1, 'rgba(255,255,255,0)');
dctx.fillStyle = dg;
dctx.fillRect(0, 0, 64, 64);
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.09, map: new THREE.CanvasTexture(dot), vertexColors: true,
  transparent: true, opacity: 0.75, depthWrite: false,
}));

// Pollen puffs: motes that rise off the pistil, drift up out of the cup and fade away.
// They live in heroGroup so they follow the flower around, but not its spin.
const ECOUNT = 60;
// Richer than the background field's tints, so the puffs read as fresh pollen
const puffTints = [0xff7a1a, 0xf2452e, 0xffc21a, 0xff9f2e].map((c) => new THREE.Color(c));
const ePos = new Float32Array(ECOUNT * 3);
const eCol = new Float32Array(ECOUNT * 4); // rgba: alpha fades each mote in and out
const eVel = new Float32Array(ECOUNT * 3);
const eAge = new Float32Array(ECOUNT);
const eLife = new Float32Array(ECOUNT);
const eSize = new Float32Array(ECOUNT).fill(1); // per-mote size multiplier, re-rolled on each spawn
for (let i = 0; i < ECOUNT; i++) {
  const c = puffTints[i % puffTints.length];
  eCol.set([c.r, c.g, c.b, 0], i * 4);
  eAge[i] = -Math.random() * 14; // staggered start so they don't all appear at once
}
const eGeo = new THREE.BufferGeometry();
eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 4));
eGeo.setAttribute('pSize', new THREE.BufferAttribute(eSize, 1));
// Solid-cored dot: the soft background dot is mostly translucent, which turned these near-white
const core = document.createElement('canvas');
core.width = core.height = 64;
const cctx = core.getContext('2d');
const cg = cctx.createRadialGradient(32, 32, 0, 32, 32, 32);
cg.addColorStop(0, 'rgba(255,255,255,1)');
cg.addColorStop(0.55, 'rgba(255,255,255,1)');
cg.addColorStop(1, 'rgba(255,255,255,0)');
cctx.fillStyle = cg;
cctx.fillRect(0, 0, 64, 64);
const puffs = new THREE.Points(eGeo, new THREE.PointsMaterial({
  size: 0.08, map: new THREE.CanvasTexture(core), vertexColors: true,
  transparent: true, depthWrite: false,
  toneMapped: false, fog: false, // skip ACES and the cream haze so the colours stay vivid
}));
// PointsMaterial has one size for every point; scale it per mote with the pSize attribute
puffs.material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('uniform float size;', 'uniform float size;\nattribute float pSize;')
    .replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
};
puffs.frustumCulled = false;
heroGroup.add(puffs);

let emitFrom = null; // set once the model has loaded
const up = new THREE.Vector3();
const spot = new THREE.Vector3();
function updatePuffs(dt, t) {
  flower.updateMatrix();
  up.set(0, 1, 0).applyQuaternion(flower.quaternion);
  for (let i = 0; i < ECOUNT; i++) {
    eAge[i] += dt;
    if (eAge[i] < 0) continue;
    if (eAge[i] >= eLife[i]) {
      if (!emitFrom) { eAge[i] = -Math.random() * 2; continue; }
      spot.copy(emitFrom[(Math.random() * emitFrom.length) | 0]).applyMatrix4(flower.matrix);
      spot.toArray(ePos, i * 3);
      const s = 0.08 + Math.random() * 0.12;
      eVel[i * 3] = up.x * s + (Math.random() - 0.5) * 0.15;
      eVel[i * 3 + 1] = up.y * s + (Math.random() - 0.5) * 0.15;
      eVel[i * 3 + 2] = up.z * s + (Math.random() - 0.5) * 0.15;
      eAge[i] = 0;
      eLife[i] = 8 + Math.random() * 5;
      eSize[i] = 0.35 + Math.random() ** 2 * 2.15; // mostly fine specks, the odd big grain
    }
    const drag = 1 - 0.1 * dt;
    const sway = Math.sin(t * 0.7 + i) * 0.03 * dt;
    for (let a = 0; a < 3; a++) {
      eVel[i * 3 + a] *= drag;
      ePos[i * 3 + a] += eVel[i * 3 + a] * dt + (a === 0 ? sway : 0);
    }
    const p = eAge[i] / eLife[i];
    eCol[i * 4 + 3] = Math.min(p / 0.15, 1) * Math.min((1 - p) / 0.35, 1) * 0.9;
  }
  eGeo.attributes.position.needsUpdate = true;
  eGeo.attributes.color.needsUpdate = true;
  eGeo.attributes.pSize.needsUpdate = true;
}

heroScene.add(heroGroup, particles);

// ---------- Gallery: tilt, compare sliders, video autoplay, lightbox ----------

const items = [...document.querySelectorAll('.item')];

items.forEach((el) => {
  if (!el.classList.contains('compare')) el.tabIndex = 0;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
    if (reduceMotion || el.classList.contains('compare')) return;
    el.style.setProperty('--ry', `${(x - 0.5) * 3}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * 3}deg`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  });
});

document.querySelectorAll('.compare').forEach((el) => {
  const input = el.querySelector('input');
  const set = (v) => el.style.setProperty('--pos', `${v}%`);
  input.addEventListener('input', () => set(input.value));
  el.addEventListener('dblclick', () => openLightbox(items.indexOf(el)));
  // One-time sweep when the slider first comes into view, to show it can be dragged
  if (reduceMotion) return;
  const hint = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    hint.disconnect();
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 1600, 1);
      if (+input.value !== 50 && p > 0) return; // user grabbed it
      set(50 + Math.sin(p * Math.PI * 2) * 10 * (1 - p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 });
  hint.observe(el);
});

document.querySelectorAll('.carousel').forEach((car) => {
  const track = car.querySelector('.car-track');
  const slides = [...track.children];
  const count = car.querySelector('.car-count');
  let i = 0;
  const go = (n) => {
    i = (n + slides.length) % slides.length;
    track.style.setProperty('--i', i);
    slides.forEach((s, k) => (s.inert = k !== i)); // keep hidden slides out of the tab order
    count.textContent = `${i + 1} / ${slides.length}`;
  };
  car.querySelector('.car-prev').addEventListener('click', () => go(i - 1));
  car.querySelector('.car-next').addEventListener('click', () => go(i + 1));
  go(0);
});

const vio = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && !reduceMotion) e.target.play().catch(() => {});
    else e.target.pause();
  }
}, { threshold: 0.25 });
document.querySelectorAll('.item video').forEach((v) => {
  v.addEventListener('loadedmetadata', () => {
    if (v.videoWidth) v.closest('.item').style.setProperty('--ar', (v.videoWidth / v.videoHeight).toFixed(4));
  });
  vio.observe(v);
});

const lb = document.querySelector('.lightbox');
const stage = lb.querySelector('.lb-stage');
const caption = lb.querySelector('.lb-caption');
let current = 0;

function openLightbox(i) {
  current = (i + items.length) % items.length;
  const el = items[current];
  const video = el.querySelector('video');
  let media;
  if (video) {
    media = document.createElement('video');
    Object.assign(media, { src: video.src, controls: true, autoplay: true, loop: true, playsInline: true });
  } else {
    const img = el.querySelector('img');
    media = new Image();
    media.src = img.src;
    media.alt = img.alt;
  }
  stage.replaceChildren(media);
  const h = el.querySelector('figcaption h3').textContent;
  const sub = el.querySelector('figcaption p').textContent;
  caption.textContent = `${h} · ${sub} — ${current + 1} / ${items.length}`;
  if (!lb.open) lb.showModal();
}

items.forEach((el, i) => {
  if (el.classList.contains('compare')) return;
  el.addEventListener('click', () => openLightbox(i));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(i); } });
});
lb.querySelector('.lb-prev').addEventListener('click', () => openLightbox(current - 1));
lb.querySelector('.lb-next').addEventListener('click', () => openLightbox(current + 1));
lb.querySelector('.lb-close').addEventListener('click', () => lb.close());
lb.addEventListener('click', (e) => { if (e.target === lb || e.target === stage) lb.close(); });
lb.addEventListener('close', () => stage.replaceChildren());
addEventListener('keydown', (e) => {
  if (!lb.open) return;
  if (e.key === 'ArrowLeft') openLightbox(current - 1);
  if (e.key === 'ArrowRight') openLightbox(current + 1);
});

// ---------- DOM effects: tilt, reveal, counters ----------

document.querySelectorAll('.tilt').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `rotateY(${(x - 0.5) * 6}deg) rotateX(${(0.5 - y) * 6}deg)`;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  });
  el.addEventListener('pointerleave', () => (el.style.transform = ''));
});

document.querySelectorAll('.section-head, .row, .more, .service, .about-body, .contact > *').forEach((el) => el.classList.add('reveal'));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    e.target.querySelectorAll?.('[data-count]').forEach(countUp);
    io.unobserve(e.target);
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

function countUp(el) {
  const end = +el.dataset.count, start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / 1400, 1);
    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

document.getElementById('year').textContent = new Date().getFullYear();

// ---------- Render loop ----------

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  heroCam.aspect = w / h;
  heroCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const motion = reduceMotion ? 0.15 : 1;
let lastT = 0;

function frame() {
  const t = clock.getElapsedTime() * motion;
  const dt = Math.min(t - lastT, 0.05); // clamp so a backgrounded tab doesn't fling the puffs
  lastT = t;
  const w = innerWidth, h = innerHeight;
  const scroll = scrollY / h;

  mouseSmooth.lerp(mouse, 0.05);

  // Hero animation: flower drifts right and recedes as you scroll
  const wide = w > 800;
  heroGroup.position.x = THREE.MathUtils.lerp(wide ? 1.8 : 0, wide ? 2.6 : 0, Math.min(scroll, 1));
  heroGroup.position.y = (wide ? 0 : -1.9) + scroll * 0.8 + Math.sin(t * 0.5) * 0.06;
  heroGroup.scale.setScalar(wide ? 1 : 0.6);
  heroGroup.position.z = -Math.min(scroll, 3) * 1.2;
  heroGroup.rotation.y = mouseSmooth.x * 0.3 + scroll * 0.4;
  flower.rotation.y = t * 0.1;
  flower.scale.setScalar(THREE.MathUtils.lerp(flower.scale.x, bloom, 0.03));
  heroGroup.rotation.x = -mouseSmooth.y * 0.2;
  rings[0].rotation.z = t * 0.12;
  rings[1].rotation.z = -t * 0.08;
  particles.rotation.y = t * 0.012 + scroll * 0.15;
  particles.position.y = Math.sin(t * 0.15) * 0.3 + scroll * 0.4;
  particles.rotation.x = scroll * 0.1;
  updatePuffs(dt, t);
  heroCam.position.x = mouseSmooth.x * 0.4;
  heroCam.position.y = mouseSmooth.y * 0.3;
  heroCam.lookAt(0, 0, 0);

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.setClearColor(0xf6f4ee);
  renderer.clear();
  renderer.render(heroScene, heroCam);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
