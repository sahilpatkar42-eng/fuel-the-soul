/* Fuel The Soul – store manager (no coding needed) */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TAGS = ['', 'New', 'Bestseller', 'Limited', 'Sale'];
const STATUS = ['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

let token = sessionStorage.getItem('fts_admin') || '';
let data = null, tab = 'overview', search = '';

async function call(method, url, body, isForm) {
  const res = await fetch(url, {
    method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); }
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}
function toast(msg, bad) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3000);
}
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/* ---------- login ---------- */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#loginErr').textContent = '';
  try { const r = await call('POST', '/api/admin/login', { password: $('#pw').value }); token = r.token; sessionStorage.setItem('fts_admin', token); start(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
function logout() { token = ''; sessionStorage.removeItem('fts_admin'); $('#app').hidden = true; $('#login').hidden = false; }
$('#logout').onclick = logout;
async function start() {
  try { data = await call('GET', '/api/admin/data'); } catch { return; }
  $('#login').hidden = true; $('#app').hidden = false; render();
}

/* ---------- navigation ---------- */
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab; search = ''; render();
});
function render() {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const n = data.orders.filter((o) => o.status === 'New').length;
  $('#newCount').hidden = !n; $('#newCount').textContent = n;
  ({ overview, products, offers, orders, site })[tab]();
}
const view = (html) => { const v = $('#view'); v.onclick = v.onchange = null; v.innerHTML = html; };

/* ---------- overview ---------- */
function overview() {
  const p = data.products, live = data.offers.filter(offerLive);
  const revenue = data.orders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);
  view(`<div class="head"><div><h2>Overview</h2><p>What's happening in your store.</p></div></div>
    <div class="stats">
      <div class="stat"><b>${p.filter((x) => x.visible).length}</b><span>Products on the website</span></div>
      <div class="stat"><b>${p.filter((x) => x.visible && !x.inStock).length}</b><span>Marked sold out</span></div>
      <div class="stat"><b>${live.length}</b><span>Offers live now</span></div>
      <div class="stat"><b>${data.orders.filter((o) => o.status === 'New').length}</b><span>New orders to confirm</span></div>
      <div class="stat"><b>${money(revenue)}</b><span>Order value (excl. cancelled)</span></div>
    </div>
    <div class="tips"><h3>Quick guide</h3><ul>
      <li><b>New design dropped?</b> Products &rarr; Add product. Upload photos, set the price, and it appears on the website straight away.</li>
      <li><b>Sold out?</b> Switch off "In stock" on the product. To hide it completely, switch off "Show on website".</li>
      <li><b>Running a sale?</b> Offers &rarr; Add offer. Set a coupon code, a discount and an end date. The countdown shows on the website.</li>
      <li><b>Change the headline or free-shipping limit?</b> Website text.</li>
    </ul></div>`);
}

/* ---------- products ---------- */
function products() {
  const q = search.toLowerCase();
  const list = data.products.filter((p) => !q || (p.name + p.category).toLowerCase().includes(q));
  view(`<div class="head"><div><h2>Products</h2><p>${data.products.length} in your store. Changes go live instantly.</p></div>
    <div class="acts"><input id="q" type="search" placeholder="Search products" value="${esc(search)}"><button class="btn primary" id="addP">Add product</button></div></div>
    <div class="list">${list.length ? list.map(prodRow).join('') : '<div class="empty">No products yet. Click "Add product" to create your first one.</div>'}</div>`);
  $('#q').oninput = (e) => { search = e.target.value; products(); const i = $('#q'); i.focus(); i.setSelectionRange(99, 99); };
  $('#addP').onclick = () => productForm();
  $('#view').onclick = async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id, p = data.products.find((x) => x.id === id);
    if (!p) return;
    if (e.target.closest('[data-edit]')) productForm(p);
    if (e.target.closest('[data-dup]')) {
      try { const n = await call('POST', '/api/admin/products', { ...p, name: p.name + ' (copy)', visible: false }); data.products.unshift(n); toast('Copied. It is hidden until you switch it on.'); products(); } catch (err) { toast(err.message, true); }
    }
    if (e.target.closest('[data-del]') && confirm(`Delete "${p.name}"? This cannot be undone.`)) {
      try { await call('DELETE', '/api/admin/products/' + id); data.products = data.products.filter((x) => x.id !== id); toast('Product deleted'); products(); } catch (err) { toast(err.message, true); }
    }
  };
  $('#view').onchange = async (e) => {
    const f = e.target.dataset.flag, id = e.target.closest('[data-id]')?.dataset.id; if (!f) return;
    try { const n = await call('PUT', '/api/admin/products/' + id, { [f]: e.target.checked }); data.products[data.products.findIndex((x) => x.id === id)] = n; toast('Saved'); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  };
}
const sw = (flag, on, label) => `<label class="tg"><span class="sw"><input type="checkbox" data-flag="${flag}" ${on ? 'checked' : ''}><i></i></span>${label}</label>`;
function prodRow(p) {
  const off = p.mrp > p.price ? ` <s>${money(p.mrp)}</s>` : '';
  return `<div class="row" data-id="${p.id}">
    ${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : `<div class="thumb" style="--sw:${esc(p.color)}"></div>`}
    <div><h4>${esc(p.name)} ${p.tag ? `<span class="chip">${esc(p.tag)}</span>` : ''}</h4><p>${esc(p.category)}. ${money(p.price)}${off}${p.images.length ? '' : '. No photo yet'}</p></div>
    <div class="controls">${sw('visible', p.visible, 'Show on website')}${sw('inStock', p.inStock, 'In stock')}
      <button class="btn sm" data-edit>Edit</button><button class="btn sm" data-dup>Copy</button><button class="btn sm danger" data-del>Delete</button></div></div>`;
}

function modal(html) { const m = $('#mdl'); m.innerHTML = `<div class="panel">${html}</div>`; m.hidden = false; m.onmousedown = (e) => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#mdl').hidden = true; $('#mdl').innerHTML = ''; }

function productForm(p) {
  const isNew = !p;
  p = p || { name: '', category: '', price: '', mrp: '', description: '', sizes: ['S', 'M', 'L', 'XL'], images: [], color: '#1b1b1a', tag: 'New', inStock: true, visible: true, featured: false };
  let photos = [...p.images];
  const cats = [...new Set(data.products.map((x) => x.category))];
  modal(`<h3>${isNew ? 'Add product' : 'Edit product'}</h3>
    <form id="pf" class="form" style="border:0;padding:0">
      <label>Name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Wander Raglan Tee"></label>
      <div class="g2">
        <label>Category<input name="category" list="cats" value="${esc(p.category)}" placeholder="Pick one or type a new one"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Label on the photo<select name="tag">${TAGS.map((t) => `<option ${t === p.tag ? 'selected' : ''} value="${t}">${t || 'None'}</option>`).join('')}</select></label>
      </div>
      <div class="g2">
        <label>Selling price (₹)<input name="price" type="number" min="0" required value="${esc(p.price)}"></label>
        <label>Original price (₹)<small>Optional. Shown crossed out with the % off.</small><input name="mrp" type="number" min="0" value="${esc(p.mrp || '')}"></label>
      </div>
      <label>Description<textarea name="description" rows="3" placeholder="Fabric, fit, what makes it special">${esc(p.description)}</textarea></label>
      <div><div style="font-weight:600;font-size:.88rem;margin-bottom:6px">Sizes available</div><div class="sizes">${SIZES.map((s) => `<label><input type="checkbox" name="sizes" value="${s}" ${p.sizes.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}</div></div>
      <div><div style="font-weight:600;font-size:.88rem;margin-bottom:6px">Photos <span class="note">The first photo is the main one. A second photo shows when someone hovers.</span></div>
        <div class="photos" id="photos"></div><input type="file" id="file" accept="image/*" multiple hidden></div>
      <label>Placeholder colour<small>Used for the tile until you add a photo.</small><input type="color" name="color" value="${esc(p.color)}"></label>
      <div class="checks">${sw('visible', p.visible, 'Show on website').replace(' data-flag="visible"', ' name="visible"')}${sw('inStock', p.inStock, 'In stock').replace(' data-flag="inStock"', ' name="inStock"')}${sw('featured', p.featured, 'Feature on top').replace(' data-flag="featured"', ' name="featured"')}</div>
      <p class="err" id="pfErr"></p>
      <div class="foot-acts"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary" id="saveP">${isNew ? 'Add product' : 'Save changes'}</button></div>
    </form>`);
  const draw = () => {
    $('#photos').innerHTML = photos.map((u, i) => `<div class="ph ${i ? '' : 'main'}"><img src="${esc(u)}" alt=""><button type="button" class="rm" data-rm="${i}">Remove</button>${i ? `<button type="button" class="mk" data-main="${i}">Make main</button>` : ''}</div>`).join('') +
      '<div class="drop" id="drop">Add photos</div>';
  };
  draw();
  const upload = async (files) => {
    const fd = new FormData(); [...files].forEach((f) => fd.append('images', f));
    $('#pfErr').textContent = ''; $('#drop').textContent = 'Uploading…';
    try { const r = await call('POST', '/api/admin/upload', fd, true); photos = [...photos, ...r.urls].slice(0, 8); } catch (err) { $('#pfErr').textContent = err.message; }
    draw();
  };
  $('#photos').onclick = (e) => {
    if (e.target.id === 'drop') return $('#file').click();
    const rm = e.target.closest('[data-rm]'), mk = e.target.closest('[data-main]');
    if (rm) photos.splice(+rm.dataset.rm, 1);
    if (mk) photos.unshift(photos.splice(+mk.dataset.main, 1)[0]);
    draw();
  };
  $('#photos').ondragover = (e) => { e.preventDefault(); };
  $('#photos').ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); };
  $('#file').onchange = (e) => { if (e.target.files.length) upload(e.target.files); e.target.value = ''; };
  $('#cancel').onclick = closeModal;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), body = {
      name: f.get('name'), category: f.get('category'), tag: f.get('tag'), price: f.get('price'), mrp: f.get('mrp'),
      description: f.get('description'), sizes: f.getAll('sizes'), images: photos, color: f.get('color'),
      visible: f.has('visible'), inStock: f.has('inStock'), featured: f.has('featured')
    };
    if (body.mrp && +body.mrp < +body.price) { $('#pfErr').textContent = 'Original price should be higher than the selling price.'; return; }
    $('#saveP').disabled = true;
    try {
      const r = isNew ? await call('POST', '/api/admin/products', body) : await call('PUT', '/api/admin/products/' + p.id, body);
      if (isNew) data.products.unshift(r); else data.products[data.products.findIndex((x) => x.id === p.id)] = r;
      closeModal(); toast(isNew ? 'Product added' : 'Changes saved'); products();
    } catch (err) { $('#pfErr').textContent = err.message; $('#saveP').disabled = false; }
  };
}

/* ---------- offers ---------- */
function offerLive(o) { return o.active && (!o.startsAt || new Date(o.startsAt) <= new Date()) && (!o.endsAt || new Date(o.endsAt) > new Date()); }
function offerStatus(o) {
  if (!o.active) return ['Off', 'off'];
  if (o.endsAt && new Date(o.endsAt) <= new Date()) return ['Ended', 'off'];
  if (o.startsAt && new Date(o.startsAt) > new Date()) return ['Scheduled', 'sched'];
  return ['Live', 'live'];
}
function offers() {
  view(`<div class="head"><div><h2>Offers and coupons</h2><p>Banners with countdowns and discount codes customers can use at checkout.</p></div><button class="btn primary" id="addO">Add offer</button></div>
    <div class="list">${data.offers.length ? data.offers.map((o) => {
      const [label, cls] = offerStatus(o);
      const disc = o.discountType === 'flat' ? `${money(o.value)} off` : `${o.value}% off`;
      return `<div class="row" style="grid-template-columns:1fr auto" data-id="${o.id}"><div><h4>${esc(o.title)} <span class="chip ${cls}">${label}</span></h4>
        <p>${o.code ? `Code <b>${esc(o.code)}</b>: ${disc}` : 'Banner only, no code'}${o.minOrder ? `, min order ${money(o.minOrder)}` : ''}${o.endsAt ? `. Ends ${new Date(o.endsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p></div>
        <div class="controls">${sw('active', o.active, 'Active')}<button class="btn sm" data-edit>Edit</button><button class="btn sm danger" data-del>Delete</button></div></div>`;
    }).join('') : '<div class="empty">No offers yet. Add one to show a banner and a coupon code on your website.</div>'}</div>`);
  $('#addO').onclick = () => offerForm();
  $('#view').onclick = async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id, o = data.offers.find((x) => x.id === id); if (!o) return;
    if (e.target.closest('[data-edit]')) offerForm(o);
    if (e.target.closest('[data-del]') && confirm(`Delete "${o.title}"?`)) {
      try { await call('DELETE', '/api/admin/offers/' + id); data.offers = data.offers.filter((x) => x.id !== id); toast('Offer deleted'); offers(); } catch (err) { toast(err.message, true); }
    }
  };
  $('#view').onchange = async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id; if (!e.target.dataset.flag) return;
    try { const n = await call('PUT', '/api/admin/offers/' + id, { active: e.target.checked }); data.offers[data.offers.findIndex((x) => x.id === id)] = n; toast('Saved'); offers(); } catch (err) { toast(err.message, true); }
  };
}
function offerForm(o) {
  const isNew = !o;
  o = o || { title: '', subtitle: '', code: '', discountType: 'percent', value: 10, minOrder: 0, startsAt: '', endsAt: '', active: true, showOnSite: true };
  modal(`<h3>${isNew ? 'Add offer' : 'Edit offer'}</h3>
    <form id="of" class="form" style="border:0;padding:0">
      <label>Title shown on the website<input name="title" required maxlength="80" value="${esc(o.title)}" placeholder="e.g. Diwali sale: 20% off everything"></label>
      <label>Short line underneath<input name="subtitle" maxlength="160" value="${esc(o.subtitle)}"></label>
      <fieldset><legend>Discount code (optional)</legend>
        <label>Code<small>Letters and numbers only. Leave empty for a banner without a code.</small><input name="code" maxlength="20" value="${esc(o.code)}" placeholder="DIWALI20" style="text-transform:uppercase"></label>
        <div class="g2"><label>Type<select name="discountType"><option value="percent" ${o.discountType === 'percent' ? 'selected' : ''}>Percentage off</option><option value="flat" ${o.discountType === 'flat' ? 'selected' : ''}>Flat ₹ off</option></select></label>
        <label>Amount<input name="value" type="number" min="0" value="${esc(o.value)}"></label></div>
        <label>Minimum order (₹)<input name="minOrder" type="number" min="0" value="${esc(o.minOrder || 0)}"></label></fieldset>
      <div class="g2"><label>Starts<small>Leave empty to start now.</small><input name="startsAt" type="datetime-local" value="${toLocalInput(o.startsAt)}"></label>
      <label>Ends<small>The website shows a countdown to this time.</small><input name="endsAt" type="datetime-local" value="${toLocalInput(o.endsAt)}"></label></div>
      <div class="checks">${sw('active', o.active, 'Active').replace(' data-flag="active"', ' name="active"')}${sw('showOnSite', o.showOnSite, 'Show banner on website').replace(' data-flag="showOnSite"', ' name="showOnSite"')}</div>
      <p class="err" id="ofErr"></p>
      <div class="foot-acts"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">${isNew ? 'Add offer' : 'Save changes'}</button></div></form>`);
  $('#cancel').onclick = closeModal;
  $('#of').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const body = { title: f.get('title'), subtitle: f.get('subtitle'), code: f.get('code'), discountType: f.get('discountType'), value: f.get('value'), minOrder: f.get('minOrder'),
      startsAt: f.get('startsAt') ? new Date(f.get('startsAt')).toISOString() : '', endsAt: f.get('endsAt') ? new Date(f.get('endsAt')).toISOString() : '', active: f.has('active'), showOnSite: f.has('showOnSite') };
    if (body.code && !(+body.value > 0)) { $('#ofErr').textContent = 'Enter a discount amount above 0.'; return; }
    try {
      const r = isNew ? await call('POST', '/api/admin/offers', body) : await call('PUT', '/api/admin/offers/' + o.id, body);
      if (isNew) data.offers.unshift(r); else data.offers[data.offers.findIndex((x) => x.id === o.id)] = r;
      closeModal(); toast('Offer saved'); offers();
    } catch (err) { $('#ofErr').textContent = err.message; }
  };
}

/* ---------- orders ---------- */
function orders() {
  view(`<div class="head"><div><h2>Orders</h2><p>Update the status as you confirm and ship. Customers are contacted on the phone number they gave.</p></div></div>
    <div class="list">${data.orders.length ? data.orders.map((o) => `
    <div class="order" data-id="${esc(o.id)}"><header><div><b>${esc(o.id)}</b> <span class="chip ${o.status === 'New' ? 'new' : ''}">${esc(o.status)}</span>
      <span class="note"> ${new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      <select data-status style="width:auto">${STATUS.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></header>
      <table>${o.items.map((i) => `<tr><td>${esc(i.name)} (${esc(i.size)}) × ${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}
      ${o.discount ? `<tr><td>Discount ${esc(o.coupon || '')}</td><td>−${money(o.discount)}</td></tr>` : ''}<tr><td>Shipping</td><td>${o.shipping ? money(o.shipping) : 'Free'}</td></tr>
      <tr><td><b>Total (${o.payment === 'COD' ? 'cash on delivery' : 'WhatsApp / UPI'})</b></td><td><b>${money(o.total)}</b></td></tr></table>
      <div class="meta"><div><b>${esc(o.customer.name)}</b><br>${esc(o.customer.phone)}${o.customer.email ? '<br>' + esc(o.customer.email) : ''}</div>
      <div>${esc(o.customer.address)}<br>${esc(o.customer.city)} ${esc(o.customer.pincode)}</div>
      <div><a href="https://wa.me/91${esc(o.customer.phone)}" target="_blank" rel="noopener">Message on WhatsApp</a><br><a href="tel:+91${esc(o.customer.phone)}">Call customer</a></div></div></div>`).join('')
    : '<div class="empty">No orders yet. They will show up here the moment a customer checks out.</div>'}</div>`);
  $('#view').onchange = async (e) => {
    if (!e.target.matches('[data-status]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try { const n = await call('PUT', '/api/admin/orders/' + id, { status: e.target.value }); data.orders[data.orders.findIndex((x) => x.id === id)] = n; toast('Status updated'); orders(); render(); } catch (err) { toast(err.message, true); }
  };
}

/* ---------- website text + settings ---------- */
function site() {
  const s = data.settings;
  view(`<div class="head"><div><h2>Website text</h2><p>Headline, banner and contact details shown across the site.</p></div></div>
    <form class="form" id="sf">
      <fieldset><legend>Top announcement bar</legend>
        <div class="checks">${sw('x', s.announcement.enabled, 'Show the bar').replace(' data-flag="x"', ' name="annOn"')}</div>
        <label>Message<input name="annText" maxlength="200" value="${esc(s.announcement.text)}"></label></fieldset>
      <fieldset><legend>Homepage</legend>
        <label>Big headline<small>Press Enter to start a new line. Two short lines look best.</small><textarea name="headline" rows="2" maxlength="80">${esc(s.hero.headline)}</textarea></label>
        <label>Sub text<textarea name="sub" rows="2" maxlength="300">${esc(s.hero.sub)}</textarea></label>
        <label>Main button text<input name="cta" maxlength="30" value="${esc(s.hero.cta)}"></label>
        <label>Scrolling strip<small>One phrase per line.</small><textarea name="marquee" rows="4">${esc(s.marquee)}</textarea></label>
        <label>About paragraph<textarea name="about" rows="3" maxlength="600">${esc(s.about)}</textarea></label></fieldset>
      <fieldset><legend>Shipping</legend><div class="g2">
        <label>Free shipping above (₹)<input name="free" type="number" min="0" value="${esc(s.freeShippingAbove)}"></label>
        <label>Shipping fee below that (₹)<input name="fee" type="number" min="0" value="${esc(s.shippingFee)}"></label></div></fieldset>
      <fieldset><legend>Contact</legend>
        <label>WhatsApp number<small>With country code, no + or spaces. Example: 919876543210</small><input name="wa" value="${esc(s.whatsapp)}"></label>
        <label>Instagram link<input name="ig" value="${esc(s.instagram)}"></label>
        <label>Email<input name="mail" type="email" value="${esc(s.email)}"></label></fieldset>
      <p class="err" id="sfErr"></p>
      <div class="foot-acts"><button class="btn primary">Save changes</button></div></form>`);
  $('#sf').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const body = { announcement: { enabled: f.has('annOn'), text: f.get('annText') }, hero: { headline: f.get('headline'), sub: f.get('sub'), cta: f.get('cta') },
      marquee: f.get('marquee'), about: f.get('about'), freeShippingAbove: f.get('free'), shippingFee: f.get('fee'), whatsapp: f.get('wa'), instagram: f.get('ig'), email: f.get('mail') };
    try { data.settings = await call('PUT', '/api/admin/settings', body); toast('Website updated'); site(); } catch (err) { $('#sfErr').textContent = err.message; }
  };
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#mdl').hidden) closeModal(); });
if (token) start();
})();
