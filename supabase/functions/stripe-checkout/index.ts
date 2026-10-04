// SeastackSchool: starts a payment for one lesson and returns the address of Stripe's payment page.
// POST, signed in as a student or parent: {class_id, starts_at, child_id?, tz?} -> {url}.
// The database checks the lesson can be booked (prepare_payment); the booking itself is made by stripe-webhook
// only after Stripe confirms the money. The teacher receives the price minus SeastackSchool's fee.
// Secrets: STRIPE_SECRET_KEY (required), SITE_URL (optional).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function when(iso: string, tz: string) {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone, timeZoneName: "short" }).format(new Date(iso));
  try { return fmt(tz); } catch (_e) { return fmt("UTC"); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, reason: "payments_not_configured", message: "Online payment is not set up yet." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return json({ ok: false, reason: "not_signed_in", message: "Sign in to book a lesson." }, 401);

  let body: { class_id?: string; starts_at?: string; child_id?: string | null; tz?: string };
  try { body = await req.json(); } catch (_e) { return json({ ok: false, reason: "bad_request" }, 400); }
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!body.class_id || !uuid.test(body.class_id) || !body.starts_at || isNaN(Date.parse(body.starts_at)) || (body.child_id && !uuid.test(body.child_id))) {
    return json({ ok: false, reason: "bad_request" }, 400);
  }

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const q = await db.rpc("prepare_payment", { p_learner: who.user.id, p_class_id: body.class_id, p_starts_at: new Date(body.starts_at).toISOString(), p_child_id: body.child_id || null });
  if (q.error || !q.data?.length) return json({ ok: false, reason: "cannot_book", message: q.error?.message || "This lesson cannot be booked." });
  const p = q.data[0];

  const site = (Deno.env.get("SITE_URL") || "https://seastackschool.com/").replace(/\/?$/, "/");
  const tz = typeof body.tz === "string" && body.tz.length <= 64 ? body.tz : "UTC";
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": p.currency,
    "line_items[0][price_data][unit_amount]": String(p.amount_cents),
    "line_items[0][price_data][product_data][name]": `${p.title} (lesson for ${p.attendee_name})`.slice(0, 240),
    "line_items[0][price_data][product_data][description]": when(new Date(body.starts_at).toISOString(), tz),
    client_reference_id: p.payment_id,
    "metadata[payment_id]": p.payment_id,
    "payment_intent_data[application_fee_amount]": String(p.fee_cents),
    "payment_intent_data[transfer_data][destination]": p.stripe_account,
    "payment_intent_data[metadata][payment_id]": p.payment_id,
    success_url: site + "?paid=1#/learning",
    cancel_url: site + "?paid=0#/classes",
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  };
  if (who.user.email) params.customer_email = who.user.email;

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "checkout-" + p.payment_id },
    body: new URLSearchParams(params).toString(),
  });
  const s = await r.json();
  if (!r.ok) {
    console.error("stripe-checkout", s?.error?.message);
    await db.from("payments").update({ status: "expired" }).eq("id", p.payment_id).eq("status", "pending");
    return json({ ok: false, reason: "stripe_error", message: "The payment page could not be opened. Nothing was charged." });
  }
  await db.from("payments").update({ stripe_session_id: s.id }).eq("id", p.payment_id);
  return json({ ok: true, url: s.url });
});
