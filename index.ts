// Manawa Honey — WooCommerce → app pull-sales webhook.
// Deploy as a Supabase Edge Function named "woo-sync".
//
// When a website order is paid, WooCommerce calls this function. It verifies the
// signature, then for each line item it finds the matching app product (by Woo
// product/variation ID) and records an OUT at Mataatua, drawing down batches
// oldest-first (FIFO). An order is only ever deducted once.
//
// Required Edge Function secrets (set with `supabase secrets set ...`):
//   SUPABASE_URL                 - your project URL
//   SUPABASE_SERVICE_ROLE_KEY    - service role key (server-side only, never in the app)
//   WOO_WEBHOOK_SECRET           - the Secret you set on the WooCommerce webhook
// Optional:
//   SALE_LOCATION                - defaults to "Mataatua"
//   SALE_STATUSES                - comma list, defaults to "processing,completed"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOO_SECRET = Deno.env.get("WOO_WEBHOOK_SECRET") ?? "";
const SALE_LOCATION = Deno.env.get("SALE_LOCATION") ?? "Mataatua";
const SALE_STATUSES = (Deno.env.get("SALE_STATUSES") ?? "processing,completed")
  .split(",").map((s) => s.trim().toLowerCase());

const LOC_COL = SALE_LOCATION.toLowerCase() === "waitawa" ? "waitawa" : "mataatua";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Verify WooCommerce's base64 HMAC-SHA256 signature over the raw request body.
async function validSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WOO_SECRET) return false;
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(WOO_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function nowISO() { return new Date().toISOString(); }
function rid(p: string) { return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("x-wc-webhook-signature");

  // WooCommerce sends a small ping ({"webhook_id":N}) with no signature when you first save it.
  if (!raw || raw.length < 5) return new Response("ok", { status: 200 });
  if (raw.includes("webhook_id") && !raw.includes("line_items")) return new Response("ok", { status: 200 });

  if (!(await validSignature(raw, sig))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let order: any;
  try { order = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const orderId = String(order.id ?? "");
  const status = String(order.status ?? "").toLowerCase();
  const lineItems: any[] = Array.isArray(order.line_items) ? order.line_items : [];
  if (!orderId) return new Response("ok", { status: 200 });

  // Only deduct for paid/processing orders.
  if (!SALE_STATUSES.includes(status)) return new Response("ignored (status)", { status: 200 });

  // Dedupe: claim the order id. If it's already there, we've handled it.
  const claim = await db.from("woo_processed_orders").insert({ order_id: orderId, status }).select();
  if (claim.error) {
    // Unique-violation = already processed → success, do nothing.
    if ((claim.error as any).code === "23505") return new Response("already processed", { status: 200 });
    return new Response("DB error: " + claim.error.message, { status: 500 });
  }

  let deducted = 0;
  const notes: string[] = [];

  for (const li of lineItems) {
    const qtyWanted = Number(li.quantity) || 0;
    if (qtyWanted <= 0) continue;
    const variationId = li.variation_id ? String(li.variation_id) : "";
    const productId = li.product_id ? String(li.product_id) : "";

    // Match by variation first (if the line is a variation), else by product id.
    let rows: any[] = [];
    if (variationId && variationId !== "0") {
      const r = await db.from("products").select("*").eq("woo_variation_id", variationId);
      rows = r.data ?? [];
    }
    if (!rows.length && productId) {
      const r = await db.from("products").select("*").eq("woo_id", productId);
      rows = r.data ?? [];
    }
    if (!rows.length) { notes.push(`No app product mapped to Woo ${variationId || productId} (${li.name})`); continue; }

    // FIFO across batches: those with stock at the sale location first, oldest batch first.
    rows.sort((a, b) => (Number(b[LOC_COL]) > 0 ? 1 : 0) - (Number(a[LOC_COL]) > 0 ? 1 : 0)
                     || String(a.batch).localeCompare(String(b.batch)));

    let remaining = qtyWanted;
    for (let i = 0; i < rows.length && remaining > 0; i++) {
      const p = rows[i];
      const have = Number(p[LOC_COL]) || 0;
      const isLast = i === rows.length - 1;
      let amount: number;
      if (have > 0) amount = Math.min(have, remaining);      // take what this batch has
      else if (isLast) amount = remaining;                   // nothing left with stock → last batch goes negative so the sale still shows
      else continue;                                         // skip empty batches while stocked ones remain

      const newBal = have - amount;
      const up = await db.from("products").update({ [LOC_COL]: newBal, updated_at: nowISO() }).eq("id", p.id);
      if (up.error) { notes.push(`Update failed for ${p.product_name}: ${up.error.message}`); continue; }

      await db.from("transactions").insert({
        id: rid("woo"), sku: p.sku, product_name: p.product_name, added: nowISO(),
        transaction_type: "OUT", entered_quantity: amount, quantity: -amount,
        location: SALE_LOCATION, team_member: "WooCommerce",
        comments: `Website order #${orderId}`,
      });
      remaining -= amount;
      deducted++;
    }
    if (remaining > 0) notes.push(`${li.name}: ${remaining} not allocated (no stock rows left)`);
  }

  await db.from("woo_processed_orders").update({ items_deducted: deducted }).eq("order_id", orderId);

  return new Response(JSON.stringify({ ok: true, order: orderId, deducted, notes }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
