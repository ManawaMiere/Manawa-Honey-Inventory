# Manawa Honey — Stock App

A web app for tracking honey stock across **Waitawa** (production shed) and **Mataatua** (labelling shed), with shed transfers, full history, low-stock alerts, team logins, Excel export, and **offline support**. Works on phones and computers.

It replaces the Mobile Inventory app. All ~30 products from your file are loaded, with duplicate names grouped (e.g. *Manuka 500g* and its 4 batches show as one product with batches underneath).

## Files

- `index.html` — the app
- `sw.js` — service worker (makes it load offline). Must sit next to index.html.
- `manifest.json` — lets staff install it to the home screen
- `icon.svg` — app icon
- `supabase_setup.sql` — run once in Supabase to build the tables + load data
- `SETUP_GUIDE.md` — this file

Keep all of these in the **same folder** (and the same folder on GitHub Pages). Offline support needs the app served over https or from `localhost` — GitHub Pages already is.

---

## 1. Open it (works straight away)

Open `index.html`, or drop the whole folder on your GitHub Pages site.

**First sign-in:** username `admin`, password `admin`. Add your real team under the **Team** tab, then remove or change `admin`.

Out of the box it stores data **on that one device**. To share stock across every phone and computer, turn on cloud sync (section 3).

## Install on a phone (recommended for the sheds)

Open the site in the phone's browser, then **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome: menu → Install app). It then opens like a normal app, full screen, and works offline.

---

## 2. How staff use it

From the **Stock** screen, tap a product to open its batches, then use the buttons on a batch:

- **Move** — transfer between sheds in one step (defaults Waitawa → Mataatua, your daily transfer). Subtracts one shed, adds the other, and records both sides.
- **In** — new stock arriving.
- **Out** — stock leaving (sold, used, written off).
- **Adjust** — fix a balance after a stocktake (enter the new counted number).

Every action takes an optional note, records who and when, and shows a before → after preview. A red **LOW** tag and a banner appear when a batch falls below its Min Stock Alert. Each product shows **Waitawa | Mataatua** side by side — moving stock shifts where it sits without changing the total.

---

## 3. Cloud sync (shared across devices)

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase_setup.sql` → **Run**.
2. In the app → **Settings & Export**, paste your **Project URL** and **anon key** (Supabase → Project Settings → API) → **Save & connect**.

Every device on the same project then shows the same live stock.

---

## 4. Working offline

Once a device has opened the app online once, it keeps working with no signal:

- **The app loads offline** — the service worker caches it on first visit.
- **Local-only mode** runs fully offline; everything is on the device.
- **Cloud mode** keeps working offline too. Changes are saved on the device and **sync automatically when signal returns**. The badge in the top bar shows the state:
  - **Synced** — everything's up to date.
  - **Offline · N waiting** — you're offline and N changes are queued (tap to retry).
  - **Syncing N…** — back online, sending queued changes now.
  - **On this device** — local-only mode (cloud sync not turned on).

What needs a connection: the **very first** visit on a device (to cache the app), and the **first sign-in** in cloud mode (to fetch your team logins). After that, both work offline.

A note on conflicts: if two people edit the same batch while offline, the last change to reach Supabase wins. For normal shed use — different people, different products — this is rarely an issue.

---

## Updating the app later

Because the service worker caches files, after you replace any file on GitHub Pages, bump the version so devices pick it up: open `sw.js` and change `manawa-v1` to `manawa-v2`. Phones refresh to the new version next time they're online.

---

## Notes & honest limitations

- Logins use a SHA-256 password hash — fine for a small internal team, not bank-grade. Can move to Supabase's built-in Auth later.
- The SQL opens row-level security to the anon key so the app can read/write. Fine for an internal tool; lock down further if the keys ever go public.
- "Delete" removes a batch but its past movements stay in History.
