// Manawa Honey -> WooCommerce stock push
// Supabase Edge Function. Reads current stock from the `products` table and
// sets the sellable quantity on matching WooCommerce products/variations.
//
// Deploy:  supabase functions deploy woo-push
// Secrets (set once, never in code):
//   supabase secrets set WOO_URL=https://www.manawahoney.co.nz
//   supabase secrets set WOO_KEY=ck_xxx  WOO_SECRET=cs_xxx
//   supabase secrets set STOCK_SOURCE=total          # total | mataatua | waitawa
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const WOO_URL = (Deno.env.get("WOO_URL") || "").replace(/\/+$/, "");
    const WOO_KEY = Deno.env.get("WOO_KEY") || "";
    const WOO_SECRET = Deno.env.get("WOO_SECRET") || "";
    const SOURCE = (Deno.env.get("STOCK_SOURCE") || "total").toLowerCase();
    if (!WOO_URL || !WOO_KEY || !WOO_SECRET) throw new Error("WooCommerce secrets are not set.");

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: products, error } = await supa.from("products").select("*");
    if (error) throw error;

    // How many jars are sellable for a batch row.
    const sellable = (p: any) => {
      const w = Number(p.waitawa) || 0, m = Number(p.mataatua) || 0;
      return SOURCE === "total" ? w + m : SOURCE === "waitawa" ? w : m;
    };

    // Sum batches up to their WooCommerce target.
    const simple = new Map<string, number>();                 // woo_id -> qty
    const variations = new Map<string, Map<string, number>>(); // parent -> (variationId -> qty)

    for (const p of products || []) {
      const wid = String(p.woo_id || "").trim();
      if (!wid) continue;
      const vid = String(p.woo_variation_id || "").trim();
      const qty = sellable(p);
      if (vid) {
        if (!variations.has(wid)) variations.set(wid, new Map());
        const m = variations.get(wid)!;
        m.set(vid, (m.get(vid) || 0) + qty);
      } else {
        simple.set(wid, (simple.get(wid) || 0) + qty);
      }
    }

    const auth = "Basic " + btoa(`${WOO_KEY}:${WOO_SECRET}`);
    const post = (path: string, body: unknown) =>
      fetch(`${WOO_URL}${path}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const results: any[] = [];

    // Simple products, batched up to 100 per request.
    const simpleUpdates = [...simple.entries()].map(([id, q]) => ({
      id: Number(id), stock_quantity: q, manage_stock: true,
    }));
    for (let i = 0; i < simpleUpdates.length; i += 100) {
      const chunk = simpleUpdates.slice(i, i + 100);
      const r = await post(`/wp-json/wc/v3/products/batch`, { update: chunk });
      results.push({ type: "products", count: chunk.length, status: r.status });
    }

    // Variations, grouped per parent product.
    for (const [parent, m] of variations) {
      const ups = [...m.entries()].map(([vid, q]) => ({
        id: Number(vid), stock_quantity: q, manage_stock: true,
      }));
      for (let i = 0; i < ups.length; i += 100) {
        const chunk = ups.slice(i, i + 100);
        const r = await post(`/wp-json/wc/v3/products/${parent}/variations/batch`, { update: chunk });
        results.push({ type: "variations", parent, count: chunk.length, status: r.status });
      }
    }

    const updated = simpleUpdates.length +
      [...variations.values()].reduce((s, m) => s + m.size, 0);

    return new Response(
      JSON.stringify({ ok: true, source: SOURCE, updated, results }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
