# Manawa Honey — Stock App

A web app for tracking honey stock across **Waitawa** (production shed) and **Mataatua** (labelling shed): shed transfers, batch tracking, full history, low-stock alerts, team logins, Excel import/export, QR labels + camera scanning, offline support, and cloud sync shared across every device.

The app now has your Supabase connection **built in**, so devices connect automatically — no per-device setup.

---

## Files (keep them all in the same folder / same GitHub Pages site)

- `index.html` — the app (your Supabase connection is baked in)
- `sw.js` — service worker (offline support)
- `manifest.json` — home-screen install
- `icon.svg`, `icon-192.png`, `icon-512.png` — app icons (the bee)
- `supabase_setup.sql` — run once in Supabase to build the tables
- `Manawa_Honey_Import_Template.xlsx` — spreadsheet to bulk-load stock
- `SETUP_GUIDE.md` — this file

---

## One-time Supabase setup

1. In your Supabase project → **SQL Editor** → **New query**.
2. Paste all of `supabase_setup.sql` → **Run**. This creates the tables and the default `admin` login. It's safe to re-run any time (it only adds what's missing).

That's it — the app already knows your Project URL and publishable key.

**If sync ever gets stuck ("N waiting"),** it's almost always a missing column. Run this once and it clears:

```sql
alter table transactions add column if not exists batch text;
alter table products add column if not exists date text;
alter table products add column if not exists blend text;
alter table products add column if not exists woo_id text;
alter table products add column if not exists woo_variation_id text;
```

---

## Deploy

Push all the files above to your **GitHub Pages** site (same folder). GitHub Pages is HTTPS, which the app needs for install, camera scanning and offline to work.

When you change any file later, bump the version in `sw.js` (e.g. `manawa-v6` → `manawa-v7`) so devices pick up the update on their next online visit.

---

## First run

Open the site. It auto-connects to cloud (Settings shows **Cloud sync (built-in)**).

**Sign in:** `admin` / `admin`. Add your real team under the **Team** tab, then remove or change `admin`. Anyone signed in can manage team logins.

The app starts **empty** — load your stock with **Settings & Export → Import from .xlsx** (use the template), or add products in-app.

### Stay logged in / install on phones
- Tick **Stay logged in** at sign-in to stay signed in on that device.
- **Install:** Android/Chrome → the **Install app** button in Settings. iPhone/iPad → Share → **Add to Home Screen**. It then opens full-screen and works offline.

---

## Using it (staff)

From the **Stock** screen, tap a product to open its batches, then use the batch buttons:

- **Move** — transfer between sheds in one step (defaults Waitawa → Mataatua).
- **In** — new stock arriving. **Out** — stock leaving. **Adjust** — fix a balance after a stocktake.
- **Label** — print a QR label for that batch. **Edit** — change batch details.

**Scan** (toolbar) opens the camera; scan a jar's QR to jump straight to Move/In/Out/Adjust for that batch. **Labels** prints QR labels for whatever's currently shown.

Products are grouped by **name + blend + MGO**, so different blends/grades show separately. Each product's **reorder point** is set once and applies to all its batches; low stock is judged on the combined total.

Search matches product, batch, MGO, blend, and shed words ("waitawa"/"production", "mataatua"/"labelling"). The filter dropdown adds In stock, Zero, Low, and per-shed views.

---

## Sync & offline

- The badge in the top bar shows the state: **Synced**, **Syncing N…**, **Offline · N waiting** (tap to sync now), or **On this device** (local only).
- Once a device has loaded the app online once, it keeps working with no signal; changes queue and sync automatically when back online (and retry every 20s).
- A device needs a connection for its **first** load and **first sign-in**; after that it's offline-capable.

---

## Export / import / backup

- **Export** a workbook (grouped + per-batch stock + full history). Choose layout (grouped / each batch separate) and scope (all / with jars / empty).
- **Import** stock from a spreadsheet — Merge (update + add) or Replace all. Blank cells keep existing values.
- **Download import template** gives a ready-to-fill sheet from live data.
- **Wipe all data** (Settings) clears all products + history everywhere (keeps logins) — it asks you to type WIPE. Export a backup first.

---

## Notes & limitations

- Logins use a SHA-256 hash — fine for an internal team, not bank-grade. Ask if you want to move to Supabase Auth.
- The publishable key in the app is a **public** client key — safe to embed; access is controlled by row-level security. Never put the **secret/service_role** key in the app.
- "Delete" removes a batch but its past movements stay in History.
