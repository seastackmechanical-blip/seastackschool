// SeastackSchool: emails the admins when something is waiting for them (new teachers, schools or affiliates to
// review, disputed attendance, ratings hidden by a school, reports, Help messages).
// Called hourly by the GitHub Actions build. It only ever emails the addresses in admin_emails, sends at most
// once every 50 minutes, and only when the numbers changed or a day has passed, so calling it is harmless.
// Needs the RESEND_API_KEY secret; without it the function does nothing and says so.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const LABELS: Record<string, [string, string]> = {
  teachers: ["teacher waiting for approval", "teachers waiting for approval"],
  schools: ["school waiting for review", "schools waiting for review"],
  affiliates: ["affiliate waiting for approval", "affiliates waiting for approval"],
  disputes: ["disputed attendance mark", "disputed attendance marks"],
  hidden_by_school: ["rating hidden by a school", "ratings hidden by a school"],
  reports: ["open report about a teacher", "open reports about teachers"],
  messages: ["unanswered Help message", "unanswered Help messages"],
  qualifications: ["teacher qualification waiting for you to verify its document", "teacher qualifications waiting for you to verify their documents"],
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: counts, error } = await db.rpc("attention_counts");
  if (error || !counts) return json({ ok: false, reason: "counts_failed" }, 500);
  const total = Object.values(counts as Record<string, number>).reduce((a, b) => a + Number(b), 0);
  if (!total) return json({ ok: true, sent: false, reason: "nothing_waiting" });

  const { data: state } = await db.from("admin_digest_state").select("*").eq("id", 1).maybeSingle();
  const last = state?.last_sent ? Date.parse(state.last_sent) : 0;
  const same = JSON.stringify(state?.last_counts ?? null) === JSON.stringify(counts);
  if (Date.now() - last < 50 * 60 * 1000) return json({ ok: true, sent: false, reason: "sent_recently" });
  if (same && Date.now() - last < 24 * 60 * 60 * 1000) return json({ ok: true, sent: false, reason: "nothing_new" });

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, reason: "email_not_configured" });
  const { data: admins } = await db.from("admin_emails").select("email");
  const to = (admins ?? []).map((a: { email: string }) => a.email);
  if (!to.length) return json({ ok: false, reason: "no_admins" });

  const site = (Deno.env.get("SITE_URL") || "https://seastackschool.com/").replace(/\/?$/, "/");
  const from = Deno.env.get("EMAIL_FROM") || "SeastackSchool <school@seastackbook.com>";
  const lines = Object.entries(counts as Record<string, number>)
    .filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `<li><b>${Number(n)}</b> ${LABELS[k] ? LABELS[k][Number(n) === 1 ? 0 : 1] : k}</li>`);
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#282748;max-width:520px">
    <h2 style="margin:0 0 12px">SeastackSchool needs your attention</h2><ul style="padding-left:20px;margin:0 0 16px">${lines.join("")}</ul>
    <p style="margin:18px 0"><a href="${site}#/admin" style="background:#7153cd;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open Manage accounts</a></p>
    <p style="margin:0;color:#6f7082;font-size:13px">You get this when something new is waiting, and once a day while anything is still open.</p></div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `SeastackSchool: ${total} ${total === 1 ? "item" : "items"} waiting for you`, html }),
  });
  if (!r.ok) { console.error("admin-digest send error", r.status, (await r.text()).slice(0, 200)); return json({ ok: false, reason: "send_failed" }); }
  await db.from("admin_digest_state").update({ last_sent: new Date().toISOString(), last_counts: counts }).eq("id", 1);
  return json({ ok: true, sent: true });
});
