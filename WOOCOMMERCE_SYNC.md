# WooCommerce → App: pull sales into stock

When a paid order comes through your website, this records an **OUT at Mataatua** in the app for each item, so your finished-goods stock stays correct without anyone keying it in. WooCommerce stays the source of truth for sales going out; the app stays the source of truth for production and labelling.

It uses a small **Supabase Edge Function** (`woo-sync`) that WooCommerce calls via a webhook. The function file is `woo-sync/index.ts`.

---

## Step 1 — Database

Run `supabase_setup.sql` in the Supabase SQL editor (you may have already). It adds the `woo_id` / `woo_variation_id` columns to products and a `woo_processed_orders` table that stops an order ever being counted twice.

## Step 2 — Map your products in the app

Edit each product you sell online and fill in its **WooCommerce product ID** (set once — it applies to every batch of that product). From your current site:

- Rewarewa 500g → `1293`
- Tāwari 500g → `1305`
- Mānuka MG100+ 500g → `1277`
- Raw Kānuka 500g → `49760`

Find the rest by opening each product in WordPress admin — the ID is in the URL (`post=1293`). Leave the ID blank for anything not sold online. Only fill **Variation ID** if a size is a *variation* of a single product rather than its own product (check WooCommerce → Products: a "Variable product" has variations).

## Step 3 — Deploy the Edge Function

With the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
supabase login
supabase link --project-ref <your-project-ref>

# put the file at supabase/functions/woo-sync/index.ts, then:
supabase functions deploy woo-sync --no-verify-jwt
```

`--no-verify-jwt` matters: WooCommerce won't send a Supabase auth header, so we don't require one — the function instead verifies WooCommerce's own signature. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically; you only set the webhook secret (and optionally the location):

```bash
supabase secrets set WOO_WEBHOOK_SECRET="pick-a-long-random-string"
# optional (defaults shown):
supabase secrets set SALE_LOCATION="Mataatua"
supabase secrets set SALE_STATUSES="processing,completed"
```

Your function URL will be:
`https://<your-project-ref>.functions.supabase.co/woo-sync`

## Step 4 — Add the webhook in WooCommerce

WooCommerce → **Settings → Advanced → Webhooks → Add webhook**:

- **Name:** Manawa stock sync
- **Status:** Active
- **Topic:** Order updated
- **Delivery URL:** your function URL from Step 3
- **Secret:** the *same* string you used for `WOO_WEBHOOK_SECRET`
- Save.

## Step 5 — Test

Place a small test order (or move an existing order to **Processing**). Within a few seconds the app's **History** should show an **OUT** at Mataatua stamped **WooCommerce — Website order #1234**, and that product's Mataatua balance drops. WooCommerce → Webhooks → your webhook → **Logs** shows each delivery and the function's reply (including notes about any unmapped items).

---

## How it decides what to deduct

- Fires only on orders reaching **processing** or **completed**, and each order is deducted **once** (the processed-orders table guards against repeat deliveries).
- Each line item is matched to an app product by **Variation ID** first, then **product ID**.
- The quantity comes off **Mataatua**, drawing from batches **oldest-first**. If the product is mapped but has no Mataatua stock, the oldest batch is allowed to go negative so the sale still shows — a clear signal you're short.
- An item with no matching app product is skipped and noted in the webhook log (no error, no deduction).

## Limitations (worth a decision later)

- **Refunds / cancellations** aren't added back automatically. If you refund an order, correct it with an **Adjustment** in the app. (Can be automated later via the `order.refunded` topic.)
- **Bundles, gift packs and subscriptions:** these deduct by whatever product/variation IDs appear in the order's line items. A bundle assembled from components may not carry the component IDs, so check one real bundle order in the webhook log and tell me how its line items look if you want those handled.
- This is the **pull** direction (website → app), which is what you asked for. An optional **push** direction (app → website, setting your combined total as the site's stock) is also built as the separate `woo-push` function — see `WOOCOMMERCE_SETUP.md`. Run pull alone, or add push to keep the website's displayed stock locked to your real totals.
