import * as THREE from 'three';

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

// ---------- Hero: noise-displaced pearl blob + drifting pollen ----------

// Ashima simplex noise (MIT)
const noiseGLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const heroScene = new THREE.Scene();
heroScene.fog = new THREE.FogExp2(0xf6f4ee, 0.07);
const heroCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
heroCam.position.set(0, 0, 6);

const blobUniforms = { uTime: { value: 0 }, uIntensity: { value: 0.22 } };
const blob = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.4, 128),
  new THREE.ShaderMaterial({
    uniforms: blobUniforms,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uIntensity;
      varying float vDisp; varying vec3 vNormal; varying vec3 vView;
      ${noiseGLSL}
      void main(){
        float n = snoise(position * 1.0 + uTime * 0.12);
        n += 0.35 * snoise(position * 2.2 - uTime * 0.18);
        vDisp = n;
        vec3 p = position + normal * n * uIntensity;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying float vDisp; varying vec3 vNormal; varying vec3 vView;
      void main(){
        vec3 n = normalize(vNormal);
        float fres = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.0);
        vec3 sage = vec3(.66, .75, .64), cream = vec3(.98, .96, .92);
        vec3 blush = vec3(.94, .82, .78), sky = vec3(.82, .89, .90);
        float t = vDisp * 0.5 + 0.5 + sin(uTime * 0.2) * 0.08;
        vec3 col = mix(sage, cream, smoothstep(0.05, 0.75, t));
        col = mix(col, blush, smoothstep(0.6, 1.0, t) * 0.7);
        col = mix(col, sky, fres * 0.55);
        float light = dot(n, normalize(vec3(-0.4, 0.8, 0.6))) * 0.5 + 0.5;
        col *= 0.86 + 0.14 * light;
        col += fres * 0.18;
        gl_FragColor = vec4(min(col, 1.0), 1.0);
      }`,
  })
);

const heroGroup = new THREE.Group();
heroGroup.add(blob);

// Fine orbit lines
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7f9a80, transparent: true, opacity: 0.35 });
const rings = [2.2, 2.6].map((r, i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 200), ringMat);
  m.rotation.x = Math.PI / 2.4 + i * 0.5;
  heroGroup.add(m);
  return m;
});

// Pollen field: soft round motes in sage, blush and gold
const PCOUNT = 900;
const pPos = new Float32Array(PCOUNT * 3);
const pCol = new Float32Array(PCOUNT * 3);
const tints = [0x9fb39f, 0xe2b7aa, 0xd9c48f, 0xffffff].map((c) => new THREE.Color(c));
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

function frame() {
  const t = clock.getElapsedTime() * motion;
  const w = innerWidth, h = innerHeight;
  const scroll = scrollY / h;

  mouseSmooth.lerp(mouse, 0.05);

  // Hero animation: blob drifts right and recedes as you scroll
  blobUniforms.uTime.value = t;
  blobUniforms.uIntensity.value = 0.2 + Math.min(scroll, 1) * 0.12 + Math.abs(mouseSmooth.x) * 0.05;
  const wide = w > 800;
  heroGroup.position.x = THREE.MathUtils.lerp(wide ? 1.8 : 0, wide ? 2.6 : 0, Math.min(scroll, 1));
  heroGroup.position.y = (wide ? 0 : -1.2) + scroll * 0.8 + Math.sin(t * 0.5) * 0.06;
  heroGroup.position.z = -Math.min(scroll, 3) * 1.2;
  heroGroup.rotation.y = t * 0.08 + mouseSmooth.x * 0.3 + scroll * 1.0;
  heroGroup.rotation.x = -mouseSmooth.y * 0.2;
  rings[0].rotation.z = t * 0.12;
  rings[1].rotation.z = -t * 0.08;
  particles.rotation.y = t * 0.012 + scroll * 0.15;
  particles.position.y = Math.sin(t * 0.15) * 0.3 + scroll * 0.4;
  particles.rotation.x = scroll * 0.1;
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
