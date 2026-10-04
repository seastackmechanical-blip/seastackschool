// SeastackSchool: receives events from Stripe. Called by Stripe, not by the site, so it does not check a sign-in;
// instead every request must carry a valid Stripe signature (STRIPE_WEBHOOK_SECRET).
//   checkout.session.completed / async_payment_succeeded -> make the booking (or mark the money for refund if the place has gone)
//   checkout.session.expired / async_payment_failed      -> close the unpaid attempt
//   account.updated                                       -> record whether a teacher can take payments
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (both required).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Stripe signs "<timestamp>.<body>" with the webhook secret. Reject anything unsigned, wrongly signed or older than 5 minutes.
async function signed(raw: string, header: string, secret: string) {
  const items = header.split(",").map((x) => x.trim());
  const t = (items.find((x) => x.startsWith("t=")) || "").slice(2);
  const v1 = items.filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  return v1.some((got) => {
    if (got.length !== want.length) return false;
    let d = 0;
    for (let i = 0; i < want.length; i++) d |= got.charCodeAt(i) ^ want.charCodeAt(i);
    return d === 0;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !key) return json({ ok: false, reason: "payments_not_configured" }, 503);
  const raw = await req.text();
  if (!(await signed(raw, req.headers.get("stripe-signature") ?? "", secret))) return json({ ok: false, reason: "bad_signature" }, 400);

  const event = JSON.parse(raw);
  const obj = event?.data?.object ?? {};
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const pid = obj?.metadata?.payment_id;

  if ((event.type === "checkout.session.completed" && obj.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded") {
    if (pid) {
      const intent = String(obj.payment_intent ?? "");
      const r = await db.rpc("complete_paid_booking", { p_payment: pid, p_intent: intent });
      if (r.error) { console.error("complete_paid_booking", r.error.message); return json({ ok: false }, 500); }
      if (r.data === "refund_due" && intent) {
        // the place went while they were paying: send the money straight back
        const f = await fetch("https://api.stripe.com/v1/refunds", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "refund-" + pid },
          body: new URLSearchParams({ payment_intent: intent, reverse_transfer: "true", refund_application_fee: "true", "metadata[payment_id]": pid }).toString(),
        });
        const j = await f.json();
        if (f.ok) await db.from("payments").update({ status: "refunded", stripe_refund_id: j.id, refunded_at: new Date().toISOString() }).eq("id", pid).eq("status", "refund_due");
        else console.error("refund failed", pid, j?.error?.message);   // stripe-refunds retries it every hour
      }
    }
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    if (pid) await db.from("payments").update({ status: "expired" }).eq("id", pid).eq("status", "pending");
  } else if (event.type === "account.updated") {
    await db.from("teacher_payouts").update({ charges_enabled: !!obj.charges_enabled, payouts_enabled: !!obj.payouts_enabled, details_submitted: !!obj.details_submitted, updated_at: new Date().toISOString() }).eq("stripe_account_id", obj.id);
  }
  return json({ ok: true });
});
