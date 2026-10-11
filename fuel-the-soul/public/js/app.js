/* Fuel The Soul – storefront logic + motion */
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hasGsap = !!window.gsap;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover:hover) and (pointer:fine)').matches;
const animate = hasGsap && !reduce;
if (hasGsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const api = {
  get: (u) => fetch(u).then((r) => r.json()),
  post: (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async (r) => ({ ok: r.ok, data: await r.json() }))
};

const state = {
  store: null, cart: load('fts_cart', []), wish: load('fts_wish', []),
  cat: 'All', sort: 'featured', q: '', view: 'bag', coupon: null, cpMsg: '', cpBad: false, quote: null, order: null
};

/* ---------- placeholder tee (used until the owner uploads photos) ---------- */
const isLight = (hex) => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) * 299) + (((n >> 8) & 255) * 587) + ((n & 255) * 114)) / 1000 > 150; };
const fit = (t) => Math.max(18, Math.min(44, Math.floor((190 / Math.max(t.length, 1)) * 1.9)));
function teeSVG(p) {
  const c = p.color || '#1b1b1a', ink = isLight(c) ? '#1b1b1a' : '#f7f6f2';
  const w = esc(p.name).toUpperCase().split(' '), h = Math.ceil(w.length / 2);
  const l1 = w.slice(0, h).join(' '), l2 = w.slice(h).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480"><rect width="400" height="480" fill="#e7e5df"/><path d="M130 70 L55 110 L30 195 L88 212 L98 182 L98 410 L302 410 L302 182 L312 212 L370 195 L345 110 L270 70 Q200 112 130 70Z" fill="${c}" stroke="rgba(0,0,0,.18)" stroke-width="2"/><g fill="${ink}" font-family="Impact,Arial Narrow,sans-serif" text-anchor="middle"><text x="200" y="${l2 ? 232 : 250}" font-size="${fit(l1)}">${l1}</text>${l2 ? `<text x="200" y="274" font-size="${fit(l2)}">${l2}</text>` : ''}</g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const imgsOf = (p) => (p.images && p.images.length ? p.images : [teeSVG(p)]);
const byId = (id) => state.store.products.find((p) => p.id === id);

/* ---------- toast / scroll lock ---------- */
function toast(msg, label, fn) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${label ? `<button>${esc(label)}</button>` : ''}`;
  if (label) el.querySelector('button').onclick = () => { fn(); el.remove(); };
  $('#toasts').appendChild(el);
  if (animate) gsap.from(el, { y: 30, opacity: 0, duration: .45, ease: 'power3.out' });
  setTimeout(() => { if (animate) gsap.to(el, { opacity: 0, y: 14, duration: .3, onComplete: () => el.remove() }); else el.remove(); }, 3600);
}
const lock = (on) => document.documentElement.classList.toggle('lock', on);

/* ---------- scroll-in reveal for cards ---------- */
function reveal(els) {
  if (!animate) return;
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      gsap.fromTo(e.target, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: .7, delay: i * .07, ease: 'power3.out', clearProps: 'transform,opacity' });
      io.unobserve(e.target);
    });
  }, { threshold: .1 });
  els.forEach((el) => { el.style.opacity = 0; io.observe(el); });
}

/* ---------- loader ---------- */
function loaderIntro() {
  return new Promise((resolve) => {
    if (!animate) return setTimeout(resolve, 200);
    gsap.timeline({ onComplete: resolve })
      .from('.ld-word i', { yPercent: 110, duration: .7, stagger: .12, ease: 'power4.out' })
      .to('.ld-bar b', { scaleX: 1, duration: .8, ease: 'power2.inOut' }, '-=.3');
  });
}
function loaderOut() {
  const l = $('#loader');
  if (!animate) return l.remove();
  gsap.to(l, { yPercent: -100, duration: .9, ease: 'power4.inOut', onComplete: () => l.remove() });
}

/* ---------- init ---------- */
async function init() {
  $('#yr').textContent = new Date().getFullYear();
  const intro = loaderIntro();
  try { state.store = await api.get('/api/store'); }
  catch { $('#loader').remove(); document.body.insertAdjacentHTML('beforeend', '<p class="fatal">Could not load the store. Please refresh.</p>'); return; }
  const live = new Set(state.store.products.filter((p) => p.inStock).map((p) => p.id));
  state.cart = state.cart.filter((i) => live.has(i.id)); save('fts_cart', state.cart);
  renderStatic(); renderShop(false); renderOffers(); updateBadge(); bind(); refreshQuote();
  await intro;
  loaderOut();
  heroIntro();
  scrollFx();
  if (canHover && animate) { cursor(); magnetic(); heroParallax(); }
}

function renderStatic() {
  const s = state.store.settings;
  if (s.announcement?.enabled && s.announcement.text) { $('#announce').hidden = false; $('#announceText').textContent = s.announcement.text; }
  const lines = s.hero.headline.split('\n').filter(Boolean);
  $('#heroTitle').innerHTML = lines.map((l) => `<span class="ln"><span>${esc(l)}</span></span>`).join('');
  $('#heroTitle').setAttribute('aria-label', lines.join(' '));
  $('#heroSub').textContent = s.hero.sub;
  $('#heroCta').textContent = s.hero.cta || 'Shop now';
  const items = s.marquee.split('\n').map((x) => x.trim()).filter(Boolean);
  const one = items.map((t) => `<span>${esc(t)}</span>`).join('');
  $('#ticker').innerHTML = one + one + one + one;
  $('#aboutText').textContent = s.about;
  $('#igBtn').href = $('#igTag').href = $('#fIg').href = s.instagram || '#';
  $('#fWa').href = s.whatsapp ? `https://wa.me/${s.whatsapp}` : '#';
  $('#fMail').href = s.email ? `mailto:${s.email}` : '#';
  renderHeroStage();
}

function renderHeroStage() {
  const all = state.store.products;
  const picks = [...all.filter((p) => p.featured), ...all].filter((p, i, a) => a.indexOf(p) === i).slice(0, 3);
  $('#heroStage').innerHTML = picks.map((p, i) =>
    `<figure class="hc hc${i}" data-open="${p.id}" data-depth="${[.05, .1, .035][i]}"><img src="${esc(imgsOf(p)[0])}" alt="${esc(p.name)}"><figcaption><span>${esc(p.name)}</span><b>${money(p.price)}</b></figcaption></figure>`).join('');
}

/* ---------- hero motion ---------- */
function heroIntro() {
  if (!animate) return;
  gsap.timeline({ defaults: { ease: 'power4.out' } })
    .from('#heroTitle .ln > span', { yPercent: 115, duration: 1.1, stagger: .14 })
    .from('.hero-sub, .hero-cta', { y: 24, opacity: 0, duration: .8, stagger: .1 }, '-=.6')
    .from('.hc', { y: 140, opacity: 0, scale: .9, duration: 1.2, stagger: .15 }, '<')
    .from('.stamp', { scale: 0, duration: 1, ease: 'back.out(1.6)' }, '-=.8');
}
function heroParallax() {
  const hero = $('.hero'); if (!hero) return;
  hero.addEventListener('mousemove', (e) => {
    const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
    $$('.hc').forEach((el) => gsap.to(el, { x: -x * el.dataset.depth * 700, y: -y * el.dataset.depth * 700, duration: 1.1, ease: 'power3.out', overwrite: 'auto' }));
  });
}
function scrollFx() {
  const bar = $('#progress'), hdr = $('#hdr'); let last = 0, tick = false;
  addEventListener('scroll', () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      hdr.classList.toggle('hide', y > last && y > 240 && !$('#menu').classList.contains('open'));
      last = y; tick = false;
    });
  }, { passive: true });
  if (animate && window.ScrollTrigger) {
    $$('.hc').forEach((el, i) => gsap.to(el, { yPercent: [-8, 10, -14][i], ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } }));
    gsap.from('.why-list li', { y: 50, opacity: 0, duration: .8, stagger: .15, ease: 'power3.out', scrollTrigger: { trigger: '.why-list', start: 'top 85%' } });
    gsap.from('.tagline', { y: 70, opacity: 0, duration: 1, ease: 'power4.out', scrollTrigger: { trigger: '.tagline', start: 'top 90%' } });
    gsap.to('.ticker-track', { x: '-=120', ease: 'none', scrollTrigger: { trigger: '.ticker', start: 'top bottom', end: 'bottom top', scrub: .6 } });
  }
}
function cursor() {
  const dot = $('#curDot'), ring = $('#curRing');
  gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
  const dx = gsap.quickTo(dot, 'x', { duration: .08 }), dy = gsap.quickTo(dot, 'y', { duration: .08 });
  const rx = gsap.quickTo(ring, 'x', { duration: .35, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .35, ease: 'power3' });
  addEventListener('mousemove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
  document.addEventListener('mouseover', (e) => ring.classList.toggle('big', !!e.target.closest('a,button,.card-media,.hc,select,input')));
}
function magnetic() {
  $$('.magnetic').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * .25, y: (e.clientY - r.top - r.height / 2) * .35, duration: .4, ease: 'power3.out' });
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1,.4)' }));
  });
}

/* ---------- offers ---------- */
function renderOffers() {
  const list = state.store.offers.filter((o) => o.showOnSite);
  $('#offers').hidden = !list.length;
  $('#navOffers').hidden = !list.length;
  $('#offersList').innerHTML = list.map((o) => `
    <article class="offer">
      <div><h3>${esc(o.title)}</h3>${o.subtitle ? `<p>${esc(o.subtitle)}</p>` : ''}${o.minOrder ? `<small>On orders above ${money(o.minOrder)}</small>` : ''}</div>
      <div class="offer-r">
        ${o.code ? `<button class="code" data-copy="${esc(o.code)}">${esc(o.code)}<span>Tap to copy</span></button>` : ''}
        ${o.endsAt ? `<div class="cd" data-end="${esc(o.endsAt)}" aria-label="Time left"></div>` : ''}
      </div>
    </article>`).join('');
  countdown(); clearInterval(renderOffers.t); renderOffers.t = setInterval(countdown, 1000);
  if (list.length) reveal($$('.offer'));
}
function countdown() {
  $$('.cd').forEach((el) => {
    const ms = new Date(el.dataset.end) - Date.now();
    if (ms <= 0) { el.closest('.offer').remove(); if (!$$('.offer').length) $('#offers').hidden = true; return; }
    const parts = [[Math.floor(ms / 864e5), 'days'], [Math.floor(ms / 36e5) % 24, 'hrs'], [Math.floor(ms / 6e4) % 60, 'min'], [Math.floor(ms / 1e3) % 60, 'sec']];
    el.innerHTML = parts.map(([v, l]) => `<span><b>${String(v).padStart(2, '0')}</b>${l}</span>`).join('');
  });
}

/* ---------- shop grid ---------- */
function card(p) {
  const im = imgsOf(p), off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  return `<article class="card" data-id="${p.id}">
    <button class="card-media" data-open="${p.id}" aria-label="View ${esc(p.name)}">
      <img class="m1" src="${esc(im[0])}" alt="${esc(p.name)}" loading="lazy">
      ${im[1] ? `<img class="m2" src="${esc(im[1])}" alt="" loading="lazy">` : ''}
      ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}${!p.inStock ? '<span class="sold">Sold out</span>' : ''}
      ${p.inStock ? '<span class="qv">Choose size</span>' : ''}
    </button>
    <button class="heart ${state.wish.includes(p.id) ? 'on' : ''}" data-wish="${p.id}" aria-label="Save ${esc(p.name)}">♥</button>
    <div class="card-info"><div><h3>${esc(p.name)}</h3><p class="cat">${esc(p.category)}</p></div>
    <div class="price"><b>${money(p.price)}</b>${off ? `<s>${money(p.mrp)}</s><em>${off}% off</em>` : ''}</div></div>
  </article>`;
}
function renderChips() {
  const cats = ['All', ...new Set(state.store.products.map((p) => p.category))];
  if (state.wish.length) cats.push('Saved');
  if (!cats.includes(state.cat)) state.cat = 'All';
  $('#chips').innerHTML = cats.map((c) => `<button class="chip ${c === state.cat ? 'on' : ''}" data-cat="${esc(c)}" role="tab" aria-selected="${c === state.cat}">${c === 'Saved' ? '♥ Saved' : esc(c)}</button>`).join('');
}
function renderShop(anim = true, firstLoad = !anim) {
  renderChips();
  let list = state.store.products.filter((p) =>
    (state.cat === 'All' || (state.cat === 'Saved' ? state.wish.includes(p.id) : p.category === state.cat)) &&
    (!state.q || (p.name + ' ' + p.category).toLowerCase().includes(state.q)));
  if (state.sort === 'low') list.sort((a, b) => a.price - b.price);
  if (state.sort === 'high') list.sort((a, b) => b.price - a.price);
  if (state.sort === 'new') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#grid').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">Nothing matches that search. Try another word or clear the filters.</div>';
  $('#shopCount').textContent = `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}`;
  if (firstLoad) reveal($$('.card'));
  else if (animate) gsap.from('.card', { y: 40, opacity: 0, duration: .6, stagger: .05, ease: 'power3.out', clearProps: 'all' });
  if (canHover && animate) tilt();
}
function tilt() {
  $$('.card-media').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ---------- product modal ---------- */
function openProduct(id) {
  const p = byId(id); if (!p) return;
  const im = imgsOf(p), off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  let size = p.sizes.length ? '' : 'Free', qty = 1;
  const m = $('#pmodal');
  m.innerHTML = `<div class="pm-card" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
    <button class="x" data-act="close-modal">Close</button>
    <div class="pm-gal"><img id="pmMain" src="${esc(im[0])}" alt="${esc(p.name)}">
      ${im.length > 1 ? `<div class="pm-thumbs">${im.map((s, i) => `<button data-thumb="${i}" class="${i ? '' : 'on'}" aria-label="Photo ${i + 1}"><img src="${esc(s)}" alt=""></button>`).join('')}</div>` : ''}</div>
    <div class="pm-info">
      <div><h2>${esc(p.name)}</h2><p class="cat">${esc(p.category)}</p></div>
      <div class="pm-price"><span>${money(p.price)}</span>${off ? `<s>${money(p.mrp)}</s><em>${off}% off</em>` : ''}</div>
      <p>${esc(p.description)}</p>
      ${p.sizes.length ? `<div><div class="lbl">Size</div><div class="sizes" id="pmSizes">${p.sizes.map((s) => `<button type="button" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
      <div><div class="lbl">Quantity</div><div class="qty"><button data-q="-1" aria-label="Less">−</button><span id="pmQty">1</span><button data-q="1" aria-label="More">+</button></div></div>
      <div class="pm-buy"><button class="btn btn-solid" id="pmAdd" ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Add to bag' : 'Sold out'}</button></div>
    </div></div>`;
  m.classList.add('on'); $('#overlay').classList.add('on'); m.setAttribute('aria-hidden', 'false'); lock(true);
  if (animate) gsap.from('.pm-card', { y: 80, opacity: 0, duration: .55, ease: 'power3.out' });
  m.onclick = (e) => {
    if (e.target === m) return closeAll();
    const t = e.target.closest('[data-thumb]');
    if (t) { $('#pmMain').src = im[t.dataset.thumb]; $$('[data-thumb]', m).forEach((b) => b.classList.toggle('on', b === t)); if (animate) gsap.from('#pmMain', { opacity: .3, duration: .4 }); }
    const s = e.target.closest('[data-size]');
    if (s) { size = s.dataset.size; $$('[data-size]', m).forEach((b) => b.classList.toggle('on', b === s)); }
    const q = e.target.closest('[data-q]');
    if (q) { qty = Math.max(1, Math.min(10, qty + +q.dataset.q)); $('#pmQty').textContent = qty; }
    if (e.target.closest('#pmAdd')) {
      if (!size) {
        if (animate) gsap.fromTo('#pmSizes', { x: -10 }, { x: 0, duration: .6, ease: 'elastic.out(1,.25)' });
        return toast('Pick a size first');
      }
      addToCart(p.id, size, qty);
      flyToCart($('#pmMain'));
      closeAll();
      toast(`${p.name} added`, 'View bag', openCart);
    }
  };
}
function flyToCart(img) {
  if (!animate || !img) return;
  const r = img.getBoundingClientRect(), t = $('#bagBtn').getBoundingClientRect();
  const c = img.cloneNode(); Object.assign(c.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: Math.min(r.width, 260) + 'px', height: Math.min(r.height, 320) + 'px', objectFit: 'cover', zIndex: 140, pointerEvents: 'none', borderRadius: '6px' });
  document.body.appendChild(c);
  gsap.to(c, { left: t.left + t.width / 2 - 15, top: t.top, width: 30, height: 36, opacity: .4, duration: .85, ease: 'power3.inOut', onComplete: () => { c.remove(); bump(); } });
}
function bump() { if (animate) gsap.fromTo('#badge', { scale: 1.9 }, { scale: 1, duration: .7, ease: 'elastic.out(1,.4)' }); }

/* ---------- cart ---------- */
const persist = () => save('fts_cart', state.cart);
const cartCount = () => state.cart.reduce((n, i) => n + i.qty, 0);
const localSub = () => state.cart.reduce((s, i) => s + (byId(i.id)?.price || 0) * i.qty, 0);
const updateBadge = () => { $('#badge').textContent = cartCount(); };

function addToCart(id, size, qty) {
  const f = state.cart.find((i) => i.id === id && i.size === size);
  if (f) f.qty = Math.min(10, f.qty + qty); else state.cart.push({ id, size, qty });
  persist(); updateBadge(); bump(); refreshQuote(true);
}
let qSeq = 0;
async function refreshQuote(rerender) {
  const seq = ++qSeq;
  if (!state.cart.length) { state.quote = null; if (rerender !== false) renderCart(false); updateShip(); return; }
  const { data } = await api.post('/api/quote', { items: state.cart, code: state.coupon });
  if (seq !== qSeq) return;
  state.quote = data;
  if (data.couponError) { state.cpMsg = data.couponError; state.cpBad = true; state.coupon = null; }
  else if (data.couponApplied) { state.cpMsg = `${data.couponApplied} applied. You saved ${money(data.discount)}.`; state.cpBad = false; }
  else { state.cpMsg = ''; }
  if (data.removed > 0) {
    const ok = new Set(data.lines.map((l) => l.id));
    state.cart = state.cart.filter((i) => ok.has(i.id)); persist(); updateBadge();
    toast('Some items are no longer available and were removed.');
  }
  if ($('#cart').classList.contains('on')) renderCart(false); else updateShip();
}
function updateShip() {
  const t = state.store.settings.freeShippingAbove, sub = state.quote ? state.quote.subtotal - state.quote.discount : localSub();
  const rem = Math.max(0, t - sub);
  $('#shipMsg').innerHTML = !state.cart.length || !t ? `Free shipping above ${money(t)}` : rem > 0 ? `Add <b>${money(rem)}</b> more for free shipping` : '<b>Free shipping unlocked.</b>';
  $('#shipFill').style.transform = `scaleX(${t ? Math.min(1, sub / t) : 0})`;
}
function openCart() {
  if (state.view === 'done') state.view = 'bag';
  closeAll(true);
  $('#cart').classList.add('on'); $('#overlay').classList.add('on'); $('#cart').setAttribute('aria-hidden', 'false'); lock(true);
  renderCart(true);
  $('#cart .x').focus({ preventScroll: true });
}
function closeAll(keepLock) {
  ['#cart', '#pmodal'].forEach((s) => { $(s).classList.remove('on'); $(s).setAttribute('aria-hidden', 'true'); });
  $('#overlay').classList.remove('on');
  if (!keepLock) lock(false);
}
const sumHTML = (q) => !q ? '' : `<div class="sum"><div><span>Subtotal</span><span>${money(q.subtotal)}</span></div>${q.discount ? `<div><span>Discount (${esc(q.couponApplied)})</span><span>−${money(q.discount)}</span></div>` : ''}<div><span>Shipping</span><span>${q.shipping ? money(q.shipping) : 'Free'}</span></div><div class="tot"><span>Total</span><span>${money(q.total)}</span></div></div>`;

function renderCart(stagger) {
  const body = $('#cartBody'), foot = $('#cartFoot'), q = state.quote;
  $('#cartTitle').textContent = state.view === 'checkout' ? 'Checkout' : state.view === 'done' ? 'Thank you' : 'Your bag';
  $('#shipBox').hidden = state.view === 'done';
  updateShip();
  if (state.view === 'done') {
    const o = state.order, wa = state.store.settings.whatsapp;
    const text = `Hi Fuel The Soul, I placed order ${o.id}.\n` + o.items.map((i) => `- ${i.name} (${i.size}) x${i.qty}`).join('\n') + `\nTotal: ${money(o.total)}\nName: ${o.customer.name}\n${o.payment === 'WhatsApp' ? 'I would like to pay by UPI.' : 'Cash on delivery.'}`;
    body.innerHTML = `<div class="done"><svg class="tick" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none"/><path d="M14 27l8 8 16-17" fill="none"/></svg><h3>Order placed</h3><p>Order <b>${esc(o.id)}</b> is in. We'll contact you on ${esc(o.customer.phone)} to confirm.</p>
      ${wa ? `<a class="btn ${o.payment === 'WhatsApp' ? 'btn-solid' : 'btn-ghost'}" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(text)}">Send order on WhatsApp</a>` : ''}
      <button class="btn btn-ghost" data-act="keep">Keep shopping</button></div>`;
    foot.hidden = true; return;
  }
  foot.hidden = false;
  if (!state.cart.length) {
    body.innerHTML = '<div class="cart-empty"><p>Your bag is empty.</p><button class="btn btn-solid" data-act="keep">Start with the newest drop</button></div>';
    foot.hidden = true; return;
  }
  if (state.view === 'checkout') {
    body.innerHTML = `<form id="coForm" class="co" novalidate><button type="button" class="link" data-act="back">Back to bag</button><h3>Delivery details</h3>
      <label>Full name<input name="name" required autocomplete="name"></label>
      <label>Phone<input name="phone" inputmode="numeric" maxlength="10" required autocomplete="tel" placeholder="10-digit mobile number"></label>
      <label>Email (optional)<input name="email" type="email" autocomplete="email"></label>
      <label>Address<textarea name="address" rows="3" required autocomplete="street-address"></textarea></label>
      <div class="row2"><label>City<input name="city" required autocomplete="address-level2"></label><label>Pincode<input name="pincode" inputmode="numeric" maxlength="6" required autocomplete="postal-code"></label></div>
      <fieldset class="pay"><legend>How would you like to order?</legend>
        <label class="opt"><input type="radio" name="payment" value="COD" checked><span><b>Cash on delivery</b>Pay when it arrives.</span></label>
        <label class="opt"><input type="radio" name="payment" value="WhatsApp"><span><b>Confirm on WhatsApp</b>Chat with us and pay by UPI.</span></label></fieldset>
      <p class="err" id="coErr"></p></form>`;
    foot.innerHTML = `${sumHTML(q)}<button class="btn btn-solid wide" type="submit" form="coForm" id="placeBtn">Place order for ${money(q ? q.total : localSub())}</button>`;
  } else {
    body.innerHTML = state.cart.map((i) => {
      const p = byId(i.id); if (!p) return '';
      return `<div class="line" data-key="${esc(i.id)}|${esc(i.size)}"><img src="${esc(imgsOf(p)[0])}" alt=""><div><h4>${esc(p.name)}</h4><small>Size ${esc(i.size)}</small>
        <div class="qty"><button data-ql="-1" aria-label="Less">−</button><span>${i.qty}</span><button data-ql="1" aria-label="More">+</button></div>
        <button class="rm" data-rm="1">Remove</button></div><b>${money(p.price * i.qty)}</b></div>`;
    }).join('');
    foot.innerHTML = `<form class="coupon" id="cpForm"><input id="cpInput" placeholder="Coupon code" value="${esc(state.coupon || '')}" autocomplete="off" aria-label="Coupon code"><button class="btn btn-ghost sm">Apply</button></form>
      <p class="cp-msg ${state.cpBad ? 'bad' : ''}">${esc(state.cpMsg)}</p>${sumHTML(q)}<button class="btn btn-solid wide" data-act="checkout">Checkout</button>`;
  }
  if (stagger && animate) gsap.from('.line, .co > *', { x: 40, opacity: 0, duration: .55, stagger: .07, ease: 'power3.out', delay: .15 });
}

function confetti() {
  if (!animate) return;
  const cols = ['#d4201c', '#1b1b1a', '#59602f', '#f7f6f2', '#e6b800'];
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('i'); c.className = 'confetti'; c.style.background = cols[i % cols.length];
    document.body.appendChild(c);
    gsap.fromTo(c, { x: innerWidth * .75, y: innerHeight * .4, rotate: 0, opacity: 1 },
      { x: innerWidth * (.1 + Math.random() * .8), y: innerHeight * (.2 + Math.random() * .8), rotate: Math.random() * 720, opacity: 0, duration: 1.6 + Math.random(), ease: 'power3.out', onComplete: () => c.remove() });
  }
}

async function placeOrder(form) {
  const f = new FormData(form), err = $('#coErr'), btn = $('#placeBtn');
  const customer = Object.fromEntries(['name', 'phone', 'email', 'address', 'city', 'pincode'].map((k) => [k, (f.get(k) || '').trim()]));
  if (!customer.name || !customer.address || !customer.city) { err.textContent = 'Please fill in your name, address and city.'; return; }
  if (!/^\d{10}$/.test(customer.phone)) { err.textContent = 'Enter a 10-digit mobile number.'; return; }
  if (!/^\d{6}$/.test(customer.pincode)) { err.textContent = 'Enter a 6-digit pincode.'; return; }
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Placing order…';
  const { ok, data } = await api.post('/api/orders', { items: state.cart, code: state.coupon, customer, payment: f.get('payment') });
  if (!ok) { err.textContent = data.error || 'Could not place the order. Please try again.'; btn.disabled = false; btn.textContent = 'Place order'; return; }
  state.order = data; state.cart = []; state.coupon = null; state.quote = null; state.cpMsg = ''; persist(); updateBadge();
  state.view = 'done'; renderCart(false); confetti();
}

/* ---------- events ---------- */
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    const open = t.closest('[data-open]'); if (open) return openProduct(open.dataset.open);
    const w = t.closest('[data-wish]');
    if (w) {
      const id = w.dataset.wish, i = state.wish.indexOf(id);
      i < 0 ? state.wish.push(id) : state.wish.splice(i, 1); save('fts_wish', state.wish);
      w.classList.toggle('on', i < 0);
      if (animate) gsap.fromTo(w, { scale: 1.5 }, { scale: 1, duration: .6, ease: 'elastic.out(1,.4)' });
      if (state.cat === 'Saved') renderShop(false); else renderChips();
      return;
    }
    const cat = t.closest('[data-cat]'); if (cat) { state.cat = cat.dataset.cat; renderShop(true); return; }
    const copy = t.closest('[data-copy]');
    if (copy) { navigator.clipboard?.writeText(copy.dataset.copy).catch(() => {}); toast(`Code ${copy.dataset.copy} copied`); return; }
    if (t.closest('#bagBtn')) return openCart();
    if (t.id === 'overlay') return closeAll();
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'close-cart' || act === 'close-modal') closeAll();
    if (act === 'keep') { closeAll(); state.view = 'bag'; $('#shop').scrollIntoView({ behavior: 'smooth' }); }
    if (act === 'checkout') { state.view = 'checkout'; renderCart(true); }
    if (act === 'back') { state.view = 'bag'; renderCart(true); }
    const ql = t.closest('[data-ql]');
    if (ql) {
      const [id, size] = ql.closest('.line').dataset.key.split('|'), it = state.cart.find((i) => i.id === id && i.size === size);
      it.qty = Math.max(1, Math.min(10, it.qty + +ql.dataset.ql)); persist(); updateBadge(); renderCart(false); refreshQuote(false).then(() => renderCart(false));
    }
    if (t.closest('[data-rm]')) {
      const row = t.closest('.line'), [id, size] = row.dataset.key.split('|');
      const done = () => { state.cart = state.cart.filter((i) => !(i.id === id && i.size === size)); persist(); updateBadge(); renderCart(false); refreshQuote(); };
      animate ? gsap.to(row, { x: 80, opacity: 0, height: 0, paddingBlock: 0, duration: .4, ease: 'power2.in', onComplete: done }) : done();
    }
    if (t.closest('#burger')) toggleMenu();
    else if (t.closest('#menu a')) toggleMenu(false);
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'coForm') { e.preventDefault(); placeOrder(e.target); }
    if (e.target.id === 'cpForm') {
      e.preventDefault(); const v = $('#cpInput').value.trim().toUpperCase();
      state.coupon = v || null; state.cpMsg = ''; refreshQuote(false).then(() => renderCart(false));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); toggleMenu(false); } });
  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderShop(true); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderShop(true); });
}
function toggleMenu(force) {
  const m = $('#menu'), b = $('#burger'), on = force ?? !m.classList.contains('open');
  m.classList.toggle('open', on); b.classList.toggle('open', on); b.setAttribute('aria-expanded', on); lock(on);
}

init();
})();
