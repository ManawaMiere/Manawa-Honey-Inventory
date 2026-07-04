# WooCommerce stock push — setup

This pushes finished stock from the app to your WooCommerce store so the website shows true availability. It runs **one-way** (app → website) to start, via a Supabase Edge Function that holds your store keys safely server-side.

## How it works

The app never talks to WooCommerce directly (that would expose your store keys in the browser). Instead:

1. You tap **Push stock to WooCommerce** in the app's Settings.
2. That calls the **woo-push** Edge Function on your Supabase project.
3. The function reads current stock from your `products` table, works out the sellable quantity per product, and sets it on the matching WooCommerce products using the store's batch API.

By default it pushes the **combined total** (Waitawa + Mataatua) as the sellable number, matching what you asked for. You can switch it to Mataatua-only (finished jars) or Waitawa with one setting.

## One-time setup

### 1. Link each product to WooCommerce
In the app, edit a product and fill in **WooCommerce product ID**. You can find the ID in WordPress: Products → hover a product → the `post=NNNN` number, or the `?add-to-cart=NNNN` link on the shop page.

From your shop I could already see a few:
- Rewarewa Honey 500g → **1293**
- Tāwari Honey 500g → **1305**
- Mānuka MG100+ 500g → **1277**
- Raw Kānuka Honey 500g → **49760**

Important: if a size is a **variation** of one product (rather than its own product page), put the parent product's ID in **WooCommerce product ID** and the variation's ID in **Variation ID**. If each size has its own product page (which yours mostly look like), leave Variation ID blank.

### 2. Create WooCommerce API keys
WordPress admin → **WooCommerce → Settings → Advanced → REST API → Add key**. Permissions: **Read/Write**. Copy the Consumer key (`ck_…`) and Consumer secret (`cs_…`).

### 3. Deploy the function
With the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in, from this folder:

```bash
supabase functions deploy woo-push
supabase secrets set WOO_URL=https://www.manawahoney.co.nz
supabase secrets set WOO_KEY=ck_your_key WOO_SECRET=cs_your_secret
supabase secrets set STOCK_SOURCE=total    # combined total; or: mataatua | waitawa
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically — don't set them.)

### 4. Point the app at it
Your function URL is `https://YOUR-PROJECT.supabase.co/functions/v1/woo-push`. Paste it into the app under **Settings → WooCommerce**, then tap **Push stock to WooCommerce**. You'll get a confirmation of how many products were updated.

## Notes & next steps

- **Cloud sync must be on** — the push reads from Supabase, not the device.
- **Bundles, gift packs and subscriptions** aren't simple jar counts, so don't map those to a single product ID; leave them managed in WooCommerce. Plain jars sync cleanly.
- This **push** half is optional and separate from the **pull** half you asked for (website orders → OUT in the app), which is the `woo-sync` webhook covered in `WOOCOMMERCE_SYNC.md`. Run pull on its own, or both together — push setting absolute totals and pull mirroring each sale stay consistent.
- To run the push automatically (e.g. every 15 min) instead of by hand, it can be put on a Supabase scheduled job. Easy to add once you're happy it's mapping correctly.

## Safety check before going live

Map **one** product first, push, and confirm the website stock for that one item changes as expected. Only map the rest once you've seen it work end-to-end — that way a wrong ID can't touch the whole catalogue.
