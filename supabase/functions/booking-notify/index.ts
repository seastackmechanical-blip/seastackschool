// SeastackSchool: emails the teacher and the learner when a lesson is booked or cancelled.
// Called by the site right after book_class / cancel_booking. The browser only passes a booking id;
// everything in the email is read from the database here, and each event is emailed once.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY  required. Without it the function does nothing and says so.
//   EMAIL_FROM      optional. Default "SeastackSchool <school@seastackbook.com>".
//   SITE_URL        optional. Default is the public site address.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function when(iso: string, tz: string) {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone, timeZoneName: "short" }).format(new Date(iso));
  try { return fmt(tz); } catch (_e) { return fmt("UTC"); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return json({ ok: false, reason: "not_signed_in" }, 401);
  const caller = who.user.id;

  let body: { booking_id?: string; event?: string; tz?: string };
  try { body = await req.json(); } catch (_e) { return json({ ok: false, reason: "bad_request" }, 400); }
  const event = body.event;
  if (!body.booking_id || !/^[0-9a-f-]{36}$/i.test(body.booking_id) || (event !== "booked" && event !== "cancelled")) {
    return json({ ok: false, reason: "bad_request" }, 400);
  }

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: b } = await db.from("bookings").select("*").eq("id", body.booking_id).maybeSingle();
  if (!b) return json({ ok: false, reason: "booking_not_found" }, 404);
  const { data: c } = await db.from("classes").select("id, title, teacher_id, duration_min").eq("id", b.class_id).maybeSingle();
  if (!c) return json({ ok: false, reason: "class_not_found" }, 404);
  const { data: isAdmin } = await db.from("admins").select("user_id").eq("user_id", caller).maybeSingle();
  if (caller !== b.learner_id && caller !== c.teacher_id && !isAdmin) return json({ ok: false, reason: "not_allowed" }, 403);
  if (b.status !== event) return json({ ok: false, reason: "state_mismatch" }, 409);

  const { data: already } = await db.from("booking_notifications").select("booking_id").eq("booking_id", b.id).eq("event", event).maybeSingle();
  if (already) return json({ ok: true, sent: 0, reason: "already_sent" });

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, reason: "email_not_configured" });

  const [{ data: teacher }, { data: learner }, tUser, lUser] = await Promise.all([
    db.from("teachers").select("full_name, timezone").eq("id", c.teacher_id).maybeSingle(),
    db.from("learners").select("full_name, role").eq("id", b.learner_id).maybeSingle(),
    db.auth.admin.getUserById(c.teacher_id),
    db.auth.admin.getUserById(b.learner_id),
  ]);
  const teacherEmail = tUser.data?.user?.email, learnerEmail = lUser.data?.user?.email;
  const teacherTz = teacher?.timezone || "UTC";
  const learnerTz = typeof body.tz === "string" && body.tz.length <= 64 && caller === b.learner_id ? body.tz : teacherTz;
  const site = (Deno.env.get("SITE_URL") || "https://seastackschool.com/").replace(/\/?$/, "/");
  const from = Deno.env.get("EMAIL_FROM") || "SeastackSchool <school@seastackbook.com>";
  const by = b.cancelled_by === b.learner_id ? "the " + (learner?.role === "parent" ? "parent" : "student")
           : b.cancelled_by === c.teacher_id ? "the teacher" : "SeastackSchool";

  // What happened to the money for this lesson, if it was paid for.
  const { data: pay } = await db.from("payments").select("amount_cents, status").eq("booking_id", b.id).maybeSingle();
  const amount = pay ? "$" + (pay.amount_cents / 100).toFixed(2).replace(/\.00$/, "") : "";
  const money = !pay ? ""
    : pay.status === "paid" ? `Paid: ${amount}.`
    : pay.status === "refund_due" || pay.status === "refunded" ? `${amount} is being refunded to the card that paid. It can take several days to appear.`
    : pay.status === "kept" ? `Not refunded: the lesson was cancelled with less notice than the refund rule allows.`
    : "";

  const wrap = (title: string, lines: string[], link: string, linkText: string) =>
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#282748;max-width:520px">
      <h2 style="margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="margin:0 0 10px">${l}</p>`).join("")}
      <p style="margin:18px 0"><a href="${esc(link)}" style="background:#7153cd;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(linkText)}</a></p>
      <p style="margin:0;color:#6f7082;font-size:13px">SeastackSchool.${money ? " " + esc(money) : ""}</p></div>`;

  const mails: { to: string; subject: string; html: string }[] = [];
  const cls = esc(c.title), kid = esc(b.attendee_name), tName = esc(teacher?.full_name || "your teacher");
  if (event === "booked") {
    if (teacherEmail) mails.push({ to: teacherEmail, subject: `New booking: ${c.title}`,
      html: wrap("You have a new booking", [`<b>${kid}</b> is booked into <b>${cls}</b>.`, `When: ${esc(when(b.starts_at, teacherTz))}`,
        "If you haven't added a lesson link for this class yet, add one under My classes so they can join."], site + "#/studio", "Open the teacher studio") });
    if (learnerEmail) mails.push({ to: learnerEmail, subject: `Booked: ${c.title}`,
      html: wrap("Your lesson is booked", [`<b>${cls}</b> with ${tName}, for <b>${kid}</b>.`, `When: ${esc(when(b.starts_at, learnerTz))}`,
        "The link to join is in My lessons once the teacher has added it. You can cancel there any time before the lesson starts."], site + "#/learning", "Open My lessons") });
  } else {
    if (teacherEmail) mails.push({ to: teacherEmail, subject: `Booking cancelled: ${c.title}`,
      html: wrap("A booking was cancelled", [`The booking for <b>${kid}</b> in <b>${cls}</b> was cancelled by ${esc(by)}.`, `Lesson time: ${esc(when(b.starts_at, teacherTz))}`],
        site + "#/studio", "Open the teacher studio") });
    if (learnerEmail) mails.push({ to: learnerEmail, subject: `Booking cancelled: ${c.title}`,
      html: wrap("Your booking was cancelled", [`The booking for <b>${kid}</b> in <b>${cls}</b> with ${tName} was cancelled by ${esc(by)}.`, `Lesson time: ${esc(when(b.starts_at, learnerTz))}`],
        site + "#/classes", "Find another class") });
  }

  let sent = 0; const errors: string[] = [];
  for (const m of mails) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html }),
    });
    if (r.ok) sent++; else errors.push(`${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  if (sent > 0) await db.from("booking_notifications").insert({ booking_id: b.id, event, recipients: sent });
  if (errors.length) console.error("booking-notify send errors", errors);
  return json({ ok: sent > 0, sent, failed: errors.length });
});
