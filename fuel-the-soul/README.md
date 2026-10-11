# Fuel The Soul – website + store manager

A streetwear storefront (desktop + mobile) with a no-code admin panel.
The owner can add or remove products, run offers and coupons, change homepage text and manage orders from a browser, with no code.

## 1. Run it in VS Code

1. Install **Node.js 18+** from https://nodejs.org
2. Open this folder in VS Code (File > Open Folder).
3. Open the terminal (Ctrl + `) and run:

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
```

4. Open `.env` and set a strong `ADMIN_PASSWORD`.
5. Start the site:

```bash
npm start
```

- Website: http://localhost:3000
- Store manager: http://localhost:3000/admin/

## 2. Using the store manager (no coding)

| I want to… | Go to |
|---|---|
| Add a new tee | Products > Add product. Upload photos, set price, tick sizes, save. It is live instantly. |
| Mark something sold out | Products, switch off **In stock** |
| Remove a tee from the site | Products, switch off **Show on website** (or Delete) |
| Put a product at the top | Edit product, switch on **Feature on top** |
| Run a sale or coupon | Offers > Add offer. Set code, discount, end date. A countdown banner appears on the site. |
| Change headline / free-shipping limit / WhatsApp | Website text |
| See and update orders | Orders |

## 3. File structure

```
server.js            API, admin login, image upload, price calculation
data/db.json         All products, offers, orders and settings (back this up!)
public/
  index.html         Storefront
  css/style.css      Storefront design
  js/app.js          Storefront logic + GSAP animations
  admin/             Store manager (index.html, admin.css, admin.js)
  uploads/           Product photos uploaded from the admin
```

## 4. Going live

- Needs a host that runs Node.js (Render, Railway, a VPS, etc.). Set the `ADMIN_PASSWORD` environment variable there.
- Keep `data/` and `public/uploads/` on **persistent storage**, or the owner's changes will be lost when the server restarts. Most free tiers wipe the disk, so use a paid disk or a VPS.
- Put the site behind HTTPS (your host usually does this) so the admin password is encrypted.
- Back up `data/db.json` and `public/uploads/` regularly.

## 5. Good to know

- Prices are always recalculated on the server, so customers cannot change them in the browser.
- Checkout currently supports **Cash on delivery** and **Confirm on WhatsApp**. Online payment (Razorpay / Cashfree / UPI gateway) is the next step if you want it.
- The sample products use placeholder prices and colour tiles. Replace them with real photos in Products > Edit.
- Replace the placeholder WhatsApp number in Website text.
