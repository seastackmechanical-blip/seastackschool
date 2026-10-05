// SeastackSchool: connects a teacher to Stripe so they can be paid.
// Actions (POST, signed in as a teacher): {action:"start", country:"CA"} -> {url} to Stripe's onboarding pages,
// {action:"status"} -> refreshes and returns whether the teacher can take payments, {action:"dashboard"} -> {url} to
// the teacher's own Stripe dashboard. Secrets: STRIPE_SECRET_KEY (required), SITE_URL (optional).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function stripe(path: string, params?: Record<string, string>, method = "POST") {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Stripe could not complete the request");
  return j;
}

// Stripe's newer API (Accounts v2): JSON bodies and a dated version header.
async function stripe2(path: string, body?: unknown, method = "POST") {
  const r = await fetch("https://api.stripe.com/v2/core/" + path, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Stripe-Version": "2026-08-26.dahlia", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Stripe could not complete the request");
  return j;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ ok: false, reason: "payments_not_configured", message: "Online payment is not set up yet." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return json({ ok: false, reason: "not_signed_in" }, 401);
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: teacher } = await db.from("teachers").select("id, full_name").eq("id", who.user.id).maybeSingle();
  if (!teacher) return json({ ok: false, reason: "not_a_teacher", message: "Only teacher accounts can be paid." }, 403);

  let body: { action?: string; country?: string };
  try { body = await req.json(); } catch (_e) { return json({ ok: false, reason: "bad_request" }, 400); }
  const site = (Deno.env.get("SITE_URL") || "https://seastackschool.com/").replace(/\/?$/, "/");
  const { data: row } = await db.from("teacher_payouts").select("*").eq("teacher_id", teacher.id).maybeSingle();

  try {
    if (body.action === "start") {
      let acct = row?.stripe_account_id as string | undefined;
      if (!acct) {
        const country = String(body.country || "").toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) return json({ ok: false, reason: "bad_country", message: "Choose the country you will be paid in." }, 400);
        // Accounts v2: a "recipient" who receives transfers from SeastackSchool and has Stripe's Express dashboard.
        const base = {
          contact_email: who.user.email ?? undefined,
          display_name: (teacher.full_name || "SeastackSchool teacher").slice(0, 100),
          identity: { country: country.toLowerCase(), entity_type: "individual" },
          configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
          dashboard: "express",
          metadata: { teacher_id: teacher.id },
        };
        let a;
        try {
          a = await stripe2("accounts", { ...base, defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } } });
        } catch (e) {
          // Stripe refuses responsibilities on some recipient-only setups; they are then implied.
          if (!/responsibilit/i.test((e as Error).message)) throw e;
          a = await stripe2("accounts", base);
        }
        acct = a.id;
        const ins = await db.from("teacher_payouts").insert({ teacher_id: teacher.id, stripe_account_id: acct });
        if (ins.error) return json({ ok: false, reason: "save_failed", message: "Your payout account could not be saved." }, 500);
      }
      const link = await stripe2("account_links", {
        account: acct!,
        use_case: { type: "account_onboarding", account_onboarding: { configurations: ["recipient"], refresh_url: site + "?stripe=again#/studio", return_url: site + "?stripe=back#/studio" } },
      });
      return json({ ok: true, url: link.url });
    }
    if (!row) return json({ ok: true, connected: false });
    if (body.action === "status") {
      const a = await stripe2("accounts/" + row.stripe_account_id + "?include=configuration.recipient&include=requirements", undefined, "GET");
      const bal = a?.configuration?.recipient?.capabilities?.stripe_balance ?? {};
      const canReceive = bal?.stripe_transfers?.status === "active";
      const flags = {
        charges_enabled: canReceive,                                              // money for a lesson can be sent to this teacher
        payouts_enabled: bal?.payouts ? bal.payouts.status === "active" : canReceive,
        details_submitted: canReceive || !(a?.requirements?.entries?.length),
        updated_at: new Date().toISOString(),
      };
      await db.from("teacher_payouts").update(flags).eq("teacher_id", teacher.id);
      return json({ ok: true, connected: true, ...flags });
    }
    if (body.action === "dashboard") {
      const l = await stripe("accounts/" + row.stripe_account_id + "/login_links", {});
      return json({ ok: true, url: l.url });
    }
    return json({ ok: false, reason: "bad_request" }, 400);
  } catch (e) {
    console.error("stripe-connect", (e as Error).message);
    return json({ ok: false, reason: "stripe_error", message: (e as Error).message });
  }
});
