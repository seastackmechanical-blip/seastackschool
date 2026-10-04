// SeastackSchool: sends back the money for every payment the database has marked "refund_due"
// (a lesson cancelled in time, cancelled by the teacher or admin, or paid for after the place had gone).
// The decision is made in the database; this only carries it out, once per payment. The whole price returns to the
// family: the teacher's share is taken back from the teacher and SeastackSchool's fee is returned too.
// Called by the site right after a cancellation and every hour by the publish job, so nothing is missed.
// Secret: STRIPE_SECRET_KEY (required).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, reason: "payments_not_configured" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: due } = await db.from("payments").select("id, stripe_payment_intent").eq("status", "refund_due").not("stripe_payment_intent", "is", null).order("created_at").limit(25);
  let refunded = 0, failed = 0;
  for (const p of due ?? []) {
    const r = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "refund-" + p.id },
      body: new URLSearchParams({ payment_intent: p.stripe_payment_intent, reverse_transfer: "true", refund_application_fee: "true", "metadata[payment_id]": p.id }).toString(),
    });
    const j = await r.json();
    if (r.ok) {
      await db.from("payments").update({ status: "refunded", stripe_refund_id: j.id, refunded_at: new Date().toISOString() }).eq("id", p.id).eq("status", "refund_due");
      refunded++;
    } else { console.error("stripe-refunds", p.id, j?.error?.message); failed++; }
  }
  return json({ ok: true, refunded, failed });
});
