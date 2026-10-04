// Builds the public site into _site/: the app itself plus one real page per approved teacher and per
// class, list pages, and sitemap.xml. Run by .github/workflows/pages.yml on every push and every hour,
// so new teachers and classes get their own page without anyone doing anything.
//   node scripts/build-pages.mjs            (SITE_URL env overrides the public address)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, process.env.OUT_DIR || "_site");
const SITE = (process.env.SITE_URL || "https://seastackmechanical-blip.github.io/seastackschool/").replace(/\/?$/, "/");
const BASE = new URL(SITE).pathname;
const SB_URL = "https://xzmamfglxmjjxjsetuaa.supabase.co";
const SB_KEY = "sb_publishable_J6pwCLXOBOp2hXlI183_dw_m06F6Jhh";   // public key; row rules decide what it can read

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Must stay identical to slugify() in accounts.js, which builds the "page to share" links.
const slugify = (s, id) => (String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page") + "-" + String(id).slice(0, 8);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const listWords = (a) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const money = (n) => "$" + Number(n).toFixed(Number(n) % 1 ? 2 : 0);
const ages = (c) => c.age_max >= 99 ? `Ages ${c.age_min}+` : `Ages ${c.age_min}–${c.age_max}`;
const typeLabel = (c) => c.type === "private" ? "Private lesson · 1 student" : "Small group class · up to " + c.capacity;
const initials = (n) => String(n || "?").split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();

async function get(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SB_KEY } });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
function tzOffsetAt(tz, wallMs) {
  const at = (m) => { try { const d = new Date(m); return Math.round((new Date(d.toLocaleString("en-US", { timeZone: tz })) - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 9e5) / 4; } catch (e) { return 0; } };
  return at(wallMs - at(wallMs) * 36e5);
}
// The next lesson start times, worked out the same way the app and the booking rules do.
function nextSessions(c, tz, n = 4) {
  const hour = +c.start_time.slice(0, 2) + +c.start_time.slice(3, 5) / 60, res = [], now = Date.now();
  const base = new Date(); base.setUTCHours(0, 0, 0, 0);
  for (let i = -1; i < 16 && res.length < n; i++) {
    const d = new Date(base.getTime() + i * 864e5);
    if (!c.days.includes(d.getUTCDay())) continue;
    const start = Math.round(d.getTime() + (hour - tzOffsetAt(tz, d.getTime() + hour * 36e5)) * 36e5);
    if (start > now + 30 * 6e4) res.push(new Date(start).toISOString());
  }
  return res;
}

/* ---------- shared page shell, styled with the app's own CSS ---------- */
const app = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = app.slice(app.indexOf("<style>"), app.indexOf("</style>") + 8);
const fonts = (app.match(/<link[^>]+fonts\.g[^>]+>/g) || []).join("\n");
const extraCss = `<style>
.crumbs{font-size:13px;color:var(--muted);margin-bottom:14px}.crumbs a{color:inherit}
.static h1{font-size:clamp(30px,5vw,46px);line-height:1.1;margin:10px 0 8px}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:8px 22px;margin:0}.facts dt{color:var(--muted)}.facts dd{margin:0;font-weight:700}
.static .lead{font-size:17px;color:var(--muted);max-width:60ch}
.static .cols{align-items:start}
.linkcard{display:block;text-decoration:none;color:inherit}.linkcard:hover{border-color:var(--pen)}
.times{margin:8px 0 0;padding-left:20px}
</style>`;
const track = (p) => `<script>
(function(){try{
  var sid=sessionStorage.getItem("ss:sid"),landing=false;
  if(!sid){sid=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);sessionStorage.setItem("ss:sid",sid);landing=true}
  var ref="";try{var u=new URL(document.referrer);if(u.host!==location.host)ref=u.host.replace(/^www\\./,"")}catch(e){}
  var q=new URLSearchParams(location.search);
  fetch(${JSON.stringify(SB_URL)}+"/rest/v1/rpc/log_visit",{method:"POST",keepalive:true,headers:{apikey:${JSON.stringify(SB_KEY)},"Content-Type":"application/json"},
    body:JSON.stringify({p_session:sid.slice(0,40),p_landing:landing,p_path:${JSON.stringify(p.slice(0, 60))},p_referrer:landing?(ref||null):null,
      p_source:landing?q.get("utm_source"):null,p_medium:landing?q.get("utm_medium"):null,p_campaign:landing?q.get("utm_campaign"):null})}).catch(function(){});
  // affiliate links (?ref=CODE): same rule as the app, first link wins for 90 days
  var rc=(q.get("ref")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16);
  if(rc.length>=4){
    var st=null;try{st=JSON.parse(localStorage.getItem("ss:ref")||"null")}catch(e){}
    if(!(st&&st.code&&Date.now()-st.at<90*864e5))localStorage.setItem("ss:ref",JSON.stringify({code:rc,at:Date.now()}));
    if(!sessionStorage.getItem("ss:refclick")){sessionStorage.setItem("ss:refclick","1");
      fetch(${JSON.stringify(SB_URL)}+"/rest/v1/rpc/log_referral_click",{method:"POST",keepalive:true,headers:{apikey:${JSON.stringify(SB_KEY)},"Content-Type":"application/json"},
        body:JSON.stringify({p_code:rc,p_path:${JSON.stringify(p.slice(0, 60))}})}).catch(function(){})}
  }
}catch(e){}
try{
  var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  // the time zone the visitor picked in the app, if any
  try{var z=localStorage.getItem("ss:tz");if(z){new Intl.DateTimeFormat("en",{timeZone:z});tz=z}}catch(e){}
  document.querySelectorAll("time[data-local]").forEach(function(t){var d=new Date(t.dateTime);
    t.textContent=d.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",timeZone:tz})+", "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",timeZone:tz})});
  document.querySelectorAll("[data-tzname]").forEach(function(e){e.textContent="your time zone ("+tz.replace(/_/g," ")+")"});
}catch(e){}
})();
</script>`;

function page({ file, title, desc, body, jsonld, trackPath }) {
  const url = SITE + file.replace(/index\.html$/, "");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SeastackSchool">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
${css}
${extraCss}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<a class="sr" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="logo" href="${BASE}"><span class="dot" aria-hidden="true"></span>SeastackSchool</a>
  <nav class="main" aria-label="Main">
    <a href="${BASE}classes/">Classes</a>
    <a href="${BASE}teachers/">Teachers</a>
    <a href="${BASE}#/help">Help</a>
  </nav>
  <a class="btn teach-nav" href="${BASE}#/studio">Start teaching ↗</a>
  <a class="btn sm ghost" href="${BASE}#/account">Sign in</a>
</div></header>
<main id="main" class="wrap page static">
${body}
</main>
<footer><div class="wrap"><div class="footer-top"><a class="logo" href="${BASE}">SeastackSchool<span style="color:#7660cd">✳</span></a><span>Teachers everywhere.<br>Learning for anyone.</span></div>Online payment is not open yet; nothing is charged when you book. <a href="${BASE}schools/">Schools</a> · <a href="${BASE}#/terms">Terms</a> · <a href="${BASE}#/privacy">Privacy</a></div></footer>
${track(trackPath)}
</body>
</html>
`;
  const full = path.join(out, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
  return url;
}

/* ---------- build ---------- */
const [teachers, classes, schools, reviews] = await Promise.all([
  get("teachers", "select=*&status=eq.approved&order=created_at"),
  get("classes", "select=*&order=created_at"),
  get("schools", "select=*&status=eq.approved&order=name"),
  get("reviews", "select=*&order=updated_at.desc"),
]);
const tById = new Map(teachers.map((t) => [t.id, t]));
const live = classes.filter((c) => tById.has(c.teacher_id));
const tSlug = (t) => slugify(t.full_name, t.id), cSlug = (c) => slugify(c.title, c.id);
const sById = new Map(schools.map((s) => [s.id, s])), sSlug = (s) => slugify(s.name, s.id);
const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const reviewBox = (t) => {
  const rs = reviews.filter((r) => r.teacher_id === t.id && !r.hidden);
  if (!rs.length) return `<div class="box"><h2 style="font-size:22px">Reviews</h2><p class="muted" style="margin:0">No reviews yet.</p></div>`;
  const avg = rs.reduce((a, r) => a + r.stars, 0) / rs.length;
  return `<div class="box"><h2 style="font-size:22px">Reviews</h2><p><span class="stars">${stars(avg)}</span> <b>${avg.toFixed(1)}</b> from ${rs.length} ${rs.length === 1 ? "review" : "reviews"}</p>
    ${rs.slice(0, 20).map((r) => `<div class="review"><span class="stars">${stars(r.stars)}</span>${r.body ? `<p style="margin:4px 0">${esc(r.body)}</p>` : ""}<span class="small muted">${esc(r.author)}</span></div>`).join("")}</div>`;
};
const schoolLink = (t) => { const s = sById.get(t.school_id); return s ? ` · <a href="${BASE}schools/${sSlug(s)}/">${esc(s.name)}</a>` : ""; };

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "accounts.js", ".nojekyll"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
// index.html names the public address in its search-engine tags; point them at the address being built for.
const FIRST_ADDRESS = "https://seastackmechanical-blip.github.io/seastackschool/";
if (SITE !== FIRST_ADDRESS) fs.writeFileSync(path.join(out, "index.html"), app.split(FIRST_ADDRESS).join(SITE));
// robots.txt only counts at the top of a domain, so it is written only when the site lives there.
if (BASE === "/") fs.writeFileSync(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

const urls = [SITE];
const classCard = (c) => { const t = tById.get(c.teacher_id); return `<a class="listing linkcard" href="${BASE}classes/${cSlug(c)}/" style="grid-template-columns:1fr auto">
  <div><span class="tag ${c.type}">${esc(typeLabel(c))}</span><h3 style="margin:6px 0 2px">${esc(c.title)}</h3>
    <div class="small">with ${esc(t.full_name || "a SeastackSchool teacher")}${t.city ? ` <span class="muted">from ${esc(t.city)}</span>` : ""}</div>
    <div class="meta"><span>${c.mode === "in_person" ? "In person" + (c.place_city ? " · " + esc(c.place_city) : "") : "Online"}</span><span>${esc(c.subject)}</span><span>Taught in ${esc(c.language)}</span><span>${ages(c)}</span><span>${esc(c.level)}</span><span>${c.duration_min} min</span></div></div>
  <div class="price"><b>${money(c.price)}</b><span class="small muted">per lesson</span></div></a>`; };

for (const c of live) {
  const t = tById.get(c.teacher_id), tz = t.timezone || "UTC", tName = t.full_name || "a SeastackSchool teacher";
  const kind = c.type === "private" ? "private lesson" : "small group class";
  const inPerson = c.mode === "in_person", where = inPerson ? `in-person${c.place_city ? " (" + c.place_city + ")" : ""}` : "live online";
  const when = `Every ${listWords(c.days.slice().sort().map((d) => DAYS[d]))} at ${c.start_time.slice(0, 5)}, ${esc(tz.replace(/_/g, " "))} time`;
  const next = nextSessions(c, tz);
  const desc = `${c.title}: ${inPerson ? "an" : "a"} ${where} ${c.subject} ${kind} with ${tName} on SeastackSchool. ${c.level}, ${ages(c).toLowerCase()}, taught in ${c.language}, ${c.duration_min} minutes, ${money(c.price)} per lesson.`;
  urls.push(page({
    file: `classes/${cSlug(c)}/index.html`, trackPath: `/classes/${cSlug(c)}`,
    title: `${c.title} | ${inPerson ? "In-person" : "Online"} ${c.subject} ${kind} with ${tName} | SeastackSchool`, desc,
    jsonld: { "@context": "https://schema.org", "@type": "Course", name: c.title, description: desc, inLanguage: c.language,
      provider: { "@type": "Organization", name: "SeastackSchool", url: SITE },
      offers: { "@type": "Offer", price: Number(c.price), priceCurrency: "USD", category: "Paid" },
      hasCourseInstance: { "@type": "CourseInstance", courseMode: inPerson ? "Onsite" : "Online", instructor: { "@type": "Person", name: tName, url: `${SITE}teachers/${tSlug(t)}/` } } },
    body: `<div class="crumbs"><a href="${BASE}classes/">Classes</a> › ${esc(c.subject)}</div>
<span class="tag ${c.type}">${esc(typeLabel(c))}</span>
<h1>${esc(c.title)}</h1>
<p class="lead">${inPerson ? "An" : "A"} ${esc(where)} ${esc(c.subject)} ${kind} with <a href="${BASE}teachers/${tSlug(t)}/">${esc(tName)}</a>${t.city ? `, teaching from ${esc(t.city)}` : ""}.</p>
<div class="cols" style="margin-top:22px"><div>
  <div class="box"><h2 style="font-size:22px">About this class</h2>
    <dl class="facts"><dt>Where</dt><dd>${inPerson ? "In person" + (c.place_city ? ", " + esc(c.place_city) : "") + " (the address is shown after booking)" : "Online"}</dd><dt>Subject</dt><dd>${esc(c.subject)}</dd><dt>Taught in</dt><dd>${esc(c.language)}</dd><dt>Level</dt><dd>${esc(c.level)}</dd><dt>For</dt><dd>${ages(c)}</dd>
      <dt>Class size</dt><dd>${c.type === "private" ? "One student, one-to-one with the teacher" : "Up to " + c.capacity + " students"}</dd><dt>Lesson length</dt><dd>${c.duration_min} minutes</dd><dt>Price</dt><dd>${money(c.price)} USD per lesson</dd></dl></div>
  <div class="box"><h2 style="font-size:22px">When it runs</h2><p style="margin:0">${when}.</p>
    ${next.length ? `<p class="small muted" style="margin:12px 0 0">Next lessons in <span data-tzname>the teacher's time zone</span>:</p><ul class="times">${next.map((iso) => `<li><time data-local datetime="${iso}">${esc(new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }))}</time></li>`).join("")}</ul>` : ""}</div>
</div><div>
  <div class="box"><h2 style="font-size:22px">Book this class</h2><p class="muted" style="margin:0 0 14px">Choose a lesson time and book with a free student or parent account. Online payment is not open yet, so nothing is charged when you book.</p>
    <a class="btn" href="${BASE}#/class/${c.id}">See times and book ↗</a></div>
  <a class="box linkcard" href="${BASE}teachers/${tSlug(t)}/"><h2 style="font-size:22px">Your teacher</h2><b>${esc(tName)}</b>${t.intro ? `<p class="muted" style="margin:6px 0 0">${esc(t.intro.slice(0, 260))}${t.intro.length > 260 ? "…" : ""}</p>` : ""}</a>
</div></div>`,
  }));
}

for (const t of teachers) {
  const mine = live.filter((c) => c.teacher_id === t.id), name = t.full_name || "SeastackSchool teacher";
  const subjects = [...new Set(mine.map((c) => c.subject))];
  const desc = `${name} teaches ${subjects.length ? listWords(subjects) : "live lessons"} online on SeastackSchool${t.city ? `, from ${t.city}` : ""}. ${t.intro ? t.intro.slice(0, 150) : "See classes, lesson times and book a lesson."}`;
  urls.push(page({
    file: `teachers/${tSlug(t)}/index.html`, trackPath: `/teachers/${tSlug(t)}`,
    title: `${name} | Online ${subjects.length ? listWords(subjects) + " " : ""}teacher | SeastackSchool`, desc,
    jsonld: { "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name, description: t.intro || undefined, knowsLanguage: t.languages?.length ? t.languages : undefined, url: `${SITE}teachers/${tSlug(t)}/` } },
    body: `<div class="crumbs"><a href="${BASE}teachers/">Teachers</a></div>
<div class="profile-head"><div class="avatar lg" style="background:#C9D6F2" aria-hidden="true">${esc(initials(name))}</div>
  <div><h1 style="margin:0">${esc(name)}</h1><div class="muted">${esc([t.city ? "Teaching from " + t.city : "", t.years_experience ? t.years_experience + " years' experience" : ""].filter(Boolean).join(" · "))}${schoolLink(t)}</div>${t.identity_checked_at ? `<div class="small" style="margin-top:4px"><span class="tag ok">Identity checked by SeastackSchool</span></div>` : ""}</div></div>
<div class="cols"><div>
  <div class="box">${t.intro ? `<h2 style="font-size:22px">About me</h2><p>${esc(t.intro)}</p>` : ""}${t.experience ? `<h2 style="font-size:22px">Experience</h2><p>${esc(t.experience)}</p>` : ""}
    ${t.languages?.length ? `<h2 style="font-size:22px">Teaching languages</h2><div class="chips">${t.languages.map((l) => `<span class="chip">${esc(l)}</span>`).join("")}</div>` : ""}
    ${!t.intro && !t.experience && !t.languages?.length ? `<p class="muted" style="margin:0">This teacher hasn't written their profile yet.</p>` : ""}</div>
  <h2 style="font-size:22px">Classes</h2>
  ${mine.length ? `<div class="list">${mine.map(classCard).join("")}</div>` : `<div class="empty">No classes listed yet.</div>`}
</div><div>
  <div class="box"><h2 style="font-size:22px">Book a lesson</h2><p class="muted" style="margin:0 0 14px">See lesson times in your own time zone and book with a free student or parent account.</p>
    <a class="btn" href="${BASE}#/teacher/${t.id}">View times and book ↗</a></div>
  ${reviewBox(t)}
</div></div>`,
  }));
}

for (const s of schools) {
  const ts = teachers.filter((t) => t.school_id === s.id), cs = live.filter((c) => ts.some((t) => t.id === c.teacher_id));
  const where = [s.city, s.country].filter(Boolean).join(", ");
  const desc = `${s.name}${where ? ", " + where : ""}: live online classes on SeastackSchool. ${s.about ? s.about.slice(0, 150) : "See the school's teachers and classes and book a lesson."}`;
  urls.push(page({
    file: `schools/${sSlug(s)}/index.html`, trackPath: `/schools/${sSlug(s)}`,
    title: `${s.name} | Online school | SeastackSchool`, desc,
    jsonld: { "@context": "https://schema.org", "@type": "EducationalOrganization", name: s.name, description: s.about || undefined, url: `${SITE}schools/${sSlug(s)}/`, sameAs: s.website || undefined },
    body: `<div class="crumbs"><a href="${BASE}schools/">Schools</a></div>
<div class="profile-head"><div class="avatar lg" style="background:#eee9fb" aria-hidden="true">${esc(initials(s.name))}</div>
  <div><h1 style="margin:0">${esc(s.name)}</h1><div class="muted">${esc(where)}${s.website ? ` · <a href="${esc(s.website)}" rel="noopener noreferrer">Website</a>` : ""}</div>
  <div class="small muted">Documents reviewed by SeastackSchool${s.reviewed_at ? " on " + esc(new Date(s.reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })) : ""}</div></div></div>
<div class="cols"><div>
  ${s.about ? `<div class="box"><h2 style="font-size:22px">About the school</h2><p style="margin:0;white-space:pre-line">${esc(s.about)}</p></div>` : ""}
  <h2 style="font-size:22px">Classes</h2>
  ${cs.length ? `<div class="list">${cs.map(classCard).join("")}</div>` : `<div class="empty">No classes listed yet.</div>`}
</div><div>
  <div class="box"><h2 style="font-size:22px">Teachers</h2>${ts.length ? ts.map((t) => `<div class="review"><a href="${BASE}teachers/${tSlug(t)}/"><b>${esc(t.full_name || "Teacher")}</b></a><div class="small muted">${esc((t.languages || []).join(", "))}</div></div>`).join("") : `<p class="muted" style="margin:0">No teachers listed yet.</p>`}</div>
  <div class="box"><h2 style="font-size:22px">Book a lesson</h2><p class="muted" style="margin:0 0 14px">See lesson times in your own time zone and book with a free student or parent account.</p><a class="btn" href="${BASE}#/school/${s.id}">View classes and book ↗</a></div>
</div></div>`,
  }));
}
urls.push(page({
  file: "schools/index.html", trackPath: "/schools-list",
  title: "Online schools | SeastackSchool", desc: "Schools on SeastackSchool. Each school's documents are reviewed before its page and teachers go public.",
  body: `<h1>Schools</h1><p class="lead">Each school's documents are reviewed before its page and teachers go public.</p>
${schools.length ? `<div class="grid2" style="margin-top:20px">${schools.map((s) => { const n = teachers.filter((t) => t.school_id === s.id).length; return `<a class="res linkcard" href="${BASE}schools/${sSlug(s)}/"><b>${esc(s.name)}</b><span class="small muted">${esc([s.city, s.country].filter(Boolean).join(", "))}</span><span class="small">${n} ${n === 1 ? "teacher" : "teachers"}</span></a>`; }).join("")}</div>`
    : `<div class="empty" style="margin-top:20px"><h3>No schools are listed yet</h3><p class="muted">If you run a school, you can register it and list your teachers and classes.</p><a class="btn" href="${BASE}#/account">Register a school</a></div>`}`,
}));
urls.push(page({
  file: "classes/index.html", trackPath: "/classes-list",
  title: "Online classes | SeastackSchool", desc: "Live online classes on SeastackSchool: private lessons and small group classes with teachers anywhere, shown in your own time zone.",
  body: `<h1>Online classes</h1><p class="lead">Live lessons with approved teachers. Private lessons or small group classes.</p>
${live.length ? `<div class="list" style="margin-top:20px">${live.map(classCard).join("")}</div>`
    : `<div class="empty" style="margin-top:20px"><h3>No classes are listed yet</h3><p class="muted">Teachers are joining SeastackSchool now. If you teach, you can be one of the first.</p><a class="btn" href="${BASE}#/studio">Start teaching</a></div>`}
<p style="margin-top:22px"><a href="${BASE}#/classes">Search and filter classes in the app ↗</a></p>`,
}));
urls.push(page({
  file: "teachers/index.html", trackPath: "/teachers-list",
  title: "Online teachers | SeastackSchool", desc: "Meet the teachers on SeastackSchool. Every teacher account is reviewed before their profile and classes go public.",
  body: `<h1>Teachers</h1><p class="lead">Every teacher account is reviewed before their profile and classes go public.</p>
${teachers.length ? `<div class="grid2" style="margin-top:20px">${teachers.map((t) => { const n = live.filter((c) => c.teacher_id === t.id).length; return `<a class="res linkcard" href="${BASE}teachers/${tSlug(t)}/"><b>${esc(t.full_name || "SeastackSchool teacher")}</b><span class="small muted">${esc([t.city, (t.languages || []).join(", ")].filter(Boolean).join(" · "))}</span><span class="small">${n} ${n === 1 ? "class" : "classes"}</span></a>`; }).join("")}</div>`
    : `<div class="empty" style="margin-top:20px"><h3>No teachers are listed yet</h3><p class="muted">Teachers are joining SeastackSchool now.</p><a class="btn" href="${BASE}#/studio">Start teaching</a></div>`}`,
}));

fs.writeFileSync(path.join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
console.log(`Built ${urls.length} pages: ${teachers.length} teachers, ${live.length} classes -> ${out}`);
