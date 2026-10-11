/* Fuel The Soul – server
   Express API + static hosting. Data lives in data/db.json (no database setup needed). */
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const userRoutes = require('./userRoutes');
const app = express();
app.use('/api/users', userRoutes);
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fuelthesoul@123';
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- tiny JSON "database" ---------- */
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (db) => {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic write, avoids half-saved files
};
const uid = (p) => `${p}_${crypto.randomBytes(4).toString('hex')}`;
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v) => Math.max(0, Number(v) || 0);
const validDate = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); };
const isLive = (o) =>
  o.active && (!o.startsAt || new Date(o.startsAt) <= new Date()) && (!o.endsAt || new Date(o.endsAt) > new Date());

app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- admin auth ---------- */
const sessions = new Map(); // token -> expiry
const fails = {};           // ip -> { n, until }
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) { sessions.delete(t); return res.status(401).json({ error: 'Please log in again.' }); }
  next();
};

app.post('/api/admin/login', (req, res) => {
  const f = fails[req.ip] || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in 5 minutes.' });
  const given = Buffer.from(String(req.body.password || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!ok) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 5 * 60e3; f.n = 0; }
    fails[req.ip] = f;
    return res.status(401).json({ error: 'Wrong password.' });
  }
  delete fails[req.ip];
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 12 * 3600e3);
  res.json({ token });
});

/* ---------- public storefront API ---------- */
app.get('/api/store', (req, res) => {
  const db = readDB();
  const products = db.products
    .filter((p) => p.visible)
    .sort((a, b) => (b.featured - a.featured) || (new Date(b.createdAt) - new Date(a.createdAt)));
  const offers = db.offers.filter(isLive).map(({ id, title, subtitle, code, discountType, value, minOrder, endsAt, showOnSite }) =>
    ({ id, title, subtitle, code, discountType, value, minOrder, endsAt, showOnSite }));
  res.json({ settings: db.settings, products, offers });
});

/* price calculation – always done on the server so prices can't be tampered with */
function quote(db, rawItems, code) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const lines = [];
  for (const it of items) {
    const p = db.products.find((x) => x.id === it.id && x.visible && x.inStock);
    if (!p) continue;
    lines.push({
      id: p.id, name: p.name, size: str(it.size, 10), qty: Math.max(1, Math.min(10, parseInt(it.qty) || 1)),
      price: p.price, image: p.images[0] || ''
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0, couponApplied = null, couponError = null;
  if (code) {
    const c = str(code, 20).toUpperCase();
    const o = db.offers.find((x) => x.code && x.code === c);
    if (!o || !isLive(o)) couponError = 'That code is not valid right now.';
    else if (subtotal < (o.minOrder || 0)) couponError = `Add ₹${o.minOrder - subtotal} more to use ${c}.`;
    else {
      discount = o.discountType === 'flat' ? Math.min(o.value, subtotal) : Math.round((subtotal * o.value) / 100);
      couponApplied = c;
    }
  }
  const after = subtotal - discount;
  const s = db.settings;
  const shipping = !lines.length || after >= s.freeShippingAbove ? 0 : s.shippingFee;
  return { lines, subtotal, discount, shipping, total: after + shipping, couponApplied, couponError, removed: items.length - lines.length };
}

app.post('/api/quote', (req, res) => res.json(quote(readDB(), req.body.items, req.body.code)));

app.post('/api/orders', (req, res) => {
  const db = readDB();
  const q = quote(db, req.body.items, req.body.code);
  const c = req.body.customer || {};
  if (!q.lines.length) return res.status(400).json({ error: 'Your bag has no available items.' });
  if (!str(c.name) || !/^\d{10}$/.test(str(c.phone)) || !str(c.address) || !str(c.city) || !/^\d{6}$/.test(str(c.pincode)))
    return res.status(400).json({ error: 'Please fill in name, 10-digit phone, address, city and 6-digit pincode.' });
  const order = {
    id: `FTS-${1001 + db.orders.length}`,
    items: q.lines, subtotal: q.subtotal, discount: q.discount, shipping: q.shipping, total: q.total,
    coupon: q.couponApplied,
    customer: { name: str(c.name, 80), phone: str(c.phone), email: str(c.email, 100), address: str(c.address, 300), city: str(c.city, 60), pincode: str(c.pincode) },
    payment: req.body.payment === 'WhatsApp' ? 'WhatsApp' : 'COD',
    status: 'New', createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  writeDB(db);
  res.json(order);
});

/* ---------- admin API ---------- */
app.get('/api/admin/data', auth, (req, res) => {
  const db = readDB();
  db.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(db);
});

const cleanProduct = (b, existing = {}) => {
  const m = { ...existing, ...b };
  return {
    ...existing,
    name: str(m.name, 120),
    category: str(m.category, 40) || 'Tees',
    price: num(m.price),
    mrp: num(m.mrp),
    description: str(m.description, 800),
    sizes: Array.isArray(m.sizes) ? m.sizes.map((s) => str(s, 8)).filter(Boolean) : [],
    images: Array.isArray(m.images) ? m.images.filter((s) => typeof s === 'string' && s.startsWith('/uploads/')).slice(0, 8) : [],
    color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#1b1b1a',
    tag: str(m.tag, 20),
    inStock: !!m.inStock, visible: !!m.visible, featured: !!m.featured
  };
};

app.post('/api/admin/products', auth, (req, res) => {
  const db = readDB();
  const p = { id: uid('p'), createdAt: new Date().toISOString(), ...cleanProduct(req.body) };
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  db.products.unshift(p);
  writeDB(db); res.json(p);
});
app.put('/api/admin/products/:id', auth, (req, res) => {
  const db = readDB();
  const i = db.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Product not found.' });
  const p = cleanProduct(req.body, db.products[i]);
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  db.products[i] = p; writeDB(db); res.json(p);
});
app.delete('/api/admin/products/:id', auth, (req, res) => {
  const db = readDB();
  db.products = db.products.filter((p) => p.id !== req.params.id);
  writeDB(db); res.json({ ok: true });
});

const cleanOffer = (b) => ({
  title: str(b.title, 80), subtitle: str(b.subtitle, 160),
  code: str(b.code, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
  discountType: b.discountType === 'flat' ? 'flat' : 'percent',
  value: b.discountType === 'flat' ? num(b.value) : Math.min(100, num(b.value)),
  minOrder: num(b.minOrder), startsAt: validDate(b.startsAt), endsAt: validDate(b.endsAt),
  active: !!b.active, showOnSite: !!b.showOnSite
});
app.post('/api/admin/offers', auth, (req, res) => {
  const db = readDB(); const o = { id: uid('o'), ...cleanOffer(req.body) };
  if (!o.title) return res.status(400).json({ error: 'Give the offer a title.' });
  db.offers.unshift(o); writeDB(db); res.json(o);
});
app.put('/api/admin/offers/:id', auth, (req, res) => {
  const db = readDB(); const i = db.offers.findIndex((o) => o.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Offer not found.' });
  const o = { id: db.offers[i].id, ...cleanOffer({ ...db.offers[i], ...req.body }) };
  if (!o.title) return res.status(400).json({ error: 'Give the offer a title.' });
  db.offers[i] = o; writeDB(db); res.json(o);
});
app.delete('/api/admin/offers/:id', auth, (req, res) => {
  const db = readDB(); db.offers = db.offers.filter((o) => o.id !== req.params.id); writeDB(db); res.json({ ok: true });
});

app.put('/api/admin/settings', auth, (req, res) => {
  const db = readDB(); const b = req.body || {}; const s = db.settings;
  s.announcement = { enabled: !!b.announcement?.enabled, text: str(b.announcement?.text, 200) };
  s.hero = { headline: str(b.hero?.headline, 80), sub: str(b.hero?.sub, 300), cta: str(b.hero?.cta, 30) };
  s.marquee = str(b.marquee, 600);
  s.about = str(b.about, 600);
  s.freeShippingAbove = num(b.freeShippingAbove);
  s.shippingFee = num(b.shippingFee);
  s.whatsapp = str(b.whatsapp, 20).replace(/\D/g, '');
  s.instagram = /^https?:\/\//.test(str(b.instagram, 200)) ? str(b.instagram, 200) : '';
  s.email = str(b.email, 100);
  writeDB(db); res.json(s);
});

app.put('/api/admin/orders/:id', auth, (req, res) => {
  const db = readDB(); const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'].includes(req.body.status)) o.status = req.body.status;
  writeDB(db); res.json(o);
});

/* image uploads */
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${EXT[file.mimetype]}`)
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG, WebP, GIF or AVIF images are allowed.')))
});
app.post('/api/admin/upload', auth, (req, res) =>
  upload.array('images', 8)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ urls: req.files.map((f) => '/uploads/' + f.filename) });
  }));

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });

app.listen(PORT, () => {
  console.log(`\n  Fuel The Soul is running\n  Website: http://localhost:${PORT}\n  Admin:   http://localhost:${PORT}/admin/\n`);
  if (!process.env.ADMIN_PASSWORD) console.log('  ⚠ Using the default admin password. Create a .env file and set ADMIN_PASSWORD before going live.\n');
});
