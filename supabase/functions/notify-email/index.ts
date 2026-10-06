// SeastackSchool: emails the alerts in the notifications table.
// The database calls this the moment an alert is created ({id}) and again every ten minutes ({}) to catch any missed.
// It is not called by the site and needs no sign-in: all it can ever do is send an alert that is already waiting, once,
// to the person it belongs to. People who switched email alerts off are skipped.
// Secrets: RESEND_API_KEY (required), EMAIL_FROM, SITE_URL (optional).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, reason: "email_not_configured" });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch (_e) { /* an empty body means "send whatever is waiting" */ }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = db.from("notifications").select("id").is("emailed_at", null).lt("email_tries", 3).gt("created_at", since).order("created_at").limit(25);
  if (body.id && /^[0-9a-f-]{36}$/i.test(body.id)) q = q.eq("id", body.id);
  const { data: waiting } = await q;

  const site = (Deno.env.get("SITE_URL") || "https://seastackschool.com/").replace(/\/?$/, "/");
  const from = Deno.env.get("EMAIL_FROM") || "SeastackSchool <school@seastackschool.com>";
  let sent = 0, skipped = 0, failed = 0;
  for (const w of waiting ?? []) {
    // claim it first, so the instant call and the sweep can never both send the same alert
    const { data: n } = await db.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", w.id).is("emailed_at", null).select("*").maybeSingle();
    if (!n) continue;
    const { data: pref } = await db.from("notification_prefs").select("email").eq("user_id", n.user_id).maybeSingle();
    if (pref && pref.email === false) { await db.from("notifications").update({ email_error: "email alerts off" }).eq("id", n.id); skipped++; continue; }
    const { data: u } = await db.auth.admin.getUserById(n.user_id);
    const to = u?.user?.email;
    if (!to) { await db.from("notifications").update({ email_error: "no address" }).eq("id", n.id); skipped++; continue; }
    const link = site + (n.link || "");
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#282748;max-width:520px">
      <img src="${site}app/seal-512.png" width="64" height="64" alt="SeastackSchool" style="display:block;border-radius:14px;margin:0 0 16px">
      <h2 style="margin:0 0 12px">${esc(n.title)}</h2>${n.body ? `<p style="margin:0 0 10px">${esc(n.body)}</p>` : ""}
      <p style="margin:18px 0"><a href="${esc(link)}" style="background:#7153cd;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open SeastackSchool</a></p>
      <p style="margin:0;color:#6f7082;font-size:13px">You get this because you have an account on SeastackSchool. To stop these emails, sign in and switch off "Email me alerts" under Password and account.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: n.title, html }),
    });
    if (r.ok) sent++;
    else {
      const msg = (await r.text()).slice(0, 200);
      console.error("notify-email", r.status, msg);
      await db.from("notifications").update({ emailed_at: null, email_tries: (n.email_tries ?? 0) + 1, email_error: `${r.status} ${msg}` }).eq("id", n.id);
      failed++;
    }
  }
  return json({ ok: true, sent, skipped, failed });
});
