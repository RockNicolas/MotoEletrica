import './style.css';
import Lenis from 'lenis';

document.documentElement.classList.add('js');

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- WhatsApp oficial (linktr.ee/globalmobilidade) ---------- */
const WA_NUMBER = '558587111213';
document.querySelectorAll('[data-wa]').forEach((a) => {
  a.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(a.dataset.wa)}`;
  a.target = '_blank';
  a.rel = 'noopener';
});

document.getElementById('year').textContent = String(new Date().getFullYear());

/* ---------- rolagem suave ---------- */
const lenis = reduced ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
if (import.meta.env.DEV) window.__lenis = lenis;

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    const top = id === '#top' || id === '#conteudo';
    if (lenis) lenis.scrollTo(top ? 0 : el, { offset: top ? 0 : -72, duration: 1.8 });
    else (top ? document.body : el).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
});

/* ---------- cena 3D ---------- */
const hero = document.querySelector('.hero');
const sticky = hero.querySelector('.hero-sticky');
const canvas = document.getElementById('scene');
let scene = null;
let currentColor = null;

// se o 3D falhar (placa de vídeo fraca, contexto perdido, shader recusado), mostra a foto estática
const fallback = (why) => {
  console.warn('3D indisponível, usando imagem estática.', why);
  scene = null;
  hero.classList.add('no-webgl');
  canvas.remove();
};

// o 3D (three.js) carrega depois que a página já está usável: texto, botões e rolagem não esperam por ele
const start3D = () =>
  import('./scene.js')
    .then(({ createScene }) => {
      const s = createScene(canvas, { onFail: () => fallback('shader/contexto') });
      // arrastar a janela dispara dezenas de resizes: agrupa para não realocar a GPU a cada pixel
      let rz = 0;
      const doResize = () => s.resize(sticky.clientWidth, sticky.clientHeight);
      new ResizeObserver(() => {
        clearTimeout(rz);
        rz = setTimeout(doResize, 150);
      }).observe(sticky);
      doResize();
      if (currentColor) s.setColor(currentColor);
      scene = s;
      canvas.classList.add('ready');
    })
    .catch(fallback);

if (document.readyState === 'complete') setTimeout(start3D, 200);
else addEventListener('load', () => setTimeout(start3D, 200), { once: true });

let heroVisible = true;
new IntersectionObserver(
  ([e]) => {
    heroVisible = e.isIntersecting;
  },
  { rootMargin: '120px 0px' },
).observe(hero);

/* cores */
const swatches = [...document.querySelectorAll('.swatch')];
const colorName = document.getElementById('colorName');
function pickSwatch(btn, focus = false) {
  swatches.forEach((b) => {
    const on = b === btn;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  colorName.textContent = btn.dataset.name;
  currentColor = btn.dataset.color;
  scene?.setColor(currentColor);
  if (focus) btn.focus();
}
swatches.forEach((btn, i) => {
  btn.tabIndex = i === 0 ? 0 : -1;
  btn.addEventListener('click', () => pickSwatch(btn));
  btn.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    pickSwatch(swatches[(i + dir + swatches.length) % swatches.length], true);
  });
});

/* elementos ligados ao progresso do hero */
const FADE = 0.035;
const ranged = [...document.querySelectorAll('[data-range]')].map((el) => {
  const [a, b] = el.dataset.range.split(',').map(Number);
  return {
    el,
    a,
    b,
    hotspot: el.classList.contains('hotspot'),
    key: el.dataset.key,
    label: el.querySelector('span'),
    prefLeft: el.classList.contains('hs-left'),
    v: -1,
  };
});
const heroBar = document.getElementById('heroBar');
const heroExit = hero.querySelector('.hero-exit');
const hudSpeed = document.getElementById('hudSpeed');

function updateHeroUI(p, st) {
  const anchors = scene && st ? scene.getAnchors() : null;
  for (const r of ranged) {
    const vin = r.a <= 0 ? 1 : sstep(r.a, r.a + FADE, p);
    const vout = r.b >= 1 ? 1 : 1 - sstep(r.b - FADE, r.b, p);
    const v = Math.min(vin, vout);
    if (Math.abs(v - r.v) > 0.001) {
      r.el.style.opacity = v.toFixed(3);
      r.el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
      if (!r.hotspot) r.el.style.translate = `0 ${((1 - v) * (vin < 1 ? 26 : -26)).toFixed(1)}px`;
      r.v = v;
    }
    if (r.hotspot && v > 0.01 && anchors) {
      const a = anchors[r.key];
      r.el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) scale(${(0.85 + 0.15 * v).toFixed(3)})`;
      // vira o rótulo para o lado que tem espaço
      const labelW = r.label.offsetWidth + 40;
      const W = sticky.clientWidth;
      if (a.x + labelW > W - 8) r.el.classList.add('hs-left');
      else if (a.x - labelW < 8) r.el.classList.remove('hs-left');
      else r.el.classList.toggle('hs-left', r.prefLeft);
    }
  }
  heroBar.style.transform = `scaleY(${p.toFixed(4)})`;
  heroExit.style.opacity = sstep(0.94, 1, p).toFixed(3);
  if (st) hudSpeed.textContent = `${Math.round(st.speed * 48)} km/h`;
}

/* ---------- loop ---------- */
const nav = document.getElementById('nav');
const waFloat = document.querySelector('.wa-float');
let last = performance.now();
let lastP = -1;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  lenis?.raf(now);

  const total = Math.max(1, hero.offsetHeight - sticky.offsetHeight);
  const rawP = clamp01(-hero.getBoundingClientRect().top / total);

  let st = null;
  if (scene) {
    scene.setProgress(rawP);
    if (heroVisible) st = scene.render(dt);
  }
  const p = st ? st.p : rawP;
  if (heroVisible && (st || Math.abs(p - lastP) > 1e-4)) updateHeroUI(p, st);
  lastP = p;

  const y = window.scrollY;
  nav.classList.toggle('scrolled', y > 40);
  waFloat.classList.toggle('show', y > hero.offsetHeight - window.innerHeight * 0.4);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- revelar ao rolar ---------- */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(e.target);
    }
  },
  { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
);
document.querySelectorAll('.reveal').forEach((el) => {
  const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
  el.style.setProperty('--d', `${sibs.indexOf(el) * 0.08}s`);
  io.observe(el);
});

function countUp(el) {
  const to = Number(el.dataset.count);
  if (reduced) return;
  const t0 = performance.now();
  const tick = (now) => {
    const k = clamp01((now - t0) / 1400);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- calculadora ---------- */
const KM_PER_L = { moto: 35, carro: 11 };
const KWH_PER_KM = 0.03;
const TARIFA = 0.95;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const calcState = { mode: 'moto' };
const $ = (id) => document.getElementById(id);
const inputs = { km: $('km'), days: $('days'), fuel: $('fuel') };
let shownYear = 0;
let yearAnim = 0;

function setFill(input) {
  const k = (input.value - input.min) / (input.max - input.min);
  input.style.setProperty('--fill', `${(k * 100).toFixed(1)}%`);
}

function calc() {
  const km = Number(inputs.km.value);
  const days = Number(inputs.days.value);
  const fuel = Number(inputs.fuel.value);
  $('kmOut').textContent = `${km} km`;
  $('daysOut').textContent = `${days} ${days === 1 ? 'dia' : 'dias'}`;
  $('fuelOut').textContent = brl2.format(fuel);
  Object.values(inputs).forEach(setFill);

  const kmMonth = km * days * 4.345;
  const gas = (kmMonth / KM_PER_L[calcState.mode]) * fuel;
  const ele = kmMonth * KWH_PER_KM * TARIFA;
  const save = Math.max(0, gas - ele);

  $('costGas').textContent = brl.format(gas);
  $('costEle').textContent = brl.format(ele);
  $('saveMonth').textContent = brl.format(save);
  $('gasLabel').textContent = calcState.mode === 'moto' ? 'Moto a gasolina' : 'Carro';
  $('barGas').style.width = '100%';
  $('barEle').style.width = `${Math.max(2, (ele / gas) * 100).toFixed(1)}%`;

  const target = save * 12;
  const from = shownYear;
  const t0 = performance.now();
  cancelAnimationFrame(yearAnim);
  const tick = (now) => {
    const k = reduced ? 1 : clamp01((now - t0) / 500);
    shownYear = from + (target - from) * (1 - Math.pow(1 - k, 3));
    $('saveYear').textContent = brl.format(shownYear);
    if (k < 1) yearAnim = requestAnimationFrame(tick);
  };
  yearAnim = requestAnimationFrame(tick);
}

Object.values(inputs).forEach((i) => i.addEventListener('input', calc));
document.querySelectorAll('.seg button').forEach((b) =>
  b.addEventListener('click', () => {
    calcState.mode = b.dataset.mode;
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    calc();
  }),
);
calc();

/* ---------- modelos: fotos + painel de detalhes ---------- */
// Fotos em /public/motos/<id>.jpg (ou .webp/.png). Sem arquivo, o card mostra um fundo com o nome.
const MODELS = {
  'global-1000': {
    name: 'Global 1000',
    ext: 'png',
    tag: 'Scooter elétrica',
    lead: 'Tecnologia que acompanha a sua rotina: visual esportivo, painel digital e espaço para levar o que você precisa.',
    stats: [],
    feats: [
      'Painel digital com indicador de bateria',
      'Porta-objetos com gancho para bolsa',
      'Entrada USB para carregar o celular',
      'Baú traseiro',
      'Freio a disco e detalhes em verde nas rodas',
      'Farol com assinatura em LED e retrovisores',
    ],
    colors: [['Preto', '#15161a']],
  },
  'global-500': {
    name: 'Global 500',
    ext: 'webp',
    tag: 'Moto elétrica',
    lead: 'A moto elétrica que trabalha com você, sem te cobrar por isso. Boa para o trabalho, as compras e o dia a dia.',
    stats: [],
    feats: [
      'Cesto frontal para compras e encomendas',
      'Farol com setas dianteiras',
      'Retrovisores grandes',
      'Banco com encosto para o passageiro',
      'Assoalho com tapete de borracha',
      'Suspensão traseira e descanso lateral',
    ],
    colors: [['Azul', '#2457c9']],
    extra: 'Chegaram duas novas cores: pergunte à loja quais estão disponíveis.',
  },
  'global-x': {
    name: 'Global X',
    ext: 'webp',
    tag: 'Moto elétrica',
    lead: 'Praticidade e desempenho para a sua rotina.',
    stats: [
      ['500W', 'Motor'],
      ['32 km/h', 'Velocidade'],
      ['150 kg', 'Capacidade'],
    ],
    feats: [
      'Motor de 500W',
      'Velocidade de até 32 km/h',
      'Capacidade para até 150 kg',
      'Cesto frontal',
      'Banco com encosto para a garupa',
      'Farol redondo e retrovisor',
    ],
    colors: [
      ['Preto', '#18181b'],
      ['Vermelho', '#c2202c'],
      ['Azul-claro', '#9fd3ea'],
    ],
  },
};

function loadPhoto(box, id) {
  const m = MODELS[id];
  box.dataset.name = m.name;
  const exts = [m.ext, 'jpg', 'webp', 'png', 'jpeg'].filter((e, i, a) => e && a.indexOf(e) === i);
  const img = new Image();
  img.alt = `${m.name}, moto elétrica da MotoEletrica`;
  img.decoding = 'async';
  let i = 0;
  const next = () => {
    if (i >= exts.length) {
      box.classList.add('no-photo');
      img.remove();
      return;
    }
    img.src = `/motos/${id}.${exts[i++]}`;
  };
  img.addEventListener('error', next);
  next();
  box.appendChild(img);
}

document.querySelectorAll('[data-photo]').forEach((box) => loadPhoto(box, box.dataset.photo));

const dlg = document.getElementById('modelDialog');
let lastCard = null;

function openModel(id, card) {
  const m = MODELS[id];
  if (!m) return;
  lastCard = card;
  const $ = (x) => document.getElementById(x);
  $('mdTag').textContent = m.tag;
  $('mdName').textContent = m.name;
  $('mdLead').textContent = m.lead;
  $('mdStats').replaceChildren(
    ...m.stats.map(([v, l]) => {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = v;
      const sm = document.createElement('small');
      sm.textContent = l;
      d.append(b, sm);
      return d;
    }),
  );
  $('mdFeats').replaceChildren(
    ...m.feats.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }),
  );
  const colors = $('mdColors');
  colors.replaceChildren();
  const lab = document.createElement('span');
  lab.textContent = m.colors.length > 1 ? 'Cores:' : 'Cor:';
  colors.append(lab);
  m.colors.forEach(([n, c]) => {
    const dot = document.createElement('i');
    dot.style.background = c;
    dot.title = n;
    const name = document.createElement('span');
    name.textContent = n;
    colors.append(dot, name);
  });
  $('mdNote').textContent =
    (m.extra ? m.extra + ' ' : '') + 'Valores, autonomia e documentação exigida variam por modelo: confirme com a nossa equipe.';
  $('mdWa').href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Olá! Quero saber mais sobre a ${m.name} (preço, cores e autonomia).`)}`;
  $('mdWa').target = '_blank';
  $('mdWa').rel = 'noopener';
  const ph = $('mdPhoto');
  ph.replaceChildren();
  ph.classList.remove('no-photo');
  loadPhoto(ph, id);

  lenis?.stop();
  dlg.showModal();
  dlg.querySelector('.md-body').scrollTop = 0;
}

document.querySelectorAll('.model-card').forEach((card) =>
  card.addEventListener('click', () => openModel(card.dataset.model, card)),
);
dlg.addEventListener('click', (e) => {
  if (e.target === dlg) dlg.close();
});
dlg.addEventListener('close', () => {
  lenis?.start();
  lastCard?.focus({ preventScroll: true });
});
document.getElementById('mdLoja').addEventListener('click', (e) => {
  e.preventDefault();
  dlg.close();
  const el = document.getElementById('loja');
  if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.6 });
  else el.scrollIntoView({ behavior: 'smooth' });
});
