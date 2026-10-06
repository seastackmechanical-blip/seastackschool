/* SeastackSchool accounts: real teacher accounts, their classes, and admin management (Supabase).
   Loaded after the page script in index.html; it replaces the prototype's teacher studio and adds #/admin. */
const SB_URL = "https://xzmamfglxmjjxjsetuaa.supabase.co";
const SB_KEY = "sb_publishable_J6pwCLXOBOp2hXlI183_dw_m06F6Jhh";
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const A = {user:null, teacher:null, admin:false, classes:[], rows:null, mode:"signin", msg:"", err:"", recovery:false, filter:"pending", removing:null,
  learner:null, children:[], lrows:null, kind:"student", adminTab:"teachers", removingChild:null,
  bookings:[], links:{}, addresses:{}, cancelling:null, brows:null, bfilter:"upcoming",
  ready:false, visits:null, vdays:30, vloading:false,
  aff:null, adash:null, arows:null, afilter:"pending",
  schools:[], school:null, schoolPriv:null, members:[], mclasses:[], docs:[], mySchool:null,
  srows:null, sfilter:"pending", sdocs:{}, removingDoc:null, removingMember:null, leaving:false,
  reviews:[], rrows:null, mreviews:[],
  tdocs:[], tdocsAdmin:{}, removingTDoc:null, attn:null, inbox:null, editing:null, cancelDateKey:null, notes:{}, quals:[], aquals:[], removingQual:null, mquals:[], smsgs:[], sEditing:null, sRemoving:null, alerts:[], alertEmail:true, payout:null, pays:[], apays:[], payConfirm:false, refunding:null, contacts:[], thread:null, threadWith:null, amsgs:null};
const CANCELLED = {};
// Online payment (Stripe). Off until the admin switches it on; the numbers come from the database.
const PAY = {enabled:false, fee:20, hours:24, payable:new Set()};
const usd = cents => "$" + (cents/100).toFixed(2).replace(/\.00$/,"");
// Countries where Stripe can pay a teacher out from a platform based in Canada: Canada, the US, the UK, the EEA and Switzerland.
const PAY_COUNTRIES = [["AT","Austria"],["BE","Belgium"],["BG","Bulgaria"],["CA","Canada"],["HR","Croatia"],["CY","Cyprus"],["CZ","Czechia"],["DK","Denmark"],["EE","Estonia"],["FI","Finland"],["FR","France"],["DE","Germany"],["GR","Greece"],["HU","Hungary"],["IE","Ireland"],["IT","Italy"],["LV","Latvia"],["LI","Liechtenstein"],["LT","Lithuania"],["LU","Luxembourg"],["MT","Malta"],["NL","Netherlands"],["NO","Norway"],["PL","Poland"],["PT","Portugal"],["RO","Romania"],["SK","Slovakia"],["SI","Slovenia"],["ES","Spain"],["SE","Sweden"],["CH","Switzerland"],["GB","United Kingdom"],["US","United States"]];   // lesson dates a teacher has cancelled, keyed like BOOKED
// Demo teachers and classes disappear by themselves once this many real teachers are listed.
const DEMO_OFF_AT = 3;
// Schools stay out of the top menu until teachers and families are working well; their pages still exist.
const SHOW_SCHOOLS_MENU = false;
const BOOKED = {};   // seats taken per lesson, keyed "<class id>@<start in ms>"
let RB = {};         // the real booking in progress

/* ---------- helpers ---------- */
// A teacher's photo lives in a public bucket; without one the avatar shows their initials.
const photoUrl = (id, file) => SB_URL + "/storage/v1/object/public/teacher-photos/" + id + "/" + file;
function avatarHtml(t, lg){
  return t.photo ? `<img class="avatar${lg?" lg":""}" src="${esc(t.photo)}" alt="" loading="lazy" style="object-fit:cover;display:block">`
    : `<div class="avatar${lg?" lg":""}" style="background:${t.color}" aria-hidden="true">${initials(t.name)}</div>`;
}
// Teacher level: worked out by the database from facts (teacher_levels). Nobody sets it by hand.
const TEACH_LEVELS = ["Preschool","Primary","Secondary","University","Adults"];
const RANKS = ["New teacher","Verified teacher","Established teacher","Senior teacher"];
function rankTag(t){ return t && t.real ? ` <span class="tag ${t.lvl?"ok":"group"}" title="Teacher level on SeastackSchool">${RANKS[t.lvl||0]}</span>` : "" }
// A teacher's listed qualifications: [{title, issuer, year}]
function qualList(q){ return (Array.isArray(q)?q:[]).filter(x=>x && x.title).map(x=>({title:String(x.title),issuer:String(x.issuer||""),year:String(x.year||""),by:x.verified_at?"site":x.school_verified_at?"school":""})) }
function qualLine(x){ return `<b>${esc(x.title)}</b>${x.issuer?", "+esc(x.issuer):""}${x.year?" ("+esc(x.year)+")":""}` }
// The part of a teacher's public profile that says what they are qualified to teach.
function teacherMore(t){
  if(!t || !t.real) return "";
  const q=t.quals||[];
  return `<h3>Teacher level</h3><p style="margin:0 0 4px">${rankTag(t)} <span class="small muted">${t.lessons} ${t.lessons===1?"lesson":"lessons"} taught on SeastackSchool</span></p>
    <p class="small muted" style="margin:0 0 12px">${["New on SeastackSchool. Identity and qualifications are not both verified yet.","Identity checked and at least one qualification verified by SeastackSchool.","Verified, with 10 or more lessons taught here and good ratings.","Verified, with 50 or more lessons taught here and ratings averaging 4.5 or higher."][t.lvl||0]} The level is worked out automatically and cannot be bought or set by hand.</p>
    ${(t.teaches||[]).length?`<h3>Teaches</h3><div class="chips">${t.teaches.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</div>`:""}
    ${(t.subj||[]).length?`<h3>Subjects</h3><div class="chips">${t.subj.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</div>`:""}
    ${t.edu?`<h3>Education</h3><p style="white-space:pre-line">${esc(t.edu)}</p>`:""}
    ${q.length?`<h3>Qualifications and certificates</h3><ul style="margin:0 0 8px;padding-left:20px">${q.map(x=>`<li>${qualLine(x)} <span class="small muted">· verified by ${x.by==="school"?esc((A.schools.find(s=>s.id===t.school)||{}).name||"the teacher's school"):"SeastackSchool"}</span></li>`).join("")}</ul>`:""}
    ${q.length?`<p class="small muted" style="margin:0 0 12px">The document for each qualification has been seen by whoever is named beside it.</p>`:""}`;
}
// What a teacher sees about a person booked into their own class.
function attendeeCard(b){
  const n=A.notes[b.id]; if(!n) return "";
  const bits=[n.is_child && n.booked_by?"Booked by parent: "+esc(n.booked_by):"", n.level?(n.is_child?"School grade: ":"Level: ")+esc(n.level):"", n.country?"Country: "+esc(n.country):"",
    (n.languages||[]).length?"Speaks: "+esc(n.languages.join(", ")):"", n.goals?"Wants to learn: "+esc(n.goals):"", n.about?"About: "+esc(n.about):"", n.note?"Note for you: "+esc(n.note):""].filter(Boolean);
  return bits.map(x=>`<div class="small muted" style="margin-top:2px">${x}</div>`).join("");
}
function ratingLabel(tid){ return reviewsFor(tid).length ? `<span class="stars">★</span> ${rating(tid).toFixed(1)}` : `<span class="muted">New</span>` }
function tzOffset(tz){
  try{ const d=new Date(); return Math.round((new Date(d.toLocaleString("en-US",{timeZone:tz})) - new Date(d.toLocaleString("en-US",{timeZone:"UTC"})))/9e5)/4 }
  catch(e){ return 0 }
}
// Offset (hours) of a time zone on a given date, so lesson times stay right across clock changes.
function tzOffsetAt(tz, wallMs){
  const at = m => { try{ const d=new Date(m); return Math.round((new Date(d.toLocaleString("en-US",{timeZone:tz})) - new Date(d.toLocaleString("en-US",{timeZone:"UTC"})))/9e5)/4 }catch(e){ return 0 } };
  return at(wallMs - at(wallMs)*36e5);
}
function tzList(){ try{ return Intl.supportedValuesOf("timeZone") }catch(e){ return [TZ,"UTC"] } }
function toClass(x){
  return {id:x.id,t:x.teacher_id,mine:true,real:true,title:x.title,subject:x.subject,lang:x.language,type:x.type,price:+x.price,cap:x.capacity,
    ages:[x.age_min,x.age_max],level:x.level,days:x.days,hour:+x.start_time.slice(0,2)+(+x.start_time.slice(3,5))/60,mins:x.duration_min,mode:x.mode||"online",place:x.place_city||""};
}
const DAY3 = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
// A class is online or in person. Demo classes carry no mode and count as online.
function modeLabel(c){ return (c.mode||"online")==="in_person" ? "In person" + ((c.place||c.place_city) ? " · " + esc(c.place||c.place_city) : "") : "Online" }
const routeName = () => location.hash.replace(/^#\/?/,"").split("/")[0];
// Address of each teacher's and class's own page. Must stay identical to slugify() in scripts/build-pages.mjs.
const SITE_BASE = location.origin + location.pathname.replace(/[^/]*$/,"");
// Affiliate links carry ?ref=CODE. The first link someone opens is the one that counts, for 90 days.
const REF_DAYS = 90;
function storedRef(){
  try{ const r = JSON.parse(localStorage.getItem("ss:ref") || "null"); return r && r.code && Date.now() - r.at < REF_DAYS*864e5 ? r.code : null }catch(e){ return null }
}
(function captureRef(){
  const code = (new URLSearchParams(location.search).get("ref") || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16);
  if(code.length < 4 || !sb) return;
  try{
    if(!storedRef()) localStorage.setItem("ss:ref", JSON.stringify({code, at:Date.now()}));
    if(sessionStorage.getItem("ss:refclick")) return;      // one click per visit, not one per page load
    sessionStorage.setItem("ss:refclick", "1");
  }catch(e){}
  sb.rpc("log_referral_click", {p_code:code, p_path:"/"+routeName().slice(0,40)}).then(()=>{}, ()=>{});
})();
// A school's invitation link carries ?school=CODE: remember it for the teacher sign-up form.
function schoolCodeFromLink(){ try{ return sessionStorage.getItem("ss:school") || "" }catch(e){ return "" } }
(function captureSchoolCode(){
  const code = (new URLSearchParams(location.search).get("school") || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);
  if(code.length < 6) return;
  try{ sessionStorage.setItem("ss:school", code) }catch(e){}
  A.kind = "teacher"; A.mode = "signup";
})();
const slugify = (s,id) => (String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "page") + "-" + String(id).slice(0,8);

/* ---------- data ---------- */
async function loadPublic(){
  if(!sb) return;
  const [t,c,n,sch,rv,cx] = await Promise.all([sb.from("teachers").select("*").eq("status","approved"), sb.from("classes").select("*"), sb.rpc("session_counts"), sb.from("schools").select("*").eq("status","approved").order("name"), sb.from("reviews").select("*").order("updated_at",{ascending:false}), sb.from("class_cancellations").select("class_id,starts_at").gt("starts_at", new Date().toISOString())]);
  if(t.error || c.error) return;
  A.schools = sch.data || []; A.reviews = rv.data || [];
  const sj = await sb.from("subjects").select("name,sort,active").order("sort").order("name");
  window.SUBJ_LIST = (sj.data||[]).filter(s=>s.active).map(s=>s.name);
  const ps = await sb.from("payment_settings").select("enabled,fee_percent,refund_hours,paused,pause_note").maybeSingle(), pt = await sb.rpc("payable_teachers");
  if(ps.data){ PAY.enabled=!!ps.data.enabled; PAY.fee=ps.data.fee_percent; PAY.hours=ps.data.refund_hours; PAY.paused=!!ps.data.paused; PAY.pauseNote=ps.data.pause_note||"" }
  PAY.payable = new Set((pt.data||[]).map(x=>typeof x==="string" ? x : x.payable_teachers));
  for(const k in BOOKED) delete BOOKED[k];
  (n.data||[]).forEach(x=>{ BOOKED[x.class_id+"@"+Date.parse(x.starts_at)] = +x.booked });
  for(const k in CANCELLED) delete CANCELLED[k];
  (cx.data||[]).forEach(x=>{ CANCELLED[x.class_id+"@"+Date.parse(x.starts_at)] = true });
  // only qualifications the admin has verified against a document are public
  const qv = await sb.from("teacher_qualifications").select("id,teacher_id,title,issuer,year,verified_at,school_verified_at").or("verified_at.not.is.null,school_verified_at.not.is.null").order("created_at");
  const QV = {}; (qv.data||[]).forEach(q=>{ (QV[q.teacher_id] = QV[q.teacher_id] || []).push(q) });
  const lv = await sb.rpc("teacher_levels");
  const LV = {}; (lv.data||[]).forEach(x=>{ LV[x.teacher_id]=x });
  // Clear and refill in one go, with nothing awaited in between: two loads running at once must not both add the same teachers.
  for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(arr[i].real) arr.splice(i,1);
  const ok = new Set();
  t.data.forEach(x=>{ ok.add(x.id); TEACHERS.push({id:x.id,real:true,name:x.full_name||"New teacher",city:x.city,offset:tzOffset(x.timezone),tz:x.timezone,school:x.school_id,checked:!!x.identity_checked_at,color:"#C9D6F2",
    years:x.years_experience,langs:x.languages||[],subjects:[],rating:0,intro:x.intro,exp:x.experience,headline:x.headline||"",country:x.country||"",edu:x.education||"",subj:x.subjects||[],quals:qualList(QV[x.id]),photo:x.photo?photoUrl(x.id,x.photo):"",teaches:x.teaches||[],lvl:(LV[x.id]||{}).level||0,lessons:(LV[x.id]||{}).lessons||0,nrate:(LV[x.id]||{}).ratings||0,avg:+(LV[x.id]||{}).avg_stars||0}) });
  c.data.filter(x=>ok.has(x.teacher_id) && (x.review_status||"approved")==="approved").forEach(x=>CLASSES.push(toClass(x)));
  if(t.data.length >= DEMO_OFF_AT && TEACHERS.some(x=>!x.real)){
    for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(!arr[i].real) arr.splice(i,1);
    S.bookings=[]; save();      // demo bookings pointed at demo classes that are now gone
  }
  payChrome();
}
// Wording that depends on whether online payment is open.
function payChrome(){
  window.PAYON = PAY.enabled; document.body.classList.toggle("pay-on", PAY.enabled);
  const rb=$(".demo-ribbon"), demos=TEACHERS.some(x=>!x.real); if(!rb) return;
  rb.textContent = demos ? (PAY.enabled ? "CLASSES MARKED DEMO ARE SAMPLES" : "CLASSES MARKED DEMO ARE SAMPLES / ONLINE PAYMENT IS NOT OPEN YET") : "ONLINE PAYMENT IS NOT OPEN YET / NOTHING IS CHARGED WHEN YOU BOOK";
  rb.hidden = !demos && PAY.enabled;
  if(PAY.paused){ rb.textContent = "BOOKING IS PAUSED FOR A SHORT TIME" + (PAY.pauseNote ? " / " + PAY.pauseNote.toUpperCase() : ""); rb.hidden = false }
}
async function loadMe(){
  const {data:{session}} = await sb.auth.getSession();
  A.user = session?.user || null; A.teacher=null; A.admin=false; A.staff=null; A.staffer=false; A.boss=false; A.classes=[]; A.rows=null; A.learner=null; A.children=[]; A.lrows=null; A.bookings=[]; A.links={}; A.addresses={}; A.brows=null; A.aff=null; A.adash=null; A.arows=null;
  A.contacts=[]; A.quals=[]; A.alerts=[]; A.alertEmail=true;
  A.school=null; A.schoolPriv=null; A.members=[]; A.mclasses=[]; A.docs=[]; A.mySchool=null; A.srows=null; A.sdocs={};
  if(!A.user) return;
  const [t,adm,c,l,k,b,ln,af,sc,sp] = await Promise.all([
    sb.from("teachers").select("*").eq("id",A.user.id).maybeSingle(),
    sb.rpc("staff_state"),
    sb.from("classes").select("*").eq("teacher_id",A.user.id).order("created_at"),
    sb.from("learners").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("children").select("*").eq("parent_id",A.user.id).order("created_at"),
    sb.from("bookings").select("*").order("starts_at"),
    sb.from("class_links").select("*"),
    sb.from("affiliates").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("schools").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("school_private").select("*").eq("id",A.user.id).maybeSingle()]);
  A.teacher = t.data || null; A.staff = adm.data || null; A.admin = !!(A.staff && A.staff.ok); A.staffer = !!(A.staff && A.staff.role); A.boss = A.admin && A.staff.role==="boss"; A.classes = c.data || [];
  A.learner = l.data || null; A.children = k.data || [];
  A.bookings = b.data || []; (ln.data||[]).forEach(x=>{ if(x.url) A.links[x.class_id]=x.url; if(x.address) A.addresses[x.class_id]=x.address });
  A.aff = af.data || null;
  if(A.aff){ const d = await sb.rpc("my_affiliate_dashboard"); A.adash = d.error ? null : d.data }
  A.school = sc.data || null; A.schoolPriv = sp.data || null;
  if(A.school) await loadSchoolExtras();
  if(A.teacher && A.teacher.school_id){ const r = await sb.from("schools").select("id,name,status").eq("id",A.teacher.school_id).maybeSingle(); A.mySchool = r.data || null }
  A.tdocs = A.teacher ? await listDocs(A.user.id, "teacher-docs") : [];
  A.quals = [];
  if(A.teacher){ const q = await sb.from("teacher_qualifications").select("*").eq("teacher_id",A.user.id).order("created_at"); A.quals = q.data || [] }
  A.notes = {};
  if(A.teacher){ const nt = await sb.rpc("my_class_attendees"); (nt.data||[]).forEach(x=>{ A.notes[x.booking_id]=x }) }
  if(A.teacher || A.learner){ const mc = await sb.rpc("my_message_contacts"); A.contacts = mc.data || [] }
  await loadAlerts();
  const np = await sb.from("notification_prefs").select("email").eq("user_id",A.user.id).maybeSingle(); A.alertEmail = !np.data || np.data.email !== false;
  A.payout=null; A.pays=[]; A.payWait=null;
  if(A.teacher){ const pw = await sb.from("payout_waitlist").select("country").eq("teacher_id",A.user.id).maybeSingle(); A.payWait = pw.data ? pw.data.country : null }
  if(A.teacher){ const po = await sb.from("teacher_payouts").select("*").eq("teacher_id",A.user.id).maybeSingle(); A.payout = po.data || null }
  if(A.school){ const po = await sb.from("school_payouts").select("*").eq("school_id",A.user.id).maybeSingle(); A.payout = po.data || null }
  if(A.teacher || A.learner || A.school){ const py = await sb.from("payments").select("id,booking_id,learner_id,teacher_id,school_id,starts_at,attendee_name,title,amount_cents,fee_cents,status,refund_reason,refund_hours,created_at").order("created_at",{ascending:false}).limit(300); A.pays = py.data || [] }
  syncLearner();
  if(A.admin) await loadAdmin();
}
// A signed-in student or parent books as themselves; a parent's children come from their account.
function syncLearner(){
  if(!A.learner) return;
  // the time zone saved on the profile applies on any device, unless this device has its own choice
  try{
    const z=A.learner.timezone;
    if(z && !localStorage.getItem("ss:tz")){ new Intl.DateTimeFormat("en",{timeZone:z}); TZ=z; document.querySelectorAll("select.tzpick").forEach(s=>{ s.value=z }) }
  }catch(e){}
  S.role = A.learner.role==="parent" ? "parent" : "learner"; $("#role").value = S.role;
  if(A.learner.role==="parent") S.children = A.children.map(k=>({id:k.id,name:k.first_name,age:k.age}));
}
async function loadAdmin(){
  const [r,l,b,f] = await Promise.all([sb.rpc("admin_list_teachers"), sb.rpc("admin_list_learners"), sb.rpc("admin_list_bookings"), sb.rpc("admin_list_affiliates")]);
  const sr = await sb.rpc("admin_list_schools"); if(!sr.error) A.srows = sr.data;
  const aq = await sb.from("teacher_qualifications").select("*").order("created_at"); A.aquals = aq.data || [];
  // payments and staff belong to the admin boss; an admin never asks for them
  A.apays = []; A.staffRows = [];
  if(A.boss){ const ap = await sb.rpc("admin_list_payments"); A.apays = ap.data || []; const st = await sb.rpc("boss_list_staff"); A.staffRows = st.data || [] }
  const ex = await sb.rpc("staff_extras"); A.bx = {}; A.rx = {};
  if(!ex.error && ex.data){ (ex.data.bookings||[]).forEach(x=>{ A.bx[x.id]=x }); (ex.data.reports||[]).forEach(x=>{ A.rx[x.id]=x }) }
  const rq = await sb.rpc("staff_list_requests"); A.reqs = rq.error ? [] : (rq.data || []);
  const lg = await sb.rpc("staff_list_audit",{p_limit:300}); A.log = lg.error ? [] : (lg.data || []);
  const wl = await sb.from("payout_waitlist").select("country"); A.await = wl.data || [];
  const rr = await sb.rpc("admin_list_reviews"); if(!rr.error) A.rrows = rr.data;
  const at = await sb.rpc("admin_attention"); if(!at.error) A.attn = at.data;
  const ib = await sb.rpc("admin_inbox"); if(!ib.error) A.inbox = ib.data;
  const cl = await sb.rpc("admin_list_classes"); A.crows = cl.error ? [] : (cl.data || []);
  const fc = await sb.rpc("staff_filter_config"); A.fcfg = fc.error ? {subjects:[],terms:[]} : fc.data;
  if(r.error || l.error || b.error || f.error) toast((r.error||l.error||b.error||f.error).message); else { A.rows = r.data; A.lrows = l.data; A.brows = b.data; A.arows = f.data }
}
async function refresh(){ await loadMe(); await loadPublic(); chrome(); A.ready=true; render() }

/* ---------- header ---------- */
function chrome(){
  let a = $("#acct");
  if(!a){ a=document.createElement("a"); a.id="acct"; a.className="btn sm ghost"; $(".top .wrap").appendChild(a) }
  a.href = !A.user ? "#/account" : A.teacher ? "#/studio" : A.staffer ? "#/admin" : A.aff ? "#/partner" : A.school ? "#/myschool" : "#/account";
  a.textContent = !A.user ? "Sign in" : A.teacher ? "My teacher account" : A.staffer ? "Admin" : A.aff ? "Affiliate dashboard" : A.school ? "My school" : "My account";
  let sl = $("#navschools");
  if(!sl && SHOW_SCHOOLS_MENU){ sl=document.createElement("a"); sl.id="navschools"; sl.href="#/schools"; sl.dataset.r="schools"; sl.textContent="Schools"; const nav=$("nav.main"); nav.insertBefore(sl, nav.querySelector('[data-r="help"]')) }
  a.onclick = A.user ? null : () => { A.mode="signin"; A.err=""; A.msg="" };
  let n = $("#navadmin");
  if(A.staffer && !n){ n=document.createElement("a"); n.id="navadmin"; n.href="#/admin"; n.dataset.r="admin"; n.textContent="Manage accounts"; $("nav.main").appendChild(n) }
  if(!A.staffer && n) n.remove();
  let al = $("#navalerts");
  if(A.user && !al){ al=document.createElement("a"); al.id="navalerts"; al.href="#/alerts"; al.dataset.r="alerts"; const nav=$("nav.main"); nav.insertBefore(al, nav.querySelector('[data-r="help"]')) }
  if(!A.user && al) al.remove();
  if(A.user && al){ const u=A.alerts.filter(x=>!x.read_at).length; al.textContent = u ? `Alerts (${u})` : "Alerts" }
  let m = $("#navmsgs"); const can = !!(A.teacher || A.learner);
  if(can && !m){ m=document.createElement("a"); m.id="navmsgs"; m.href="#/messages"; m.dataset.r="messages"; const nav=$("nav.main"); nav.insertBefore(m, nav.querySelector('[data-r="help"]')) }
  if(!can && m) m.remove();
  if(can && m){ const u=A.contacts.reduce((a,c)=>a+(c.unread||0),0); m.textContent = u ? `Messages (${u})` : "Messages" }
}

/* ---------- a school runs its teachers' classes ---------- */
// The school is paid for every lesson its teachers give. It connects Stripe once.
function schoolPayBox(){
  const p=A.payout, guess=(PAY_COUNTRIES.find(c=>c[1].toLowerCase()===(A.school.country||"").trim().toLowerCase())||[""])[0];
  return `<div class="box" id="paybox"><h3>Getting paid</h3>
    <p class="muted small">Families pay your school for every lesson your teachers give. Your school receives ${100-PAY.fee}% of each lesson price, paid to its bank account by Stripe. SeastackSchool keeps ${PAY.fee}%. Your school pays its own teachers. If a lesson is refunded, your share of it is taken back.${PAY.enabled?"":" Online payment is not open yet. You can connect now so that you are ready."}</p>
    ${!p ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label class="field" style="flex:1;min-width:200px">Country your school is paid in<select id="pay-country"><option value="">Choose…</option>${PAY_COUNTRIES.map(c=>`<option value="${c[0]}" ${c[0]===guess?"selected":""}>${c[1]}</option>`).join("")}</select></label><button class="btn sm" id="paybtn" onclick="payConnect()">Connect Stripe</button></div>
        <p class="small muted" style="margin:8px 0 0">Schools can be paid in Canada, the United States, the United Kingdom, Switzerland and most of Europe. The country cannot be changed later. Your teachers do not connect Stripe.</p>`
      : p.charges_enabled ? `<div class="ok">Your school can take paid bookings.${p.payouts_enabled?"":" Stripe has not switched on payouts to your bank yet. Open your Stripe dashboard to see what it needs."}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" onclick="payDashboard()">Open the school's Stripe dashboard</button><button class="btn ghost sm" onclick="payStatus(true)">Check again</button></div>`
      : `<div class="notice">Stripe still needs some details before your school can be paid.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" id="paybtn" onclick="payConnect()">Continue with Stripe</button><button class="btn ghost sm" onclick="payStatus(true)">Check again</button></div>`}
  </div>`;
}
function schoolEarnings(){
  const rows=A.pays.filter(p=>p.school_id===A.user.id && p.status!=="pending"); if(!rows.length) return "";
  const share=p=>p.amount_cents-p.fee_cents, kept=rows.filter(p=>p.status==="paid"||p.status==="kept"), earned=kept.reduce((s,p)=>s+share(p),0);
  const by={}; kept.forEach(p=>{ by[p.teacher_id]=(by[p.teacher_id]||0)+share(p) });
  const tn=id=>(A.members.find(t=>t.id===id)||{}).full_name||"(teacher no longer in your school)";
  return `<div class="box" id="searnings"><h3>Payments for your school's lessons</h3>
    <p class="muted small">Your school's share so far: <b>${usd(earned)}</b> from ${kept.length} ${kept.length===1?"lesson":"lessons"}, after SeastackSchool's ${PAY.fee}%. Stripe pays it to the school's bank account; see the Stripe dashboard for payout dates.</p>
    ${Object.keys(by).length>1?`<p class="small" style="margin:0 0 8px">By teacher: ${Object.keys(by).map(id=>esc(tn(id))+" "+usd(by[id])).join(" · ")}</p>`:""}
    ${rows.slice(0,30).map(p=>{ const w=new Date(p.starts_at); return `<div class="lesson"><div><b>${esc(p.title)}</b><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · ${esc(tn(p.teacher_id))} · for ${esc(p.attendee_name)}</div></div><span class="small">${PAY_LABEL[p.status]||p.status} · ${p.status==="paid"||p.status==="kept"?"school's share "+usd(share(p)):usd(p.amount_cents)}</span></div>` }).join("")}</div>`;
}
// The school checks its own teachers' qualification documents. This is the school's verification, named as such in public.
function schoolQuals(tid){
  const list=(A.mquals||[]).filter(q=>q.teacher_id===tid), docs=A.tdocsAdmin[tid];
  if(!list.length) return "";
  return `<div class="small" style="margin-top:6px">${list.map(q=>{ const d=docs && q.doc_name ? docs.find(x=>x.path.endsWith("/"+q.doc_name)) : null;
    return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line)">${qualLine(q)} ${qualStatus(q)}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${!q.doc_name?"":d&&d.url?`<a class="btn sm ghost" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open document</a>`:`<button class="btn sm ghost" onclick="showTeacherDocs('${tid}')">Show document</button>`}
        ${q.school_verified_at?`<button class="btn sm ghost" onclick="schoolVerifyQual('${q.id}',false)">Remove school verification</button>`:q.doc_name?`<button class="btn sm" onclick="schoolVerifyQual('${q.id}',true)">Verify</button>`:""}</div></div>` }).join("")}</div>`;
}
async function schoolVerifyQual(id, yes){
  const r = await sb.rpc("school_verify_qualification",{p_id:id,p_verified:yes});
  if(r.error) return toast(r.error.message);
  await loadSchoolExtras(); await loadPublic(); toast(yes?"Verified. It shows on the teacher's profile as verified by your school.":"School verification removed"); render();
}
function schoolMsgsBox(){
  const rows=A.smsgs||[];
  return `<div class="box" id="smsgs"><h3>Messages between your teachers and families</h3>
    <p class="muted small">You can read these to keep children and your teachers safe. You cannot write in them. Families and teachers are told that the school can read their messages. Only messages sent since each teacher joined your school are shown.</p>
    ${rows.length?`<details><summary>${rows.length} ${rows.length===1?"message":"messages"}</summary>${rows.slice(0,120).map(m=>{ const w=new Date(m.created_at), t=esc(m.teacher_name||"(teacher)"), l=esc(m.learner_name||"(family)");
      return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · ${m.from_teacher?t+" → "+l:l+" → "+t}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</div></div>` }).join("")}</details>`
      :`<p class="muted" style="margin:0">No messages yet.</p>`}</div>`;
}
// What a teacher who belongs to a school sees under My classes.
function schoolTeacherClasses(){
  return `<div class="notice" style="margin-top:0">Your school${A.mySchool?", "+esc(A.mySchool.name)+",":""} creates your classes and sets their prices and times. You add the lesson link or address below, and teach. To change a class, ask your school.</div>${myClassList()}`;
}
function schoolClassesBox(){
  const s=A.school, team=A.members.filter(t=>t.status!=="suspended");
  const x = A.sEditing && A.sEditing!=="new" ? A.mclasses.find(c=>c.id===A.sEditing) : null, open = A.sEditing==="new" || !!x;
  const tOf=id=>A.members.find(t=>t.id===id)||{};
  return `<div class="box" id="sclasses"><h3>Classes</h3>
    ${PAY.enabled && !(A.payout && A.payout.charges_enabled)?`<div class="notice" style="margin:0 0 10px">Online payment is on, so your classes can't be booked until your school connects Stripe. See Getting paid below.</div>`:""}
    <p class="muted small">Your school creates each class, sets its price and times, and chooses which of your teachers takes it. The teacher adds the lesson link or address, and teaches. ${s.status==="approved"?"":"Classes become public once your school is approved."}</p>
    ${A.mclasses.length?A.mclasses.map(c=>{ const t=tOf(c.teacher_id);
      return `<div class="lesson"><div style="flex:1;min-width:200px"><span class="tag ${c.type}">${c.type==="private"?"Private lesson":"Small group · up to "+c.capacity}</span> <b>${esc(c.title)}</b>${reviewTag(c)}
        <div class="small muted">Teacher:${esc(t.full_name||"(no name yet)")}${t.status==="pending"?" (not approved yet)":""} · ${esc(c.subject)} · ${c.level} · ages ${c.age_min}${c.age_max>=99?"+":"–"+c.age_max} · ${money(+c.price)} · ${c.days.map(d=>DAY3[d]).join(", ")} at ${c.start_time.slice(0,5)} (${esc((t.timezone||"UTC").replace(/_/g," "))} time) · ${c.duration_min} min · ${c.mode==="in_person"?"In person"+(c.place_city?" · "+esc(c.place_city):""):"Online"}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" onclick="A.sEditing='${c.id}';A.sRemoving=null;render();$('#sclassf')?.scrollIntoView({block:'center'})">Edit</button><button class="btn ghost sm" onclick="removeSchoolClass('${c.id}')">${A.sRemoving===c.id?"Confirm remove":"Remove"}</button></div></div>` }).join("")
      :`<div class="empty" style="margin-bottom:12px">No classes yet.</div>`}
    ${open ? schoolClassForm(x, team)
      : team.length ? `<button class="btn sm" style="margin-top:10px" onclick="A.sEditing='new';render();$('#sclassf')?.scrollIntoView({block:'center'})">Create a class</button>`
      : `<p class="small muted" style="margin:10px 0 0">Invite a teacher with the link above. Once they have joined, you can create classes for them.</p>`}
  </div>`;
}
function schoolClassForm(x, team){
  const locked = !!x && classHasUpcoming(x.id), dis = locked ? "disabled" : "", v = x || {type:"group",capacity:6,age_min:8,age_max:16,level:"Beginner",days:[],start_time:"16:00",duration_min:60,mode:"online",price:"",title:"",subject:"",language:"",place_city:"",teacher_id:team[0]?.id};
  return `<form class="row" id="sclassf" novalidate onsubmit="event.preventDefault();saveSchoolClass(this)" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
    <h3 style="grid-column:1/-1;margin:0">${x?"Edit class":"Create a class"}</h3>
    ${locked?`<div class="notice" style="grid-column:1/-1;margin:0">This class has upcoming bookings, so its days, time, length, kind and place can't be changed. You can still change the teacher, title, subject, language, level, ages, price and class size.</div>`:""}
    <label class="field" style="grid-column:1/-1">Teacher<select name="teacher" id="sc2-teacher">${team.map(t=>`<option value="${t.id}" ${t.id===v.teacher_id?"selected":""}>${esc(t.full_name||"(no name yet)")} (${esc((t.timezone||"UTC").replace(/_/g," "))} time)${t.status==="pending"?" (not approved yet)":""}</option>`).join("")}</select></label>
    <label class="field" style="grid-column:1/-1">Class title<input name="title" id="sc2-title" maxlength="140" value="${esc(v.title)}"></label>
    <label class="field">Subject${subjectSelect("sc2-subject", v.subject)}</label>
    <label class="field">Teaching language<input name="lang" id="sc2-lang" maxlength="60" value="${esc(v.language)}"></label>
    <label class="field">Student level<select name="level" id="sc2-level">${["Beginner","Intermediate","Advanced"].map(l=>`<option ${l===v.level?"selected":""}>${l}</option>`).join("")}</select></label>
    <label class="field">Price per lesson (USD)<input name="price" id="sc2-price" type="number" min="1" value="${v.price===""?"":+v.price}"></label>
    <label class="field">Kind of class<select name="type" id="sc2-type" ${dis} onchange="$('#sc2-capwrap').hidden=this.value==='private'"><option value="group" ${v.type==="group"?"selected":""}>Small group class</option><option value="private" ${v.type==="private"?"selected":""}>Private lesson</option></select></label>
    <label class="field" id="sc2-capwrap" ${v.type==="private"?"hidden":""}>Maximum class size<input name="cap" id="sc2-cap" type="number" min="2" max="50" value="${v.type==="group"?v.capacity:6}"></label>
    <label class="field">Youngest age<input name="a0" id="sc2-a0" type="number" min="3" value="${v.age_min}"></label>
    <label class="field">Oldest age<input name="a1" id="sc2-a1" type="number" min="3" value="${v.age_max>=99?"":v.age_max}" placeholder="no limit"></label>
    <label class="field">Where<select name="mode" id="sc2-mode" ${dis} onchange="$('#sc2-placewrap').hidden=this.value!=='in_person'"><option value="online" ${v.mode!=="in_person"?"selected":""}>Online</option><option value="in_person" ${v.mode==="in_person"?"selected":""}>In person</option></select></label>
    <label class="field" id="sc2-placewrap" ${v.mode==="in_person"?"":"hidden"}>City or area (public)<input name="place" id="sc2-place" maxlength="120" value="${esc(v.place_city||"")}" data-place="city" autocomplete="off"></label>
    <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend>Days</legend><div class="chips">${DAY3.map((d,i)=>`<label class="chip"><input type="checkbox" name="day" value="${i}" ${v.days.includes(i)?"checked":""} ${dis}> ${d}</label>`).join("")}</div></fieldset>
    <label class="field">Start time, on the teacher's clock<input name="time" id="sc2-time" type="time" value="${v.start_time.slice(0,5)}" ${dis}></label>
    <label class="field">Lesson length (minutes)<input name="mins" id="sc2-mins" type="number" min="15" step="5" value="${v.duration_min}" ${dis}></label>
    <p class="small muted" style="grid-column:1/-1;margin:0">Class times are kept in the chosen teacher's time zone, shown next to their name. A class can be handed to another of your teachers only if both are in the same time zone.</p>
    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap"><button class="btn">${x?"Save changes":"Create class"}</button><button type="button" class="btn ghost" onclick="A.sEditing=null;render()">Cancel</button></div>
  </form>`;
}
async function saveSchoolClass(f){
  const x = A.sEditing && A.sEditing!=="new" ? A.mclasses.find(c=>c.id===A.sEditing) : null;
  const title=f.title.value.trim(), subject=f.subject.value.trim(), lang=f.lang.value.trim(), price=+f.price.value, a0=+f.a0.value, a1=Math.min(99,+f.a1.value||99);
  if(!f.teacher.value) return toast("Choose a teacher");
  if(!title || !subject || !lang) return toast("Fill in the title, subject and teaching language");
  if(!(price>0)) return toast("Enter a price above zero");
  if(!(a0>=3) || a1<a0) return toast("Check the ages: the oldest must be the same as or above the youngest");
  const row={teacher_id:f.teacher.value,title,subject,language:lang,level:f.level.value,price,age_min:a0,age_max:a1};
  if(x && classHasUpcoming(x.id)){
    if(x.type==="group") row.capacity=Math.max(2,+f.cap.value||x.capacity);
  } else {
    const days=[...f.querySelectorAll("[name=day]:checked")].map(d=>+d.value), type=f.type.value, mode=f.mode.value, place=f.place.value.trim(), mins=+f.mins.value;
    if(!days.length) return toast("Choose at least one day");
    if(!f.time.value) return toast("Enter the start time");
    if(!(mins>=15 && mins<=240)) return toast("Lesson length must be between 15 and 240 minutes");
    if(mode==="in_person" && !place) return toast("Enter the city or area where the class takes place");
    Object.assign(row,{type,capacity:type==="private"?1:Math.max(2,+f.cap.value||6),days,start_time:f.time.value,duration_min:mins,mode,place_city:mode==="in_person"?place:""});
  }
  const r = x ? await sb.from("classes").update(row).eq("id",x.id).select("id").maybeSingle() : await sb.from("classes").insert(row).select("id").maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "The class could not be saved");
  A.sEditing=null; await loadSchoolExtras(); await loadPublic(); toast(savedWords((A.mclasses.find(c=>c.id===r.data.id)||{}).review_status, x?"Class updated":"Class created")); render();
}
async function removeSchoolClass(id){
  if(A.sRemoving!==id){ A.sRemoving=id; render(); return }
  A.sRemoving=null;
  const r = await sb.from("classes").delete().eq("id",id);
  if(r.error){ toast(r.error.message); render(); return }
  if(A.sEditing===id) A.sEditing=null;
  await loadSchoolExtras(); await loadPublic(); toast("Class removed"); render();
}

/* ---------- alerts: what happened on your account. The same alerts are emailed unless email is switched off ---------- */
async function loadAlerts(){
  if(!A.user) return;
  const r = await sb.from("notifications").select("id,kind,title,body,link,created_at,read_at").order("created_at",{ascending:false}).limit(60);
  if(!r.error) A.alerts = r.data || [];
}
function alertsPage(){
  if(!A.user) return `<div class="wrap page"><h2>Alerts</h2><div class="notice"><a href="#/account">Sign in</a> to see your alerts.</div></div>`;
  const fresh=A.alerts.filter(x=>!x.read_at).length;
  if(fresh) setTimeout(async()=>{ if(routeName()!=="alerts") return; await sb.rpc("mark_notifications_read"); const now=new Date().toISOString(); A.alerts.forEach(x=>{ if(!x.read_at){ x.read_at=now; x.wasNew=true } }); chrome() },800);
  return `<div class="wrap page" style="max-width:760px"><h2>Alerts</h2>
    <p class="muted">Bookings, cancellations, messages, reminders and decisions about your account. ${A.alertEmail?"These are also emailed to you.":"Email alerts are switched off for your account."} You can change that under Password and account.</p>
    ${A.alerts.length?A.alerts.map(x=>{ const w=new Date(x.created_at), isNew=!x.read_at||x.wasNew;
      return `<a class="lesson" href="${esc(x.link||"#/alerts")}" style="text-decoration:none;color:inherit"><div style="flex:1;min-width:0"><b>${esc(x.title)}</b>${isNew?` <span class="tag ok">New</span>`:""}${x.body?`<div class="small muted" style="margin-top:2px;overflow-wrap:anywhere">${esc(x.body)}</div>`:""}</div><span class="small muted" style="white-space:nowrap">${fmtDay(w)}, ${fmtTime(w)}</span></a>` }).join("")
      :`<div class="empty">No alerts yet. When something happens on your account, it shows here.</div>`}
  </div>`;
}
async function setAlertEmail(on){
  const r = await sb.from("notification_prefs").upsert({user_id:A.user.id,email:on},{onConflict:"user_id"});
  if(r.error){ toast(r.error.message); render(); return }
  A.alertEmail=on; toast(on?"Email alerts are on":"Email alerts are off. Alerts still show on the site."); render();
}
// Keep the alert and message counts fresh while the page is open and in view.
setInterval(async()=>{
  if(!A.user || document.visibilityState!=="visible") return;
  const before=A.alerts.filter(x=>!x.read_at).length+A.contacts.reduce((s,c)=>s+(c.unread||0),0);
  await loadAlerts();
  if(A.teacher || A.learner){ const mc = await sb.rpc("my_message_contacts"); if(!mc.error) A.contacts = mc.data || [] }
  const after=A.alerts.filter(x=>!x.read_at).length+A.contacts.reduce((s,c)=>s+(c.unread||0),0);
  chrome();
  if(after>before){ toast("You have a new alert"); if(["alerts","messages"].includes(routeName()) && !$("#msg-body")?.value) render() }
},90000);

/* ---------- messages between a teacher and a family that booked one of their classes ---------- */
function messagesPage(other){
  if(!A.user) return `<div class="wrap page"><h2>Messages</h2><div class="notice"><a href="#/account">Sign in</a> to read your messages.</div></div>`;
  if(!A.teacher && !A.learner) return `<div class="wrap page"><h2>Messages</h2><div class="notice">Messages are between teachers and the students and parents who booked their classes.</div></div>`;
  const c = other ? A.contacts.find(x=>x.other_id===other) : null;
  if(other && !c) return `<div class="wrap page"><h2>Messages</h2><div class="notice">You can message each other once a lesson has been booked. <a href="#/messages">Back to messages</a></div></div>`;
  if(c){ if(A.threadWith!==other) openThread(other); return threadView(c) }
  A.threadWith=null;
  return `<div class="wrap page"><h2>Messages</h2>
    <p class="muted">${A.teacher?"You can write to the students and parents who have booked your classes.":"You can write to the teachers whose classes you have booked."} Keep messages about the lessons. SeastackSchool, and the teacher's school if they belong to one, can read messages to keep families and teachers safe.</p>
    ${A.contacts.length?A.contacts.map(x=>`<a class="lesson" href="#/messages/${x.other_id}" style="text-decoration:none;color:inherit"><div style="flex:1;min-width:0"><b>${esc(x.other_name||"(no name)")}</b> <span class="small muted">${esc(x.detail)}</span>${x.unread?` <span class="tag ok">${x.unread} new</span>`:""}
        <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.last_body?esc(x.last_body):"No messages yet"}</div></div>
        <span class="small muted">${x.last_at?fmtDay(new Date(x.last_at)):""}</span></a>`).join("")
      :`<div class="empty">${A.teacher?"Nobody has booked your classes yet. When they do, you can message them here.":"Book a class and you can message its teacher here."}</div>`}
  </div>`;
}
function threadView(c){
  const mineIsTeacher=!!A.teacher, list=A.thread;
  return `<div class="wrap page" style="max-width:760px">
    <div class="crumbs"><a href="#/messages">← All messages</a></div>
    <h2 style="margin:8px 0 2px">${esc(c.other_name||"(no name)")}</h2><div class="small muted" style="margin-bottom:12px">${esc(c.detail)} · SeastackSchool, and the teacher's school if they belong to one, can read messages to keep families and teachers safe.</div>
    <div class="box" id="thread" style="display:flex;flex-direction:column;gap:8px">
      ${list===null?`<p class="muted" style="margin:0">Loading…</p>`:list.length?list.map(m=>{ const mine=m.from_teacher===mineIsTeacher, w=new Date(m.created_at);
        return `<div style="align-self:${mine?"flex-end":"flex-start"};max-width:85%;background:${mine?"var(--pen-soft)":"var(--surface)"};border:1px solid var(--line);border-radius:12px;padding:8px 12px">
          <div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</div><div class="small muted" style="margin-top:2px">${mine?"You":esc(c.other_name||"")} · ${fmtDay(w)}, ${fmtTime(w)}</div></div>` }).join("")
        :`<p class="muted" style="margin:0">No messages yet. Say hello.</p>`}
      <span id="msgend"></span></div>
    <form id="msgf" novalidate onsubmit="event.preventDefault();sendMsg(this,'${c.other_id}')" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:12px">
      <label class="field" style="flex:1;min-width:220px">Your message<textarea name="body" id="msg-body" rows="2" maxlength="2000"></textarea></label>
      <button class="btn">Send</button></form>
  </div>`;
}
async function loadThread(other){
  let q = sb.from("messages").select("*").order("created_at").limit(300);
  q = A.teacher ? q.eq("teacher_id",A.user.id).eq("learner_id",other) : q.eq("learner_id",A.user.id).eq("teacher_id",other);
  const r = await q; return r.data || [];
}
async function openThread(other){
  A.threadWith=other; A.thread=null;
  const list = await loadThread(other);
  if(A.threadWith!==other) return;
  A.thread=list;
  const c=A.contacts.find(x=>x.other_id===other);
  if(c && c.unread){ await sb.rpc("mark_messages_read",{p_other:other}); c.unread=0; chrome() }
  if(routeName()==="messages"){ render(); $("#msgend")?.scrollIntoView({block:"nearest"}) }
}
async function sendMsg(f, other){
  const body=f.body.value.trim();
  if(!body) return toast("Write your message first");
  const r = await sb.rpc("send_message",{p_other:other,p_body:body});
  if(r.error) return toast(r.error.message);
  A.thread = await loadThread(other);
  const c=A.contacts.find(x=>x.other_id===other); if(c){ c.last_body=body; c.last_at=new Date().toISOString() }
  render(); $("#msgend")?.scrollIntoView({block:"nearest"}); $("#msg-body")?.focus();
}
/* ---------- staff: two levels. An admin decides about people and content; the admin boss decides about money,
   staff and rules. The database enforces every limit below; these screens only show what each level may do. ---------- */

// Staff sign in with a second step: a 6-digit code from an authenticator app. An admin cannot work without it.
function twoStepPage(){
  const enrolled = !!(A.staff && A.staff.enrolled), m = A.mfa;
  const form = `<form novalidate onsubmit="event.preventDefault();twoStepVerify(this.code.value)" style="margin-top:12px">
      <label class="field">6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="max-width:160px;font-size:20px;letter-spacing:.2em"></label>
      <button class="btn" style="margin-top:10px">Continue</button></form>`;
  const foot = `<p class="small muted" style="margin-top:16px">${A.admin?`<button class="btn sm ghost" onclick="A.twoStep=false;A.mfa=null;render()">Not now</button>`:`Signed in as ${esc(A.user.email)}. <button class="btn sm ghost" onclick="signOut()">Sign out</button>`}</p>`;
  if(enrolled) return `<div class="wrap page" style="max-width:560px"><h2>Two-step sign-in</h2>
    <p class="muted">Staff accounts need a second step. Open the authenticator app on your phone and type the code it shows for SeastackSchool.</p>${form}
    <p class="small muted" style="margin-top:16px">Lost your phone? Ask an admin boss to reset your second step from the Staff tab.</p>${foot}</div>`;
  if(!m) return `<div class="wrap page" style="max-width:560px"><h2>Set up two-step sign-in</h2>
    <p class="muted">${A.admin?"":"Staff accounts cannot be used until this is done. "}You need an authenticator app on your phone, for example Google Authenticator or Microsoft Authenticator. Both are free. After this, signing in asks for your password and then a 6-digit code from that app.</p>
    <button class="btn" onclick="twoStepStart()">I have the app. Start</button>${foot}</div>`;
  return `<div class="wrap page" style="max-width:560px"><h2>Set up two-step sign-in</h2>
    <ol class="muted" style="padding-left:20px"><li>Open the authenticator app and choose to add an account.</li><li>Scan this picture with the app.</li><li>Type the 6-digit code the app now shows.</li></ol>
    <img src="${esc(m.qr)}" alt="Code to scan with your authenticator app" style="width:200px;height:200px;background:#fff;padding:8px;border-radius:8px;display:block">
    <p class="small muted" style="overflow-wrap:anywhere">Cannot scan? Type this key into the app instead: <b>${esc(m.secret)}</b></p>${form}${foot}</div>`;
}
async function twoStepStart(){
  const lf = await sb.auth.mfa.listFactors();
  for(const f of ((lf.data && lf.data.all) || [])) if(f.status!=="verified") await sb.auth.mfa.unenroll({factorId:f.id});
  const r = await sb.auth.mfa.enroll({factorType:"totp", friendlyName:"SeastackSchool "+new Date().toISOString().slice(0,19), issuer:"SeastackSchool"});
  if(r.error) return toast(r.error.message);
  A.mfa = {factorId:r.data.id, qr:r.data.totp.qr_code, secret:r.data.totp.secret}; render();
}
async function twoStepVerify(code){
  code = String(code||"").replace(/\D/g,"");
  if(code.length!==6) return toast("Type the 6-digit code from the app");
  let fid = A.mfa && A.mfa.factorId;
  if(!fid){ const lf = await sb.auth.mfa.listFactors(); fid = (((lf.data && lf.data.totp) || [])[0] || {}).id }
  if(!fid) return toast("No second step is set up for this account yet");
  const r = await sb.auth.mfa.challengeAndVerify({factorId:fid, code});
  if(r.error) return toast("That code was not accepted. Codes change every 30 seconds, so type the newest one.");
  A.mfa=null; A.twoStep=false; await refresh(); toast("Two-step sign-in is on");
}

// A private conversation is opened one at a time, for a stated reason, and every opening is logged.
async function readConv(tid, lid, whyId, reportId){
  const why = reportId ? "Checking a report about this teacher" : (whyId && $("#"+whyId) ? $("#"+whyId).value.trim() : "");
  if(why.length<5) return toast("Write why you are reading these messages");
  const r = await sb.rpc("staff_read_conversation",{p_teacher:tid,p_learner:lid,p_reason:why,p_report:reportId||null});
  if(r.error) return toast(r.error.message);
  A.conv = {tn:((A.rows||[]).find(x=>x.id===tid)||{}).full_name||"Teacher", ln:((A.lrows||[]).find(x=>x.id===lid)||{}).full_name||"Family", rows:r.data||[]};
  const lg = await sb.rpc("staff_list_audit",{p_limit:300}); if(!lg.error) A.log = lg.data || [];
  render(); const el=$("#convbox"); if(el) el.scrollIntoView({block:"nearest"});
}
function convBox(){
  const c=A.conv; if(!c) return "";
  return `<div class="box" id="convbox" style="margin:12px 0"><div class="results-head" style="margin:0 0 6px"><h3 style="margin:0">Messages between ${esc(c.tn)} and ${esc(c.ln)}</h3><button class="btn sm ghost" onclick="A.conv=null;render()">Close</button></div>
    <p class="small muted" style="margin:0 0 6px">You opened this conversation; that is recorded in the activity log. You cannot write in it.</p>
    ${c.rows.length?c.rows.map(m=>{ const w=new Date(m.created_at); return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · ${m.from_teacher?esc(c.tn)+" (teacher)":esc(c.ln)}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</div></div>` }).join(""):`<p class="muted" style="margin:0">They have not written to each other.</p>`}</div>`;
}

// Requests: what an admin may not do alone (a refund, cancelling a paid booking, approving a school) is asked of the boss.
const REQ_KIND = {refund:"Refund a payment", cancel_paid_booking:"Cancel a paid booking and refund it", school_approve:"Approve a school"};
function reqWaiting(kind,id){ return (A.reqs||[]).some(q=>q.status==="pending" && q.kind===kind && q.target_id===id) }
async function sendRequest(kind,id,inputId){
  const el=$("#"+inputId), why=el?el.value.trim():"";
  if(why.length<5) return toast(kind==="school_approve"?"Write what you found in the note first; the admin boss reads it":"Write the reason for the admin boss first");
  const r = await sb.rpc("staff_request",{p_kind:kind,p_target:id,p_reason:why});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); toast("Sent to the admin boss"); render();
}
function adminRequests(){
  const rows=A.reqs||[];
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">${A.boss?"Admins cannot refund money, cancel a paid booking or approve a school. They ask here. Check each request before you approve it: the amount and the booking are checked again at that moment, and a request can be approved only once. You cannot decide a request you sent yourself.":"Refunds, cancelling a paid booking and approving a school are the admin boss's decisions. You ask from the Bookings or Schools tab; your requests and the answers show here."}</p>
    ${rows.length?`<div class="scroll"><table class="admin" style="min-width:860px"><thead><tr><th>Asked</th><th>What</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${rows.map(q=>{ const d=q.detail||{}, w=d.starts_at?new Date(d.starts_at):null; return `<tr>
      <td class="small">${new Date(q.requested_at).toLocaleDateString()}<div class="muted" style="overflow-wrap:anywhere">${q.mine?"by you":"by "+esc(q.requested_email||"(account removed)")}</div></td>
      <td><b>${REQ_KIND[q.kind]||esc(q.kind)}</b><div class="small">${esc(q.label)}</div>${w?`<div class="small muted">Lesson: ${fmtDay(w)}, ${fmtTime(w)}</div>`:""}${q.amount_cents?`<div class="small">Amount going back to the family: <b>${usd(q.amount_cents)}</b></div>`:""}</td>
      <td class="small" style="max-width:280px;white-space:pre-line;overflow-wrap:anywhere">${esc(q.reason)}</td>
      <td><span class="tag ${q.status==="approved"?"ok":q.status==="refused"?"bad":"group"}">${q.status==="pending"?"Waiting":q.status==="approved"?"Approved":"Refused"}</span>${q.decided_at?`<div class="small muted" style="margin-top:4px">${new Date(q.decided_at).toLocaleDateString()}${q.decided_email?" by "+esc(q.decided_email):""}</div>`:""}${q.decision_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(q.decision_note)}</div>`:""}</td>
      <td>${q.status!=="pending"?"":!A.boss?`<span class="small muted">Waiting for the admin boss</span>`:q.mine?`<span class="small muted">Your own request. Another admin boss decides it.</span>`
        :`<input id="dnote-${q.id}" aria-label="Note" placeholder="Note (optional)" maxlength="1000" value="${A.deciding===q.id?esc(A.decNote||""):""}"><div class="acts"><button class="btn sm" onclick="decideRequest('${q.id}',true)">${A.deciding===q.id?"Confirm: approve"+(q.amount_cents?" and refund "+usd(q.amount_cents):""):"Approve"}</button><button class="btn sm ghost" onclick="decideRequest('${q.id}',false)">Refuse</button></div>`}</td>
    </tr>` }).join("")}</tbody></table></div>`:`<div class="empty">No requests yet.</div>`}
  </div>`;
}
async function decideRequest(id, yes){
  const note = ($("#dnote-"+id) ? $("#dnote-"+id).value.trim() : "") || null;
  if(yes && A.deciding!==id){ A.deciding=id; A.decNote=note||""; render(); return }
  A.deciding=null;
  const q=(A.reqs||[]).find(x=>x.id===id)||{};
  const r = await sb.rpc("boss_decide_request",{p_id:id,p_approve:yes,p_note:note});
  if(r.error){ toast(r.error.message); render(); return }
  if(yes && q.kind!=="school_approve"){ try{ await sb.functions.invoke("stripe-refunds",{body:{}}) }catch(e){} }
  await loadAdmin(); await loadPublic(); toast(yes?"Approved and carried out":"Refused"); render();
}

// Emergency stop: any staff member can pause new bookings; only the boss starts them again.
async function pauseNow(){
  const el=$("#pause-why"), why=el?el.value.trim():"";
  if(why.length<5) return toast("Write why booking should be paused");
  const r = await sb.rpc("staff_pause_bookings",{p_reason:why});
  if(r.error) return toast(r.error.message);
  await loadPublic(); await loadAdmin(); toast("New bookings are paused. The admin boss has been told."); render();
}
async function setPaused(on){
  const el=$("#set-pause-note"), note=el?el.value.trim():"";
  const r = await sb.rpc("boss_set_settings",{p_paused:on,p_pause_note:on?(note||null):null});
  if(r.error) return toast(r.error.message);
  await loadPublic(); await loadAdmin(); toast(on?"New bookings are paused":"Bookings are open again"); render();
}
async function saveRules(){
  const fee=parseInt($("#set-fee").value,10), hours=parseInt($("#set-hours").value,10);
  if(!(fee>=0 && fee<=50)) return toast("The fee must be between 0 and 50 percent");
  if(!(hours>=0 && hours<=168)) return toast("The refund window must be between 0 and 168 hours");
  if(fee===PAY.fee && hours===PAY.hours) return toast("Nothing changed");
  if(!A.rules || A.rules.fee!==fee || A.rules.hours!==hours){ A.rules={fee,hours}; render(); return }
  A.rules=null;
  const r = await sb.rpc("boss_set_settings",{p_fee_percent:fee,p_refund_hours:hours});
  if(r.error) return toast(r.error.message);
  await loadPublic(); await loadAdmin(); toast("Saved. The new rules apply to lessons booked from now on."); render();
}
function bossSettingsBox(){
  const d=A.rules||{fee:PAY.fee,hours:PAY.hours};
  return `<div class="box" style="margin-bottom:14px"><h3>Rules for new bookings</h3>
      <p class="muted small" style="margin:0 0 10px">A change applies to lessons booked from now on. A lesson that is already paid for keeps the fee and the refund window it was booked under. Every change is recorded in the activity log.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end"><label class="field" style="margin:0">SeastackSchool's fee, percent<input id="set-fee" type="number" min="0" max="50" value="${d.fee}" style="max-width:120px"></label>
        <label class="field" style="margin:0">Full refund if cancelled this many hours before<input id="set-hours" type="number" min="0" max="168" value="${d.hours}" style="max-width:120px"></label>
        <button class="btn sm" onclick="saveRules()">${A.rules?"Confirm: fee "+d.fee+"%, refund window "+d.hours+" hours":"Save"}</button></div></div>
    <div class="box" style="margin-bottom:14px"><h3>Pause new bookings</h3>
      ${PAY.paused?`<p style="margin:0 0 10px"><b>Paused.</b> Nobody can book. Lessons already booked go ahead, and nothing becomes free.${PAY.pauseNote?" Shown to visitors: "+esc(PAY.pauseNote):""}</p><button class="btn sm" onclick="setPaused(false)">Open bookings again</button>`
        :`<p class="muted small" style="margin:0 0 10px">Stops every new booking, paid or free, without changing whether lessons are paid. Use it for a payment fault or a safety incident. Switching payment off is different: it makes booking free.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="set-pause-note" aria-label="Short note shown to visitors" placeholder="Short note shown to visitors (optional)" maxlength="300" style="flex:1;min-width:200px"><button class="btn sm ghost" onclick="setPaused(true)">Pause new bookings</button></div>`}</div>`;
}

// Activity log: what staff did, in plain words. Written by the database; nobody can change or delete a line.
function auditWhat(x){
  const d=x.detail||{}, has=k=>Object.prototype.hasOwnProperty.call(d,k), to=k=>d[k]?d[k][1]:undefined, from=k=>d[k]?d[k][0]:undefined;
  const st=(noun)=>has("status") ? (to("status")==="approved"||to("status")==="active" ? (from("status")==="suspended"?"Restored ":"Approved ")+noun : to("status")==="suspended" ? "Suspended "+noun : "Set "+noun+" to "+to("status")) : null;
  switch(x.action){
    case "teacher.change": return st("a teacher") || (has("identity_checked_at") ? (to("identity_checked_at")?"Marked a teacher's identity as checked":"Removed a teacher's identity check") : has("photo") ? "Removed a profile photo" : "Changed a teacher");
    case "learner.change": return st("a student or parent account") || "Changed an account";
    case "school.change": return st("a school") || "Changed a school";
    case "affiliate.change": return st("an affiliate") || "Changed an affiliate";
    case "review.change": return to("hidden") ? "Hid a rating" : "Showed a rating again";
    case "report.change": return to("status")==="open" ? "Reopened a report" : "Marked a report as dealt with";
    case "help.change": return to("status")==="open" ? "Reopened a Help message" : "Marked a Help message as dealt with";
    case "qualification.change": return to("verified_at") ? "Verified a qualification" : "Removed a qualification's verification";
    case "booking.change": return has("status") ? "Cancelled a booking" : "Decided attendance: "+(to("attendance")==="no_show"?"did not attend":"attended");
    case "payment.change": return to("status")==="refund_due" ? "Sent a refund" : "Changed a payment to "+to("status");
    case "settings.change": return [has("enabled")?"Switched online payment "+(to("enabled")?"on":"off"):"", has("paused")?(to("paused")?"Paused new bookings":"Opened bookings again"):"", has("fee_percent")?"Changed the fee from "+from("fee_percent")+"% to "+to("fee_percent")+"%":"", has("refund_hours")?"Changed the refund window from "+from("refund_hours")+" to "+to("refund_hours")+" hours":""].filter(Boolean).join("; ") || "Changed a setting";
    case "bookings.pause": return "Paused new bookings (emergency)";
    case "class.approve": return "Approved a class";
    case "class.hide": return "Hid a class";
    case "subject.add": return "Added a subject to the list";
    case "subject.retire": return "Retired a subject from the list";
    case "term.add": return "Added a word to the automatic check";
    case "term.remove": return "Removed a word from the automatic check";
    case "documents.open": return "Opened private documents";
    case "conversation.read": return "Read a private conversation";
    case "request.send": return "Asked the admin boss: "+(REQ_KIND[d.kind]||"a decision").toLowerCase();
    case "request.approve": return "Approved a request: "+(REQ_KIND[d.kind]||"").toLowerCase();
    case "request.refuse": return "Refused a request: "+(REQ_KIND[d.kind]||"").toLowerCase();
    case "staff.add": return "Added staff as "+(d.role==="boss"?"admin boss":"admin");
    case "staff.role": return "Changed a staff level to "+(d.role==="boss"?"admin boss":"admin");
    case "staff.remove": return "Removed staff";
    case "staff.two_step_reset": return "Reset a staff member's second step";
    default: return x.action;
  }
}
function adminLog(){
  const rows=A.log||[], f=A.logFilter||"all";
  const sens=x=>["documents.open","conversation.read"].includes(x.action), money=x=>["payment.change","settings.change","bookings.pause"].includes(x.action)||x.action.startsWith("request.");
  const list=f==="private"?rows.filter(sens):f==="money"?rows.filter(money):f==="staff"?rows.filter(x=>x.action.startsWith("staff.")):rows;
  const chip=(k,l)=>`<button class="chip" aria-pressed="${f===k}" onclick="A.logFilter='${k}';render()">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">${A.boss?"Everything staff have done, newest first":"What you have done, newest first. The admin boss sees everyone's"}: who, what, to whom and why. The database writes each line by itself, including when someone opens a private document or reads a conversation. Nobody, the admin boss included, can change or delete a line. It starts on the day this log was switched on.</p>
    <div class="chips" style="margin-bottom:14px">${chip("all","All ("+rows.length+")")}${chip("private","Private documents and messages ("+rows.filter(sens).length+")")}${chip("money","Money, requests and settings ("+rows.filter(money).length+")")}${A.boss?chip("staff","Staff ("+rows.filter(x=>x.action.startsWith("staff.")).length+")"):""}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:820px"><thead><tr><th>When</th><th>Who</th><th>What</th><th>About</th><th>Reason</th></tr></thead><tbody>
    ${list.map(x=>{ const w=new Date(x.at); return `<tr><td class="small" style="white-space:nowrap">${fmtDay(w)}, ${fmtTime(w)}</td>
      <td class="small" style="overflow-wrap:anywhere">${esc(x.actor_email||"(account removed)")}<div class="muted">${x.actor_role==="boss"?"Admin boss":"Admin"}</div></td>
      <td>${esc(auditWhat(x))}</td><td class="small" style="overflow-wrap:anywhere">${esc(x.target_kind==="review"?"":x.target_label||"")}</td>
      <td class="small" style="max-width:260px;overflow-wrap:anywhere">${esc(x.reason||"")}</td></tr>` }).join("")}</tbody></table></div>${rows.length>=300?`<p class="small muted">Showing the 300 most recent lines.</p>`:""}`
    :`<div class="empty">${rows.length?"Nothing in this list.":"Nothing has been recorded yet."}</div>`}
  </div>`;
}

/* ---------- the system filter for classes: every new or edited class passes an automatic check. A class that
   passes is public at once; one that trips a rule is held until staff look at it. Subjects come from one list. ---------- */
const FLAG_WORDS = {contact:"Seems to contain contact details or a link", offsite_payment:"Mentions paying outside SeastackSchool", blocked_word:"Contains a word that is checked by hand",
  high_price:"Unusually high price", child_in_person:"In person with children under 13", mixed_ages:"Young children and adults in one group"};
function flagList(f){ return (f||[]).map(x=>FLAG_WORDS[x]||x) }
// Shown to the teacher or school beside their own class.
function reviewTag(x){
  if(!x || !x.review_status || x.review_status==="approved") return "";
  if(x.review_status==="pending") return `<div class="small" style="margin-top:4px"><span class="tag group">Being checked, not public yet</span> <span class="muted">${esc(flagList(x.review_flags).join("; ")||"Changed after it was hidden")}. SeastackSchool staff will look at it. If something here is a mistake, edit the class.</span></div>`;
  return `<div class="small" style="margin-top:4px"><span class="tag bad">Hidden by SeastackSchool</span> <span class="muted">${esc(x.review_note||"")} Edit the class to fix it and staff will look again.</span></div>`;
}
function savedWords(status, ok){ return status==="pending" ? "Saved. This class is being checked by SeastackSchool before it goes public." : ok }
// The subject is chosen from the official list. A class that still has a retired subject keeps it until changed.
function subjectSelect(id, cur){
  const list=(window.SUBJ_LIST||[]).slice(); if(cur && !list.includes(cur)) list.unshift(cur);
  if(!list.length) return `<input name="subject" id="${id}" maxlength="60" value="${esc(cur||"")}">`;
  return `<select name="subject" id="${id}"><option value="">Choose a subject</option>${list.map(s=>`<option ${s===cur?"selected":""}>${esc(s)}</option>`).join("")}</select>`;
}

// Staff: every class on the site, with filters. Approve a held class, or hide any class with a reason the teacher sees.
function adminClasses(){
  const rows=A.crows||[], f=A.cfilter||"pending", n=s=>rows.filter(r=>r.review_status===s).length;
  const q=(A.cq||"").trim().toLowerCase(), subs=[...new Set(rows.map(r=>r.subject))].sort();
  const list=rows.filter(r=>(f==="all"||r.review_status===f) && (!A.csub||r.subject===A.csub) && (!A.cmode||r.mode===A.cmode) && (!A.cflag||(r.review_flags||[]).includes(A.cflag))
    && (!q || (r.title+" "+(r.teacher_name||"")+" "+(r.teacher_email||"")+" "+(r.school_name||"")).toLowerCase().includes(q)));
  const chip=(k,l)=>`<button class="chip" aria-pressed="${f===k}" onclick="A.cfilter='${k}';render()">${l}</button>`;
  const opt=(v,l,cur)=>`<option value="${esc(v)}" ${v===(cur||"")?"selected":""}>${esc(l)}</option>`;
  const cfg=A.fcfg||{subjects:[],terms:[]};
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Every class on SeastackSchool. The automatic check reads each new or edited class. A class that passes is public at once. A class that trips a rule waits here, hidden from families, until you approve it or hide it. You can also hide any public class; the teacher is told your reason and can fix it.</p>
    <div class="chips" style="margin-bottom:10px">${chip("pending","Held for you ("+n("pending")+")")}${chip("approved","Public ("+n("approved")+")")}${chip("rejected","Hidden ("+n("rejected")+")")}${chip("all","All ("+rows.length+")")}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <input aria-label="Search classes" placeholder="Search title, teacher or school" value="${esc(A.cq||"")}" onchange="A.cq=this.value;render()" style="flex:1;min-width:200px">
      <select aria-label="Subject" onchange="A.csub=this.value;render()">${opt("","Any subject",A.csub)}${subs.map(s=>opt(s,s,A.csub)).join("")}</select>
      <select aria-label="Where" onchange="A.cmode=this.value;render()">${opt("","Online and in person",A.cmode)}${opt("online","Online",A.cmode)}${opt("in_person","In person",A.cmode)}</select>
      <select aria-label="Reason held" onchange="A.cflag=this.value;render()">${opt("","Any reason",A.cflag)}${Object.keys(FLAG_WORDS).map(k=>opt(k,FLAG_WORDS[k],A.cflag)).join("")}</select>
    </div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:900px"><thead><tr><th>Class</th><th>Teacher</th><th>Price</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>`<tr>
      <td><b>${esc(r.title)}</b><div class="small muted">${esc(r.subject)} · ${esc(r.level)} · ages ${r.age_min}${r.age_max>=99?"+":"–"+r.age_max} · ${r.type==="private"?"Private":"Group of up to "+r.capacity} · ${r.mode==="in_person"?"In person"+(r.place_city?", "+esc(r.place_city):""):"Online"} · taught in ${esc(r.language)}</div>
        <div class="small muted">Listed ${new Date(r.created_at).toLocaleDateString()} · ${r.upcoming} upcoming ${r.upcoming===1?"booking":"bookings"}</div></td>
      <td class="small"><b>${esc(r.teacher_name||"(no name yet)")}</b><div style="overflow-wrap:anywhere">${esc(r.teacher_email)}</div>${r.teacher_status==="approved"?"":`<div style="color:var(--rose)">Teacher is ${esc(r.teacher_status)}</div>`}${r.school_name?`<div class="muted">School: ${esc(r.school_name)}</div>`:""}</td>
      <td>${money(+r.price)}</td>
      <td><span class="tag ${r.review_status==="approved"?"ok":r.review_status==="rejected"?"bad":"group"}">${r.review_status==="approved"?"Public":r.review_status==="rejected"?"Hidden":"Held"}</span>
        ${(r.review_flags||[]).length?`<div class="small" style="margin-top:4px">${flagList(r.review_flags).map(esc).join("<br>")}</div>`:""}
        ${r.review_status==="approved"?`<div class="small muted" style="margin-top:4px">${r.by_system?"Passed the automatic check":"Approved by staff"}</div>`:""}${r.review_note?`<div class="small muted" style="margin-top:4px">Reason given: ${esc(r.review_note)}</div>`:""}</td>
      <td><input id="cnote-${r.id}" aria-label="Reason for ${esc(r.title)}" placeholder="Reason, shown to the teacher (needed to hide)" maxlength="500">
        <div class="acts">${r.review_status!=="approved"?`<button class="btn sm" onclick="reviewClass('${r.id}',true)">Approve</button>`:""}${r.review_status!=="rejected"?`<button class="btn sm ghost" onclick="reviewClass('${r.id}',false)">Hide</button>`:""}</div></td>
    </tr>`).join("")}</tbody></table></div>${rows.length>=1000?`<p class="small muted">Showing the 1000 most recent classes.</p>`:""}`
    :`<div class="empty">${rows.length?(f==="pending"?"No class is waiting for you.":"No classes match."):"No classes have been listed yet."}</div>`}
    <details style="margin-top:22px"><summary>What the automatic check holds, and the lists it uses</summary>
      <p class="small muted" style="margin:10px 0">A class is held when its title, subject, language or place shows any of these: ${Object.values(FLAG_WORDS).map(x=>x.toLowerCase()).join("; ")}. The price rule is above $300 per lesson. Changing a class's days or time does not send it back for checking; changing its title, subject, language, price, ages, kind or place does.</p>
      <h3 style="margin:14px 0 6px">Subjects teachers can choose</h3>
      <p class="small muted" style="margin:0 0 8px">Every class picks one of these, so the subject filter stays tidy. Retiring a subject removes it from the list for new classes; classes that already use it keep it.</p>
      <div class="chips">${cfg.subjects.map((s,i)=>`<span class="chip" style="${s.active?"":"opacity:.55"}">${esc(s.name)} <span class="muted">(${s.classes})</span> <button class="btn sm ghost" style="padding:1px 7px;margin-left:4px" onclick="setSubject(${i},${!s.active})">${s.active?"Retire":"Restore"}</button></span>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="sub-new" aria-label="New subject" placeholder="New subject" maxlength="60" style="flex:1;min-width:180px;max-width:320px"><button class="btn sm" onclick="addSubject()">Add subject</button></div>
      <h3 style="margin:18px 0 6px">Words and phrases checked by hand</h3>
      <p class="small muted" style="margin:0 0 8px">A class whose title contains one of these is held for you. It is not refused: a word like these can be innocent, so a person decides.</p>
      <div class="chips">${cfg.terms.map((t,i)=>`<span class="chip">${esc(t)} <button class="btn sm ghost" style="padding:1px 7px;margin-left:4px" aria-label="Remove ${esc(t)}" onclick="setTerm(${i})">Remove</button></span>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="term-new" aria-label="New word or phrase" placeholder="New word or phrase" maxlength="60" style="flex:1;min-width:180px;max-width:320px"><button class="btn sm" onclick="addTerm()">Add</button></div>
    </details>
  </div>`;
}
async function reviewClass(id, ok){
  const el=$("#cnote-"+id), note=el?el.value.trim():"";
  if(!ok && note.length<5) return toast("Write the reason first. The teacher is shown it.");
  const r = await sb.rpc("staff_review_class",{p_id:id,p_approve:ok,p_note:note||null});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); await loadPublic(); toast(ok?"Class approved. It is public now.":"Class hidden. The teacher has been told why."); render();
}
async function filterDone(r, msg){ if(r.error) return toast(r.error.message); await loadAdmin(); await loadPublic(); toast(msg); render() }
async function addSubject(){ const v=$("#sub-new").value.trim(); if(v.length<2) return toast("Type the subject name"); await filterDone(await sb.rpc("staff_set_subject",{p_name:v,p_active:true}), "Subject added") }
async function setSubject(i, on){ const s=((A.fcfg||{}).subjects||[])[i]; if(!s) return; await filterDone(await sb.rpc("staff_set_subject",{p_name:s.name,p_active:on}), on?"Subject restored":"Subject retired") }
async function addTerm(){ const v=$("#term-new").value.trim(); if(v.length<2) return toast("Type the word or phrase"); await filterDone(await sb.rpc("staff_set_blocked_term",{p_term:v,p_on:true}), "Added. New and edited classes are checked against it.") }
async function setTerm(i){ const t=((A.fcfg||{}).terms||[])[i]; if(!t) return; await filterDone(await sb.rpc("staff_set_blocked_term",{p_term:t,p_on:false}), "Removed") }

// Staff: only the admin boss adds or removes people. There is always at least one admin boss.
function adminStaff(){
  const rows=A.staffRows||[], bosses=rows.filter(s=>s.role==="boss" && s.confirmed).length;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">An <b>admin</b> approves and suspends accounts, checks documents and qualifications, and handles reports. An <b>admin boss</b> also handles money, schools, settings and staff, and can overrule an admin. A staff member uses an email address that has no other SeastackSchool account, so nobody can decide on their own teacher or affiliate account.</p>
    ${bosses<2?`<div class="notice" style="margin:0 0 14px"><b>There is one admin boss.</b> If that person loses access to their email or phone, nobody can add staff or reach the money settings. Add a second admin boss, held by a second trusted person.</div>`:""}
    <div class="box" style="margin-bottom:14px"><h3>Add a staff member</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="field" style="margin:0;flex:1;min-width:220px">Their email address<input id="st-email" type="email" autocomplete="off" maxlength="200"></label>
        <label class="field" style="margin:0">Level<select id="st-role"><option value="admin">Admin</option><option value="boss">Admin boss</option></select></label><button class="btn sm" onclick="staffAdd()">Add</button></div>
      <p class="small muted" style="margin:10px 0 0">Then ask them to create an account on SeastackSchool with exactly that address (any account type) and confirm the email. When they sign in they are asked to set up two-step sign-in; an admin cannot work without it.</p></div>
    <div class="scroll"><table class="admin" style="min-width:760px"><thead><tr><th>Email</th><th>Level</th><th>Account</th><th>Action</th></tr></thead><tbody>
    ${rows.map((s,i)=>`<tr><td style="overflow-wrap:anywhere"><b>${esc(s.email)}</b>${s.me?` <span class="small muted">(you)</span>`:""}</td>
      <td><span class="tag ${s.role==="boss"?"ok":"group"}">${s.role==="boss"?"Admin boss":"Admin"}</span></td>
      <td class="small">${!s.signed_up?"Has not created the account yet":!s.confirmed?"Email not confirmed yet":"Active"}${s.signed_up?`<div class="${s.two_step?"muted":""}" ${s.two_step?"":`style="color:var(--rose)"`}>Two-step sign-in: ${s.two_step?"on":"not set up"}</div>`:""}${s.last_sign_in_at?`<div class="muted">Last signed in ${new Date(s.last_sign_in_at).toLocaleDateString()}</div>`:""}</td>
      <td>${s.me?`<span class="small muted">Another admin boss changes your account</span>`:`<div class="acts" style="margin:0"><button class="btn sm ghost" onclick="staffRole(${i},'${s.role==="boss"?"admin":"boss"}')">${A.staffAsk==="role"+i?"Confirm":"Make "+(s.role==="boss"?"admin":"admin boss")}</button>${s.two_step?`<button class="btn sm ghost" onclick="staffReset(${i})">${A.staffAsk==="reset"+i?"Confirm reset":"Reset two-step (lost phone)"}</button>`:""}<button class="btn sm ghost" onclick="staffRemove(${i})">${A.staffAsk==="rm"+i?"Confirm remove":"Remove"}</button></div>`}</td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
}
async function staffDone(r, msg){
  A.staffAsk=null;
  if(r.error){ toast(r.error.message); render(); return }
  await loadAdmin(); toast(msg); render();
}
async function staffAdd(){
  const email=$("#st-email").value.trim().toLowerCase(), role=$("#st-role").value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter their email address");
  await staffDone(await sb.rpc("boss_add_staff",{p_email:email,p_role:role}), "Added. Ask them to create their account with that address.");
}
function staffConfirm(key){ if(A.staffAsk!==key){ A.staffAsk=key; render(); return false } return true }
async function staffRole(i, role){
  const s=(A.staffRows||[])[i]; if(!s || !staffConfirm("role"+i)) return;
  await staffDone(await sb.rpc("boss_set_staff_role",{p_email:s.email,p_role:role}), "Level changed");
}
async function staffRemove(i){
  const s=(A.staffRows||[])[i]; if(!s || !staffConfirm("rm"+i)) return;
  await staffDone(await sb.rpc("boss_remove_staff",{p_email:s.email}), "Removed from staff");
}
async function staffReset(i){
  const s=(A.staffRows||[])[i]; if(!s || !staffConfirm("reset"+i)) return;
  await staffDone(await sb.rpc("boss_reset_two_step",{p_email:s.email}), "Second step reset. They set it up again when they next sign in.");
}

/* ---------- address help: browser autofill, country list, place suggestions ---------- */
const ISO2 = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW";
function countryNames(){
  try{ const d=new Intl.DisplayNames(["en"],{type:"region"}); return ISO2.split(" ").map(c=>d.of(c)).filter(Boolean).sort((x,y)=>x.localeCompare(y)) }catch(e){ return [] }
}
// Called after every screen is drawn: tells the browser what each field is, so its own autofill can offer saved details,
// gives country fields a pick-list, and marks the fields that get place suggestions.
function fieldHints(){
  if(!$("#countrylist")){ const dl=document.createElement("datalist"); dl.id="countrylist"; dl.innerHTML=countryNames().map(n=>`<option value="${esc(n)}"></option>`).join(""); document.body.appendChild(dl) }
  const set=(sel,attrs)=>document.querySelectorAll(sel).forEach(el=>{ for(const k in attrs) el.setAttribute(k,attrs[k]) });
  set("#pf-name,#ac-name,#af-name",{autocomplete:"name"});
  set("#pf-city,#ac-city,#sc-city",{autocomplete:"address-level2","data-place":"city"});
  set("#pf-country,#ac-country,#sc-country,#af-country",{autocomplete:"country-name",list:"countrylist"});
  set("#sc-name",{autocomplete:"organization"});
  set("#nc-place,#ed-place",{autocomplete:"off","data-place":"city"});
  set("#nc-address",{autocomplete:"street-address","data-place":"address"});
  document.querySelectorAll('input[id^="link-"]').forEach(el=>{ if(/^Address/.test(el.placeholder)){ el.dataset.place="address"; el.setAttribute("autocomplete","street-address") } });
}
const PLACE = {box:null, input:null, items:[], idx:-1, timer:null, seq:0};
function placeClose(){ if(PLACE.box) PLACE.box.remove(); PLACE.box=null; PLACE.items=[]; PLACE.idx=-1 }
async function placeSearch(input){
  const q=input.value.trim(), kind=input.dataset.place;
  if(q.length<3){ placeClose(); return }
  const seq=++PLACE.seq; let feats=[];
  try{
    const r = await fetch("https://photon.komoot.io/api/?limit=6&lang=en&q="+encodeURIComponent(q)+(kind==="city"?"&layer=city&layer=locality&layer=district":""));
    if(r.ok) feats = (await r.json()).features || [];
  }catch(e){}
  if(seq!==PLACE.seq || document.activeElement!==input) return;   // a newer search is running, or they moved on
  const seen=new Set(), items=[];
  feats.forEach(f=>{
    const p=f.properties||{}; let it;
    if(kind==="city") it={value:p.name||"", label:[p.name,p.state,p.country].filter(Boolean).join(", "), country:p.country||""};
    else { const street=[p.housenumber,p.street].filter(Boolean).join(" ") || p.name || "";
      const label=[street, p.city||p.district||p.county, p.state, p.postcode, p.country].filter(Boolean).join(", "); it={value:label, label, country:p.country||""} }
    if(it.value && !seen.has(it.label)){ seen.add(it.label); items.push(it) }
  });
  placeShow(input, items);
}
function placeShow(input, items){
  placeClose(); if(!items.length) return;
  const r=input.getBoundingClientRect(), box=document.createElement("div");
  box.setAttribute("role","listbox"); box.setAttribute("aria-label","Place suggestions");
  box.style.cssText=`position:absolute;z-index:60;left:${Math.max(12,r.left+scrollX)}px;top:${r.bottom+scrollY+4}px;width:${Math.max(r.width,230)}px;max-width:calc(100vw - 24px);background:#fff;color:#282748;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px #0002;overflow:hidden;font-size:14px`;
  box.innerHTML = items.map((it,i)=>`<div role="option" data-i="${i}" style="padding:9px 12px;cursor:pointer">${esc(it.label)}</div>`).join("") + `<div style="padding:5px 12px;font-size:11px;color:var(--muted);border-top:1px solid var(--line)">Suggestions from OpenStreetMap</div>`;
  box.addEventListener("mousedown",e=>{ const o=e.target.closest("[data-i]"); if(!o) return; e.preventDefault(); placePick(+o.dataset.i) });
  box.addEventListener("mousemove",e=>{ const o=e.target.closest("[data-i]"); if(o && PLACE.idx!==+o.dataset.i){ PLACE.idx=+o.dataset.i; placeMark() } });
  document.body.appendChild(box); Object.assign(PLACE,{box,input,items,idx:-1});
}
function placeMark(){ if(PLACE.box) PLACE.box.querySelectorAll("[data-i]").forEach((o,i)=>{ o.style.background = i===PLACE.idx ? "#eee9fb" : ""; o.setAttribute("aria-selected", i===PLACE.idx) }) }
// Choosing a place fills the field, and the country field of the same form when there is one.
function placePick(i){
  const it=PLACE.items[i], input=PLACE.input; if(!it || !input) return;
  input.value=it.value;
  const c=input.form && input.form.querySelector("[name=country]");
  if(c && c!==input && it.country) c.value=it.country;
  placeClose();
}
document.addEventListener("input",e=>{ const t=e.target; if(!t.dataset || !t.dataset.place) return; clearTimeout(PLACE.timer); PLACE.timer=setTimeout(()=>placeSearch(t),300) });
document.addEventListener("keydown",e=>{
  if(!PLACE.box || e.target!==PLACE.input) return;
  if(e.key==="ArrowDown" || e.key==="ArrowUp"){ e.preventDefault(); const n=PLACE.items.length; PLACE.idx=(PLACE.idx+(e.key==="ArrowDown"?1:-1)+n)%n; placeMark() }
  else if(e.key==="Enter" && PLACE.idx>=0){ e.preventDefault(); placePick(PLACE.idx) }
  else if(e.key==="Escape") placeClose();
});
document.addEventListener("focusout",e=>{ if(e.target===PLACE.input){ PLACE.seq++; setTimeout(placeClose,150) } });

/* ---------- online payment (Stripe) ---------- */
const PAY_LABEL = {paid:"Paid", kept:"Kept (late cancellation)", refund_due:"Refund on its way", refunded:"Refunded", pending:"Not completed"};
function payNote(b){
  const p=A.pays.find(x=>x.booking_id===b.id); if(!p) return "";
  const m=usd(p.amount_cents);
  return " · " + (p.status==="paid" ? "Paid "+m : p.status==="refund_due" ? "Refund of "+m+" on its way" : p.status==="refunded" ? m+" refunded" : p.status==="kept" ? m+" not refunded (cancelled less than "+PAY.hours+" hours before)" : "");
}
function refundHint(b){
  const p=A.pays.find(x=>x.booking_id===b.id && x.status==="paid"); if(!p) return "";
  const h = p.refund_hours ?? PAY.hours;      // the refund window this lesson was booked under
  return Date.parse(b.starts_at)-Date.now() >= h*36e5 ? " (full refund)" : " (no refund: under "+h+" hours' notice)";
}
// The database decides which payments are refunded; this asks the server to send those refunds now.
function settleRefunds(){
  if(!PAY.enabled && !A.pays.length && !(A.apays||[]).length) return;
  try{ sb.functions.invoke("stripe-refunds",{body:{}}).then(()=>setTimeout(async()=>{ await loadMe(); render() },1500)).catch(()=>{}) }catch(e){}
}
function teacherPayBox(){
  if(A.teacher.school_id) return `<div class="box" id="paybox"><h3>Getting paid</h3><p class="muted small" style="margin:0">Families pay your school for your lessons, and your school pays you. You don't need to connect Stripe.</p></div>`;
  const p=A.payout, guess=(PAY_COUNTRIES.find(c=>c[1].toLowerCase()===(A.teacher.country||"").trim().toLowerCase())||[""])[0];
  return `<div class="box" id="paybox"><h3>Getting paid</h3>
    <p class="muted small">Families pay for a lesson when they book it. You receive ${100-PAY.fee}% of your lesson price, paid to your bank account by Stripe. SeastackSchool keeps ${PAY.fee}%. If a lesson is refunded, your share of it is taken back.${PAY.enabled?"":" Online payment is not open yet. You can connect now so that you are ready."}</p>
    ${!p ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label class="field" style="flex:1;min-width:200px">Country you will be paid in<select id="pay-country"><option value="">Choose…</option>${PAY_COUNTRIES.map(c=>`<option value="${c[0]}" ${c[0]===guess?"selected":""}>${c[1]}</option>`).join("")}</select></label><button class="btn sm" id="paybtn" onclick="payConnect()">Connect Stripe</button></div>
        <p class="small muted" style="margin:8px 0 0">Teachers can be paid in Canada, the United States, the United Kingdom, Switzerland and most of Europe. The country cannot be changed later.</p>
        <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><b>My country isn't listed</b>
          ${A.payWait ? `<p class="small" style="margin:6px 0 8px">You are on the list for <b>${esc(A.payWait)}</b>. We will send you an alert when teachers there can be paid. Until then you can build your profile, and your classes can be booked whenever online payment is switched off.</p><button class="btn ghost sm" onclick="payWaitLeave()">Take me off the list</button>`
            : `<p class="small muted" style="margin:6px 0 8px">Paid lessons aren't available for teachers in other countries yet. Tell us where you are and we will alert you when that changes. You can still build your profile now.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pay-wait-country" list="countrylist" maxlength="80" value="${esc(guess?"":(A.teacher.country||""))}" placeholder="Your country" aria-label="Your country" style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="payWaitJoin()">Tell me when it's available</button></div>`}</div>`
      : p.charges_enabled ? `<div class="ok">You can take paid bookings.${p.payouts_enabled?"":" Stripe has not switched on payouts to your bank yet. Open your Stripe dashboard to see what it needs."}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" onclick="payDashboard()">Open my Stripe dashboard</button><button class="btn ghost sm" onclick="payStatus(true)">Check again</button></div>`
      : `<div class="notice">Stripe still needs some details from you before you can be paid.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" id="paybtn" onclick="payConnect()">Continue with Stripe</button><button class="btn ghost sm" onclick="payStatus(true)">Check again</button></div>`}
  </div>`;
}
async function payWaitJoin(){
  const c=($("#pay-wait-country")?.value||"").trim();
  if(c.length<2) return toast("Enter your country");
  if(PAY_COUNTRIES.some(x=>x[1].toLowerCase()===c.toLowerCase())) return toast("Teachers in "+c+" can already be paid. Choose it in the list above and press Connect Stripe.");
  const r = await sb.from("payout_waitlist").upsert({teacher_id:A.user.id,country:c},{onConflict:"teacher_id"});
  if(r.error) return toast(r.error.message);
  A.payWait=c; toast("You're on the list"); render();
}
async function payWaitLeave(){
  const r = await sb.from("payout_waitlist").delete().eq("teacher_id",A.user.id);
  if(r.error) return toast(r.error.message);
  A.payWait=null; toast("Removed from the list"); render();
}
async function payConnect(){
  const sel=$("#pay-country"), country=sel?sel.value:"", btn=$("#paybtn");
  if(sel && !country) return toast("Choose the country you will be paid in");
  if(btn){ btn.disabled=true; btn.textContent="Opening Stripe…" }
  const r = await sb.functions.invoke("stripe-connect",{body:{action:"start",country}});
  if(r.error || !r.data || !r.data.url){ toast((r.data && r.data.message) || "Stripe could not be opened. Try again."); render(); return }
  location.href = r.data.url;
}
async function payStatus(say){
  const r = await sb.functions.invoke("stripe-connect",{body:{action:"status"}}), d=r.data||{};
  await loadMe(); await loadPublic();
  if(say) toast(d.charges_enabled ? "You can take paid bookings" : d.connected ? "Stripe still needs some details from you" : d.message || "Not connected to Stripe yet");
  render();
}
async function payDashboard(){
  const r = await sb.functions.invoke("stripe-connect",{body:{action:"dashboard"}});
  if(r.error || !r.data || !r.data.url) return toast((r.data && r.data.message) || "Your Stripe dashboard could not be opened");
  location.href = r.data.url;
}
function teacherEarnings(){
  if(A.teacher.school_id) return "";
  const rows=A.pays.filter(p=>p.teacher_id===A.user.id && p.status!=="pending"); if(!rows.length) return "";
  const share=p=>p.amount_cents-p.fee_cents, earned=rows.filter(p=>p.status==="paid"||p.status==="kept").reduce((s,p)=>s+share(p),0);
  return `<h3 style="margin-top:24px">Payments for your lessons</h3>
    <p class="muted small">Your share so far: <b>${usd(earned)}</b>, after SeastackSchool's ${PAY.fee}%. Stripe pays it to your bank account; see your Stripe dashboard for payout dates.</p>
    ${rows.slice(0,30).map(p=>{ const w=new Date(p.starts_at); return `<div class="lesson"><div><b>${esc(p.title)}</b><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · for ${esc(p.attendee_name)}</div></div><span class="small">${PAY_LABEL[p.status]||p.status} · ${p.status==="paid"||p.status==="kept"?"your share "+usd(share(p)):usd(p.amount_cents)}</span></div>` }).join("")}`;
}
// Admin: switch payment on or off, see every payment, refund one.
function adminPayments(){
  const rows=A.apays||[], kept=rows.filter(p=>p.status==="paid"||p.status==="kept");
  const gross=kept.reduce((s,p)=>s+p.amount_cents,0), fees=kept.reduce((s,p)=>s+p.fee_cents,0);
  return `<div class="wrap page">
    ${adminHead()}
    <div class="${PAY.enabled?"ok":"notice"}" style="margin:0 0 14px"><b>Online payment is ${PAY.enabled?"ON":"OFF"}.</b> ${PAY.enabled?"Families pay when they book, and only teachers who have connected Stripe can be booked.":"Booking is free and nothing is charged. Switch it on only after your Stripe keys are saved and a test payment has worked."}
      <div style="margin-top:10px"><button class="btn sm ${PAY.enabled?"ghost":""}" onclick="setPayments(${!PAY.enabled})">${A.payConfirm?"Confirm: switch payment "+(PAY.enabled?"off":"on"):"Switch payment "+(PAY.enabled?"off":"on")}</button></div></div>
    ${bossSettingsBox()}
    <p class="muted">SeastackSchool keeps ${PAY.fee}% of each lesson. A family that cancels ${PAY.hours} hours or more before the lesson, and any lesson cancelled by the teacher or by you, is refunded in full automatically. Paid so far: <b>${usd(gross)}</b> in ${kept.length} ${kept.length===1?"lesson":"lessons"}, of which your fee is <b>${usd(fees)}</b> before Stripe's card charges.</p>
    ${(w=>{ if(!w.length) return ""; const by={}; w.forEach(x=>{ by[x.country]=(by[x.country]||0)+1 }); return `<div class="box" style="margin-bottom:14px"><h3>Teachers waiting to be paid in other countries</h3><p class="muted small" style="margin:0 0 8px">Stripe pays teachers only in Canada, the United States, the United Kingdom, Switzerland and most of Europe. These teachers asked to be told when their country is added.</p><div class="chips">${Object.keys(by).sort((p,q)=>by[q]-by[p]).map(k=>`<span class="chip">${esc(k)}: ${by[k]}</span>`).join("")}</div></div>` })(A.await||[])}
    ${rows.length?`<div class="scroll"><table class="admin" style="min-width:860px"><thead><tr><th>Paid</th><th>Lesson</th><th>Family</th><th>Teacher</th><th>Amount</th><th>Your fee</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${rows.map(p=>{ const w=new Date(p.starts_at); return `<tr><td class="small">${new Date(p.paid_at||p.created_at).toLocaleDateString()}</td>
      <td><b>${esc(p.title)}</b><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · for ${esc(p.attendee_name)}</div></td>
      <td class="small">${esc(p.learner_name||"(account deleted)")}</td><td class="small">${esc(p.teacher_name||"(account deleted)")}</td>
      <td>${usd(p.amount_cents)}</td><td>${usd(p.fee_cents)}</td>
      <td class="small">${PAY_LABEL[p.status]||p.status}${p.refund_reason?`<div class="muted">${esc(p.refund_reason)}</div>`:""}</td>
      <td>${p.status==="paid"||p.status==="kept"?`<button class="btn sm ghost" onclick="adminRefund('${p.id}')">${A.refunding===p.id?"Confirm refund":"Refund"}</button>`:""}</td></tr>` }).join("")}
    </tbody></table></div>`:`<div class="empty">No payments yet.</div>`}
  </div>`;
}
async function setPayments(on){
  if(!A.payConfirm){ A.payConfirm=true; render(); return }
  A.payConfirm=false;
  const r = await sb.rpc("admin_set_payments_enabled",{p_enabled:on});
  if(r.error) return toast(r.error.message);
  await loadPublic(); toast(on?"Online payment is on":"Online payment is off"); render();
}
async function adminRefund(id){
  if(A.refunding!==id){ A.refunding=id; render(); return }
  A.refunding=null;
  const r = await sb.rpc("admin_refund_payment",{p_id:id});
  if(r.error){ toast(r.error.message); render(); return }
  try{ await sb.functions.invoke("stripe-refunds",{body:{}}) }catch(e){}
  await loadAdmin(); toast("Refund sent"); render();
}
// Coming back from Stripe's pages.
(function payReturn(){
  const q=new URLSearchParams(location.search), paid=q.get("paid"), st=q.get("stripe");
  if(paid===null && !st) return;
  q.delete("paid"); q.delete("stripe");
  history.replaceState(null,"",location.pathname+(q.toString()?"?"+q:"")+location.hash);
  setTimeout(()=>{
    if(paid==="1"){ toast("Payment received. Your lesson is being booked."); [2500,8000].forEach(ms=>setTimeout(async()=>{ await loadMe(); await loadPublic(); render();
      // a paid lesson is booked by the server, so the booking email is asked for here (it is only ever sent once)
      if(A.user) A.bookings.filter(b=>b.learner_id===A.user.id && b.status==="booked" && Date.now()-Date.parse(b.created_at)<15*6e4).forEach(b=>notifyBooking(b.id,"booked")) },ms)) }
    else if(paid==="0") toast("Payment cancelled. Nothing was charged.");
    if(st) setTimeout(()=>{ if(A.teacher || A.school) payStatus(true) },2000);
  },600);
})();

/* ---------- teacher photo ---------- */
function teacherPhotoBox(){
  const t=A.teacher, me={photo:t.photo?photoUrl(t.id,t.photo):"",color:"#C9D6F2",name:t.full_name||"?"};
  return `<div class="box" id="photobox"><h3>Profile photo</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">${avatarHtml(me,true)}
      <div style="flex:1;min-width:200px"><p class="muted small" style="margin:0 0 8px">A clear photo of your face helps families trust your profile. It is public once your account is approved. SeastackSchool can remove a photo that isn't suitable.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="file" id="photofile" accept=".jpg,.jpeg,.png,.webp" aria-label="Choose a photo"><button class="btn sm" id="photobtn" onclick="uploadPhoto()">${t.photo?"Replace photo":"Upload photo"}</button>${t.photo?`<button class="btn ghost sm" onclick="dropPhoto()">${A.removingPhoto?"Confirm remove":"Remove"}</button>`:""}</div></div></div></div>`;
}
// Shrinks the chosen picture to a 480px square in the browser, so uploads are small whatever the camera produced.
function squarePhoto(file){
  return new Promise((ok,fail)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{ const s=Math.min(img.naturalWidth,img.naturalHeight), cv=document.createElement("canvas"); cv.width=cv.height=480;
      cv.getContext("2d").drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,480,480); URL.revokeObjectURL(url);
      cv.toBlob(b=>b?ok(b):fail(new Error("no image")),"image/jpeg",0.86) };
    img.onerror=()=>{ URL.revokeObjectURL(url); fail(new Error("not an image")) };
    img.src=url;
  });
}
async function uploadPhoto(){
  const file=$("#photofile").files[0], btn=$("#photobtn");
  if(!file) return toast("Choose a photo first");
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)) return toast("Choose a JPG, PNG or WebP picture");
  if(file.size>15*1024*1024) return toast("That picture is larger than 15 MB");
  btn.disabled=true; btn.textContent="Uploading…";
  let blob; try{ blob = await squarePhoto(file) }catch(e){ toast("That picture could not be read"); render(); return }
  const name="photo-"+Date.now()+".jpg", store=sb.storage.from("teacher-photos"), old=A.teacher.photo;
  const up = await store.upload(A.user.id+"/"+name, blob, {contentType:"image/jpeg"});
  if(up.error){ toast(up.error.message); render(); return }
  const r = await sb.from("teachers").update({photo:name}).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data){ await store.remove([A.user.id+"/"+name]); toast(r.error?.message || "The photo could not be saved"); render(); return }
  if(old) await store.remove([A.user.id+"/"+old]);
  A.teacher=r.data; await loadPublic(); toast("Photo saved"); render();
}
async function dropPhoto(){
  if(!A.removingPhoto){ A.removingPhoto=true; render(); return }
  A.removingPhoto=false;
  const old=A.teacher.photo;
  const r = await sb.from("teachers").update({photo:""}).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "The photo could not be removed");
  if(old) await sb.storage.from("teacher-photos").remove([A.user.id+"/"+old]);
  A.teacher=r.data; await loadPublic(); toast("Photo removed"); render();
}
async function adminDropPhoto(id, file){
  if(A.removingPhotoOf!==id){ A.removingPhotoOf=id; render(); return }
  A.removingPhotoOf=null;
  const r = await sb.rpc("admin_remove_teacher_photo",{p_teacher_id:id});
  if(r.error) return toast(r.error.message);
  await sb.storage.from("teacher-photos").remove([id+"/"+file]);
  await loadAdmin(); await loadPublic(); toast("Photo removed"); render();
}

/* ---------- sign in / sign up ---------- */
// Coming in through the teacher studio, the school page or the affiliate page preselects that kind of account.
// A kind chosen by a link (Register a school, Become an affiliate) or by hand is left alone.
function kindFor(route, kind){
  if(A.kindRoute===route) return;
  A.kindRoute=route;
  if(kind){ A.kind=kind; A.autoKind=kind }
  else { if(A.autoKind && A.kind===A.autoKind) A.kind = schoolCodeFromLink() ? "teacher" : "student"; A.autoKind=null }
}
function authPage(){
  const up=A.mode==="signup", fg=A.mode==="forgot";
  const sw = m => `A.mode='${m}';A.err='';A.msg='';render()`;
  return `<div class="wrap page"><div class="box" style="max-width:460px;margin:0 auto">
    <h2>${up?"Create your account":fg?"Reset your password":"Sign in"}</h2>
    <p class="muted">${up?"Choose the kind of account you need. Accounts are free.":fg?"Enter your email and we'll send you a link to set a new password.":"Students, parents and teachers all sign in here."}</p>
    ${A.msg?`<div class="ok" style="margin-bottom:12px">${esc(A.msg)}</div>`:""}
    <form id="authf" novalidate onsubmit="event.preventDefault();authSubmit(this)" style="display:flex;flex-direction:column;gap:10px">
      ${up?`<fieldset class="field" style="border:0;padding:0;margin:0"><legend>I am a…</legend><div class="choices">${[["student","Student","I'm 13 or older and book lessons for myself."],["parent","Parent","I book lessons for my children."],["teacher","Teacher","I want to offer lessons. Teacher accounts are reviewed before going public."],["school","School","I run a school and want to list its teachers and classes. Schools upload documents and are reviewed before going public."],["affiliate","Affiliate","I want to refer teachers and families with my own link. Affiliate accounts are reviewed before they are activated."]].map(([k,l,d])=>`<label class="choice"><input type="radio" name="kind" value="${k}" id="au-kind-${k}" ${A.kind===k?"checked":""} onchange="A.kind=this.value;kindFields()"><span><b>${l}</b>${d}</span></label>`).join("")}</div></fieldset>`:""}
      ${up?`<label class="field">Full name<input name="full_name" id="au-name" required maxlength="120" autocomplete="name"></label>
      <label class="field" id="au-schoolwrap" ${A.kind==="school"?"":"hidden"}>School name<input name="school_name" id="au-school" maxlength="140"></label>
      <label class="field" id="au-codewrap" ${A.kind==="teacher"?"":"hidden"}>School code, if a school invited you (optional)<input name="school_code" id="au-code" maxlength="12" value="${esc(schoolCodeFromLink())}"></label>
      <label class="field" id="au-pitchwrap" ${A.kind==="affiliate"?"":"hidden"}>How will you tell people about SeastackSchool? (optional)<textarea name="pitch" id="au-pitch" rows="2" maxlength="600"></textarea></label>`:""}
      <label class="field">Email<input name="email" id="au-email" type="email" required autocomplete="email"></label>
      ${fg?"":`<label class="field">Password${up?" (at least 8 characters)":""}<input name="password" id="au-pass" type="password" required minlength="${up?8:1}" autocomplete="${up?"new-password":"current-password"}"></label>`}
      <div class="err" id="autherr">${esc(A.err)}</div>
      ${up?`<p class="small muted" style="margin:0">By creating an account you agree to the <a href="${SITE_BASE}#/terms" target="_blank" rel="noopener">Terms of Use</a> and the <a href="${SITE_BASE}#/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>`:""}
      <button class="btn" id="authbtn" style="align-self:flex-start">${up?"Create account":fg?"Send reset link":"Sign in"}</button>
    </form>
    <p class="small" style="margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap">
      ${up||fg?`<button class="btn ghost sm" onclick="${sw("signin")}">I already have an account</button>`:`<button class="btn ghost sm" onclick="${sw("signup")}">Create an account</button><button class="btn ghost sm" onclick="${sw("forgot")}">Forgot password</button>`}
    </p>
  </div></div>`;
}
function kindFields(){
  const k=A.kind, set=(id,on)=>{ const e=$(id); if(e) e.hidden=!on };
  set("#au-schoolwrap", k==="school"); set("#au-codewrap", k==="teacher"); set("#au-pitchwrap", k==="affiliate");
}
async function authSubmit(f){
  const btn=$("#authbtn"), errEl=$("#autherr"), label=btn.textContent, email=f.email.value.trim(), back=location.origin+location.pathname;
  // Every outcome shows a message in the form, and a failed attempt keeps what was typed.
  const fail = m => { errEl.textContent=m; btn.disabled=false; btn.textContent=label };
  if(A.mode==="signup" && !f.full_name.value.trim()) return fail("Enter your full name.");
  if(A.mode==="signup" && f.kind.value==="school" && !f.school_name.value.trim()) return fail("Enter your school's name.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, like name@example.com.");
  if(A.mode==="signup" && f.password.value.length<8) return fail("Choose a password with at least 8 characters.");
  if(A.mode==="signin" && !f.password.value) return fail("Enter your password.");
  btn.disabled=true; btn.textContent="Please wait…"; errEl.textContent=""; A.err=""; A.msg="";
  let error=null;
  try{
    if(A.mode==="signup"){
      const r = await sb.auth.signUp({email,password:f.password.value,options:{data:{full_name:f.full_name.value.trim(),account_type:f.kind.value,accepted_terms_at:new Date().toISOString(),ref:storedRef(),pitch:f.kind.value==="affiliate"?f.pitch.value.trim():null,school_name:f.kind.value==="school"?f.school_name.value.trim():null,school_code:f.kind.value==="teacher"?(f.school_code.value.trim()||null):null},emailRedirectTo:back}});
      error=r.error;
      if(!error && !r.data.session){ A.mode="signin"; A.msg=`We sent a confirmation link to ${email}. Open it, then sign in here.` }
    } else if(A.mode==="forgot"){
      const r = await sb.auth.resetPasswordForEmail(email,{redirectTo:back});
      error=r.error;
      if(!error){ A.mode="signin"; A.msg=`If ${email} has an account, a reset link is on its way.` }
    } else {
      const r = await sb.auth.signInWithPassword({email,password:f.password.value});
      error=r.error;
    }
  }catch(e){ error={message:"We couldn't reach the server. Check your connection and try again."} }
  if(error) return fail(/not confirmed/i.test(error.message) ? "Confirm your email first: open the link we sent you, then sign in." :
                        /invalid login/i.test(error.message) ? "That email and password don't match an account." :
                        /rate limit/i.test(error.message) ? "Too many emails were sent in the last hour. Wait a while and try again." : error.message);
  if(!A.user) render();
}
function newPasswordPage(){
  return `<div class="wrap page"><div class="box" style="max-width:460px;margin:0 auto"><h2>Set a new password</h2>
    <form onsubmit="event.preventDefault();setNewPassword(this)" style="display:flex;flex-direction:column;gap:10px">
      <label class="field">New password (at least 8 characters)<input name="password" id="np-pass" type="password" required minlength="8" autocomplete="new-password"></label>
      <div class="err">${esc(A.err)}</div>
      <button class="btn" style="align-self:flex-start">Save password</button>
    </form></div></div>`;
}
async function setNewPassword(f){
  const r = await sb.auth.updateUser({password:f.password.value});
  if(r.error){ A.err=r.error.message; render(); return }
  A.recovery=false; A.err=""; toast("Password saved"); render();
}
async function signOut(){ await sb.auth.signOut(); A.mode="signin"; A.msg=""; A.err="" }

/* ---------- teacher studio ---------- */
studio = function(){
  if(!sb) return `<div class="wrap page"><h2>Teacher studio</h2><div class="notice">Teacher accounts can't be reached right now. Check your connection and reload the page.</div></div>`;
  if(A.recovery) return newPasswordPage();
  if(!A.user){ kindFor("studio","teacher"); return authPage() }
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.teacher) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">Teacher studio</h2>${who}</div>
    <div class="notice">${A.staffer?`This is an admin account, so it has no teacher profile. <a href="#/admin">Manage teachers</a>`:A.learner?`This is a ${A.learner.role} account, so it has no teacher studio. To teach, create a separate teacher account with a different email. <a href="#/account">Open my account</a>`:"This account has no teacher profile."}</div></div>`;
  const tabs=[["profile","My profile"],["list","My classes"],["bookings","Bookings"]];
  if(!tabs.some(t=>t[0]===TAB)) TAB="profile";
  const local = `<p class="small muted">This tool is saved in this browser only for now.</p>`;
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">Teacher studio</h2>${who}</div>
    ${statusBanner()}${teacherSchoolBox()}${teacherChecklist()}${teacherLevelBox()}
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${TAB===k}" onclick="TAB='${k}';render()">${l}</button>`).join("")}</div>
    ${TAB==="profile"?teacherPhotoBox()+profileForm()+teacherQualsBox()+teacherDocsBox()+teacherPayBox()+accountSettings():TAB==="list"?(A.teacher.school_id?schoolTeacherClasses():listings()):TAB==="bookings"?teacherBookings()+teacherDates()+teacherPast()+teacherEarnings():TAB==="plan"?local+planner():TAB==="grades"?local+gradebook():local+resources()}
  </div>`;
};
function statusBanner(){
  const s=A.teacher.status;
  return s==="approved" ? `<div class="ok" style="margin:12px 0">Your account is approved. Your profile and classes are public. <a href="#/teacher/${A.teacher.id}">See your public profile</a>
      <div class="small" style="margin-top:6px;overflow-wrap:anywhere">Your own page to share: <a href="${SITE_BASE}teachers/${slugify(A.teacher.full_name,A.teacher.id)}/">${esc(SITE_BASE)}teachers/${slugify(A.teacher.full_name,A.teacher.id)}/</a> (new and changed pages appear within about an hour)</div></div>`
    : s==="suspended" ? `<div class="notice bad">Your account is suspended, so your profile and classes are hidden. Contact support from the Help page.</div>`
    : A.teacher.school_id ? `<div class="notice">You're waiting for your school to approve you. Fill in your profile and add your classes now; students will see them once the school approves you.</div>`
    : `<div class="notice">Your account is waiting for approval. Fill in your profile and add your classes now; students will see them once you're approved.</div>`;
}
function profileForm(){
  const t=A.teacher, tz = t.timezone==="UTC" && !t.full_name.trim() ? BROWSER_TZ : t.timezone, zones=tzList();
  const tzLocked=A.classes.some(c=>classHasUpcoming(c.id));
  return `<form class="box row" id="proff" onsubmit="event.preventDefault();saveProfile(this)">
    <label class="field">Full name<input name="full_name" id="pf-name" required maxlength="120" value="${esc(t.full_name)}"></label>
    <label class="field" style="grid-column:1/-1">Headline: one line that says what you teach<input name="headline" id="pf-headline" maxlength="140" value="${esc(t.headline||"")}" placeholder="e.g. Certified maths teacher for ages 10 to 16"></label>
    <label class="field">City<input name="city" id="pf-city" maxlength="120" value="${esc(t.city)}" placeholder="e.g. Vancouver"></label>
    <label class="field">Country<input name="country" id="pf-country" maxlength="80" value="${esc(t.country||"")}" placeholder="e.g. Canada"></label>
    <label class="field">Your time zone${tzLocked?" (locked while you have upcoming bookings)":""}<select name="timezone" id="pf-tz" ${tzLocked?"disabled":""}>${(zones.includes(tz)?zones:[tz].concat(zones)).map(z=>`<option ${z===tz?"selected":""}>${esc(z)}</option>`).join("")}</select></label>
    ${tzLocked?`<p class="small muted" style="grid-column:1/-1;margin:0">Your class times are set in your time zone, so changing it would move lessons that are already booked. You can change it once those lessons have taken place, or after cancelling them.</p>`:t.timezone==="UTC"?`<p class="small" style="grid-column:1/-1;margin:0;color:var(--rose)">Your time zone is set to UTC. If you don't live on UTC time, choose your own zone before you create classes, so your class times mean what you expect.</p>`:""}
    <label class="field">Years of teaching experience<input name="years" id="pf-years" type="number" min="0" max="80" value="${t.years_experience}"></label>
    <label class="field" style="grid-column:1/-1">Teaching languages, separated by commas<input name="languages" id="pf-langs" value="${esc((t.languages||[]).join(", "))}" placeholder="English, French"></label>
    <label class="field" style="grid-column:1/-1">Introduction (students read this first)<textarea name="intro" id="pf-intro" rows="3" maxlength="2000">${esc(t.intro)}</textarea></label>
    <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend>Who you teach</legend><div class="chips">${TEACH_LEVELS.map(l=>`<label class="chip"><input type="checkbox" name="teaches" value="${l}" ${(t.teaches||[]).includes(l)?"checked":""}> ${l}</label>`).join("")}</div></fieldset>
    <label class="field" style="grid-column:1/-1">Subjects you teach, separated by commas<input name="subjects" id="pf-subjects" value="${esc((t.subjects||[]).join(", "))}" placeholder="Maths, Physics"></label>
    <label class="field" style="grid-column:1/-1">Teaching experience (where and whom you have taught)<textarea name="experience" id="pf-exp" rows="3" maxlength="2000">${esc(t.experience)}</textarea></label>
    <label class="field" style="grid-column:1/-1">Education (where you studied and what)<textarea name="education" id="pf-edu" rows="2" maxlength="1500">${esc(t.education||"")}</textarea></label>
    <p class="small muted" style="grid-column:1/-1;margin:0">Degrees, certificates and licences are added in the Qualifications box below, each with its own document.</p>
    <button class="btn" style="grid-column:1/-1;justify-self:start">Save profile</button>
  </form>`;
}
async function saveProfile(f){
  const row={full_name:f.full_name.value.trim(),city:f.city.value.trim(),timezone:f.timezone.value,years_experience:Math.max(0,Math.min(80,+f.years.value||0)),
    languages:f.languages.value.split(",").map(s=>s.trim()).filter(Boolean).slice(0,12),intro:f.intro.value.trim(),experience:f.experience.value.trim(),
    headline:f.headline.value.trim(),country:f.country.value.trim(),education:f.education.value.trim(),
    subjects:f.subjects.value.split(",").map(s=>s.trim()).filter(Boolean).slice(0,12),
    teaches:[...f.querySelectorAll("[name=teaches]:checked")].map(x=>x.value)};
  const r = await sb.from("teachers").update(row).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "Your profile could not be saved");
  A.teacher=r.data; await loadPublic(); toast("Profile saved"); render();
}
function myClassList(){
  if(!A.classes.length) return `<div class="empty" style="margin-bottom:16px">You haven't listed a class yet.</div>`;
  return `${classEditForm()}<div style="margin-bottom:16px">${A.classes.map(x=>{ const c=toClass(x); return `<div class="lesson">
    <div><span class="tag ${c.type}">${typeLabel(c)}</span> <b>${esc(c.title)}</b>${reviewTag(x)}
      <div class="small muted">${modeLabel(c)} · ${esc(c.subject)} · taught in ${esc(c.lang)} · ${c.level} · ${ageLabel(c.ages)} · ${money(c.price)} per lesson · ${x.days.map(d=>DAY3[d]).join(", ")} at ${x.start_time.slice(0,5)} (${esc((A.teacher.timezone||"UTC").replace(/_/g," "))} time) · ${c.mins} min</div>
      <div class="small" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="link-${x.id}" value="${esc((c.mode==="in_person"?A.addresses[x.id]:A.links[x.id])||"")}" placeholder="${c.mode==="in_person"?"Address (only people who booked can see it)":"Lesson link (Zoom, Meet…): https://"}" aria-label="${c.mode==="in_person"?"Address":"Lesson link"} for ${esc(c.title)}" style="flex:1;min-width:210px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="saveLink('${x.id}')">${c.mode==="in_person"?"Save address":"Save link"}</button></div>
      ${A.teacher.status==="approved"?`<div class="small muted" style="margin-top:6px;overflow-wrap:anywhere">This class's own page to share: <a href="${SITE_BASE}classes/${slugify(x.title,x.id)}/">${esc(SITE_BASE)}classes/${slugify(x.title,x.id)}/</a></div>`:""}</div>
    ${A.teacher.school_id?"":`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" onclick="A.editing='${x.id}';render();$('#editclass')?.scrollIntoView({block:'center'})">Edit</button><button class="btn ghost sm" onclick="removeClass('${x.id}')">${A.removing===x.id?"Confirm remove":"Remove"}</button></div>`}</div>` }).join("")}</div>`;
}
addListing = async function(f){
  const days=[...f.querySelectorAll("[name=day]:checked")].map(x=>+x.value);
  if(!days.length) return toast("Choose at least one day");
  const type=f.type.value, a0=+f.a0.value, a1=Math.min(99,+f.a1.value||99);
  if(a1<a0) return toast("Oldest age must be the same as or above the youngest age");
  const row={teacher_id:A.user.id,title:f.title.value.trim(),subject:f.subject.value.trim(),language:f.lang.value.trim(),type,price:+f.price.value,
    capacity:type==="private"?1:Math.max(2,+f.cap.value||6),level:f.level.value,age_min:a0,age_max:a1,days,start_time:f.time.value,duration_min:+f.mins.value};
  const mode=f.mode.value, place=(f.place?.value||"").trim(), address=(f.address?.value||"").trim();
  if(mode==="in_person" && !place) return toast("Enter the city or area where the class takes place");
  row.mode=mode; row.place_city=mode==="in_person"?place:"";
  const link=mode==="online"?(f.link?.value||"").trim():"";
  if(link && !/^https:\/\/\S+$/.test(link)) return toast("The lesson link must start with https://");
  const r = await sb.from("classes").insert(row).select("id").single();
  if(r.error) return toast(/row-level security/i.test(r.error.message) ? "Your account can't add classes right now" : r.error.message);
  if(link || (mode==="in_person" && address)){
    const k = await sb.from("class_links").insert({class_id:r.data.id,url:link||null,address:mode==="in_person"?address:null});
    if(k.error) toast("Class saved, but the lesson link or address could not be saved");
  }
  await loadMe(); await loadPublic(); toast(savedWords((A.classes.find(c=>c.id===r.data.id)||{}).review_status, "Class saved")); render();
};
// Editing a class. While it has upcoming bookings its days, time, length, kind and place are fixed
// (the database enforces the same rule), so families never find their lesson moved under them.
function classHasUpcoming(id){ return A.bookings.some(b=>b.class_id===id && b.status==="booked" && Date.parse(b.starts_at)>Date.now()) }
function classEditForm(){
  const x=A.classes.find(c=>c.id===A.editing); if(!x) return "";
  const locked=classHasUpcoming(x.id), dis=locked?"disabled":"", zone=esc((A.teacher.timezone||"UTC").replace(/_/g," "));
  return `<form class="box row" id="editclass" novalidate onsubmit="event.preventDefault();saveClass(this)">
    <h3 style="grid-column:1/-1;margin:0">Edit class</h3>
    ${locked?`<div class="notice" style="grid-column:1/-1;margin:0">This class has upcoming bookings, so its days, time, length, kind and place can't be changed. You can still change the title, subject, language, level, ages, price and class size. To change the schedule, cancel the bookings first or create a new class.</div>`:""}
    <label class="field" style="grid-column:1/-1">Class title<input name="title" id="ed-title" maxlength="140" value="${esc(x.title)}"></label>
    <label class="field">Subject${subjectSelect("ed-subject", x.subject)}</label>
    <label class="field">Teaching language<input name="lang" id="ed-lang" maxlength="60" value="${esc(x.language)}"></label>
    <label class="field">Student level<select name="level" id="ed-level">${["Beginner","Intermediate","Advanced"].map(l=>`<option ${l===x.level?"selected":""}>${l}</option>`).join("")}</select></label>
    <label class="field">Price per lesson (USD)<input name="price" id="ed-price" type="number" min="1" value="${+x.price}"></label>
    <label class="field">Kind of class<select name="type" id="ed-type" ${dis} onchange="$('#ed-capwrap').hidden=this.value==='private'"><option value="private" ${x.type==="private"?"selected":""}>Private lesson</option><option value="group" ${x.type==="group"?"selected":""}>Small group class</option></select></label>
    <label class="field" id="ed-capwrap" ${x.type==="private"?"hidden":""}>Maximum class size<input name="cap" id="ed-cap" type="number" min="2" max="50" value="${x.type==="group"?x.capacity:6}"></label>
    <label class="field">Youngest age<input name="a0" id="ed-a0" type="number" min="3" value="${x.age_min}"></label>
    <label class="field">Oldest age<input name="a1" id="ed-a1" type="number" min="3" value="${x.age_max}"></label>
    <label class="field">Where<select name="mode" id="ed-mode" ${dis} onchange="$('#ed-placewrap').hidden=this.value!=='in_person'"><option value="online" ${x.mode!=="in_person"?"selected":""}>Online</option><option value="in_person" ${x.mode==="in_person"?"selected":""}>In person</option></select></label>
    <label class="field" id="ed-placewrap" ${x.mode==="in_person"?"":"hidden"}>City or area (public)<input name="place" id="ed-place" maxlength="120" value="${esc(x.place_city||"")}"></label>
    <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend>Days</legend><div class="chips">${DAY3.map((d,i)=>`<label class="chip"><input type="checkbox" name="day" value="${i}" ${x.days.includes(i)?"checked":""} ${dis}> ${d}</label>`).join("")}</div></fieldset>
    <label class="field">Start time (${zone} time)<input name="time" id="ed-time" type="time" value="${x.start_time.slice(0,5)}" ${dis}></label>
    <label class="field">Lesson length (minutes)<input name="mins" id="ed-mins" type="number" min="15" step="5" value="${x.duration_min}" ${dis}></label>
    <p class="small muted" style="grid-column:1/-1;margin:0">The lesson link or address is changed in the class row below. Renaming a class changes the address of its public page.</p>
    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap"><button class="btn">Save changes</button><button type="button" class="btn ghost" onclick="A.editing=null;render()">Cancel</button></div>
  </form>`;
}
async function saveClass(f){
  const x=A.classes.find(c=>c.id===A.editing); if(!x) return;
  const title=f.title.value.trim(), subject=f.subject.value.trim(), lang=f.lang.value.trim(), price=+f.price.value, a0=+f.a0.value, a1=Math.min(99,+f.a1.value||99);
  if(!title || !subject || !lang) return toast("Fill in the title, subject and teaching language");
  if(!(price>0)) return toast("Enter a price above zero");
  if(!(a0>=3) || a1<a0) return toast("Check the ages: the oldest must be the same as or above the youngest");
  const row={title,subject,language:lang,level:f.level.value,price,age_min:a0,age_max:a1};
  if(classHasUpcoming(x.id)){
    if(x.type==="group") row.capacity=Math.max(2,+f.cap.value||x.capacity);
  } else {
    const days=[...f.querySelectorAll("[name=day]:checked")].map(d=>+d.value), type=f.type.value, mode=f.mode.value, place=f.place.value.trim(), mins=+f.mins.value;
    if(!days.length) return toast("Choose at least one day");
    if(!f.time.value) return toast("Enter the start time");
    if(!(mins>=15 && mins<=240)) return toast("Lesson length must be between 15 and 240 minutes");
    if(mode==="in_person" && !place) return toast("Enter the city or area where the class takes place");
    Object.assign(row,{type,capacity:type==="private"?1:Math.max(2,+f.cap.value||6),days,start_time:f.time.value,duration_min:mins,mode,place_city:mode==="in_person"?place:""});
  }
  const r = await sb.from("classes").update(row).eq("id",x.id).select("id").maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "The class could not be saved");
  A.editing=null; await loadMe(); await loadPublic(); toast(savedWords((A.classes.find(c=>c.id===r.data.id)||{}).review_status, "Class updated")); render();
}
async function removeClass(id){
  if(A.removing!==id){ A.removing=id; render(); return }
  A.removing=null;
  const r = await sb.from("classes").delete().eq("id",id);
  if(r.error) return toast(r.error.message);
  await loadMe(); await loadPublic(); toast("Class removed"); render();
}
// The link students use to join (the teacher's own Zoom, Meet, etc.). Only people who booked can see it.
async function saveLink(id){
  const c=A.classes.find(x=>x.id===id), inPerson=!!c && c.mode==="in_person", v=($("#link-"+id)?.value||"").trim();
  if(!inPerson && v && !/^https:\/\/\S+$/.test(v)) return toast("The lesson link must start with https://");
  const now=new Date().toISOString();
  const r = v ? await sb.from("class_links").upsert(inPerson ? {class_id:id,address:v,url:null,updated_at:now} : {class_id:id,url:v,address:null,updated_at:now})
              : await sb.from("class_links").delete().eq("class_id",id);
  if(r.error) return toast(r.error.message);
  const map=inPerson?A.addresses:A.links; if(v) map[id]=v; else delete map[id];
  toast(inPerson ? (v?"Address saved":"Address removed") : (v?"Lesson link saved":"Lesson link removed"));
}
function teacherBookings(){
  const ids=new Set(A.classes.map(c=>c.id)), now=Date.now();
  const up=A.bookings.filter(b=>ids.has(b.class_id) && b.status==="booked" && Date.parse(b.starts_at)+90*6e4>now);
  if(!up.length) return `<div class="empty">No upcoming bookings yet. When a student or parent books one of your classes, it appears here.</div>`;
  const groups={};
  up.forEach(b=>{ const k=b.class_id+"@"+Date.parse(b.starts_at); (groups[k] = groups[k] || []).push(b) });
  return `<p class="muted">Times are shown in your time zone (${esc(TZ)}).</p>` + Object.keys(groups).sort((x,y)=>x.split("@")[1]-y.split("@")[1]).map(k=>{
    const list=groups[k], c=A.classes.find(x=>x.id===list[0].class_id), when=new Date(list[0].starts_at);
    return `<div class="box"><div class="results-head"><h3 style="margin:0">${esc(c.title)}</h3><span class="small muted">${fmtDay(when)}, ${fmtTime(when)} · ${list.length} of ${c.capacity} booked</span></div>
      ${A.links[c.id] || c.mode==="in_person"?"":`<p class="small" style="color:var(--rose);margin:0 0 6px">Add a lesson link for this class under My classes so students can join.</p>`}
      ${list.map(b=>`<div class="lesson" style="margin:8px 0 0"><div style="flex:1;min-width:200px"><b>${esc(b.attendee_name)}</b>${attendeeCard(b)}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn ghost sm" href="#/messages/${b.learner_id}">Message</a><button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel booking"}</button></div></div>`).join("")}</div>`;
  }).join("");
}
// Attendance: everyone counts as attended unless the teacher says otherwise. The family can dispute a
// "did not attend" mark, and the system admin's ruling is final.
// A teacher who is ill or away cancels one lesson date: its bookings are cancelled and it can't be booked.
function teacherDates(){
  if(!A.teacher || A.teacher.status!=="approved" || !A.classes.length) return "";
  const rows=[];
  A.classes.forEach(x=>{ const c=cls(x.id); if(c) sessions(c).forEach(s=>rows.push({x,c,s})) });
  rows.sort((a,b)=>a.s.start-b.s.start);
  const ids=new Set(A.classes.map(c=>c.id)), now=Date.now();
  const gone=Object.keys(CANCELLED).map(k=>({id:k.split("@")[0],ms:+k.split("@")[1]})).filter(k=>ids.has(k.id) && k.ms>now).sort((a,b)=>a.ms-b.ms);
  if(!rows.length && !gone.length) return "";
  return `<h3 style="margin-top:24px">Lesson dates in the next two weeks</h3>
    <p class="muted small">Ill or away? Cancel a single date. Everyone booked for it has their booking cancelled, and the date can no longer be booked.</p>` +
    rows.map(({x,c,s})=>{ const k=x.id+"@"+(+s.start), booked=c.cap-s.left;
      return `<div class="lesson"><div><b>${esc(x.title)}</b><div class="small muted">${fmtDay(s.start)}, ${fmtTime(s.start)} · ${booked} of ${c.cap} booked</div></div>
        <button class="btn ghost sm" onclick="cancelDate('${x.id}',${+s.start})">${A.cancelDateKey===k?(booked?`Confirm: cancel ${booked} ${booked===1?"booking":"bookings"}`:"Confirm cancel"):"Cancel this date"}</button></div>` }).join("") +
    gone.map(k=>{ const x=A.classes.find(c=>c.id===k.id), w=new Date(k.ms);
      return `<div class="lesson"><div><b>${esc(x.title)}</b> <span class="tag bad">Date cancelled</span><div class="small muted">${fmtDay(w)}, ${fmtTime(w)}</div></div>
        <button class="btn ghost sm" onclick="restoreDate('${k.id}',${k.ms})">Open this date again</button></div>` }).join("");
}
async function cancelDate(id, ms){
  const k=id+"@"+ms;
  if(A.cancelDateKey!==k){ A.cancelDateKey=k; render(); return }
  A.cancelDateKey=null;
  const r = await sb.rpc("cancel_session",{p_class_id:id,p_starts_at:new Date(ms).toISOString()});
  if(r.error){ toast(r.error.message); render(); return }
  const ids=r.data||[]; ids.forEach(b=>notifyBooking(b,"cancelled")); settleRefunds();
  await loadMe(); await loadPublic();
  toast(ids.length ? `Date cancelled, with ${ids.length} ${ids.length===1?"booking":"bookings"}` : "Date cancelled"); render();
}
async function restoreDate(id, ms){
  const r = await sb.rpc("restore_session",{p_class_id:id,p_starts_at:new Date(ms).toISOString()});
  if(r.error) return toast(r.error.message);
  await loadPublic(); toast("Date open for booking again. Cancelled bookings are not brought back."); render();
}
function teacherPast(){
  const ids=new Set(A.classes.map(c=>c.id)), now=Date.now(), at=b=>Date.parse(b.starts_at);
  const past=A.bookings.filter(b=>ids.has(b.class_id) && b.status==="booked" && at(b)<=now && at(b)>now-45*864e5).sort((x,y)=>at(y)-at(x));
  if(!past.length) return "";
  return `<h3 style="margin-top:24px">Lessons that have started</h3>
    <p class="muted small">Everyone counts as attended unless you mark "Did not attend". Someone marked as not attending cannot rate you for that lesson, and can ask SeastackSchool to review the mark. For online lessons you can see whether each person opened the lesson from SeastackSchool. Use it as a guide: someone may have joined from a link they saved earlier. Shows the last 45 days.</p>` +
    past.map(b=>{ const c=A.classes.find(x=>x.id===b.class_id), w=new Date(b.starts_at), no=b.attendance==="no_show";
      return `<div class="lesson"><div><b>${esc(b.attendee_name)}</b> <span class="tag ${no?"bad":"ok"}">${no?"Did not attend":"Attended"}</span>
        <div class="small muted">${esc(c.title)} · ${fmtDay(w)}, ${fmtTime(w)}${c.mode==="in_person"?" · in person":b.joined_at?" · opened the lesson at "+fmtTime(new Date(b.joined_at)):" · did not open the lesson from SeastackSchool"}${b.attendance_disputed?" · the family says this is wrong; SeastackSchool will review it":""}</div></div>
        ${b.attendance_locked?`<span class="small muted">Decided by SeastackSchool</span>`:`<button class="btn sm ghost" onclick="markAttendance('${b.id}','${no?"attended":"no_show"}')">${no?"Mark as attended":"Did not attend"}</button>`}</div>` }).join("");
}
async function markAttendance(id,value){
  const r = await sb.rpc("mark_attendance",{p_booking_id:id,p_value:value});
  if(r.error){ toast(r.error.message); return }
  await loadMe(); toast(value==="no_show"?"Marked as did not attend":"Marked as attended"); render();
}
async function disputeAttendance(id){
  const r = await sb.rpc("dispute_attendance",{p_booking_id:id});
  if(r.error){ toast(r.error.message); return }
  await loadMe(); toast("Sent to SeastackSchool to review"); render();
}
startTeaching = function(){ A.kind="teacher"; if(!A.user){ A.mode="signup"; A.err=""; A.msg="" } TAB = A.teacher && A.teacher.full_name.trim() ? "list" : "profile" };

/* ---------- admin: manage teachers ---------- */
function adminPage(){
  if(!A.admin && A.staffer) return twoStepPage();
  if(!A.admin) return `<div class="wrap page"><h2>Manage accounts</h2><div class="notice">This page is for SeastackSchool admins. ${A.user?"You're signed in as "+esc(A.user.email)+".":`<a href="#/account">Sign in</a>`}</div></div>`;
  if(A.twoStep) return twoStepPage();
  if(["pay","staff"].includes(A.adminTab) && !A.boss) A.adminTab="teachers";
  if(A.adminTab==="classes") return adminClasses();
  if(A.adminTab==="requests") return adminRequests();
  if(A.adminTab==="log") return adminLog();
  if(A.adminTab==="staff") return adminStaff();
  if(A.adminTab==="learners") return adminLearners();
  if(A.adminTab==="bookings") return adminBookings();
  if(A.adminTab==="visits") return adminVisits();
  if(A.adminTab==="affiliates") return adminAffiliates();
  if(A.adminTab==="schools") return adminSchools();
  if(A.adminTab==="reviews") return adminReviews();
  if(A.adminTab==="inbox") return adminInbox();
  if(A.adminTab==="pay") return adminPayments();
  const rows=A.rows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.filter==="all"?rows:rows.filter(r=>r.status===A.filter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.filter===k}" onclick="A.filter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    ${qualsWaiting()}
    <p class="muted">Approve a teacher to make their profile and classes public. Suspend one to hide them again. Every change is recorded with your account and the time.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for approval ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:760px"><thead><tr><th>Teacher</th><th>Profile</th><th>Classes and identity</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}
        ${r.photo?`<div style="margin-top:8px"><img src="${esc(photoUrl(r.id,r.photo))}" alt="Profile photo of ${esc(r.full_name)}" loading="lazy" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block"><div class="acts"><button class="btn sm ghost" onclick="adminDropPhoto('${r.id}','${esc(r.photo)}')">${A.removingPhotoOf===r.id?"Confirm remove photo":"Remove photo"}</button></div></div>`:`<div class="small muted" style="margin-top:6px">No photo</div>`}</td>
      <td class="small">${esc([r.city,r.timezone].filter(Boolean).join(" · "))}<br>${r.years_experience} years · ${esc((r.languages||[]).join(", ")||"no languages yet")}
        <details style="margin-top:6px;padding:6px 10px"><summary class="small">Read profile</summary><p style="margin:6px 0"><b>Introduction</b><br>${esc(r.intro||"(empty)")}</p><p style="margin:6px 0"><b>Experience</b><br>${esc(r.experience||"(empty)")}</p>
          <p style="margin:6px 0"><b>Headline</b><br>${esc(r.headline||"(empty)")}</p><p style="margin:6px 0"><b>Country</b><br>${esc(r.country||"(empty)")}</p><p style="margin:6px 0"><b>Subjects</b><br>${esc((r.subjects||[]).join(", ")||"(empty)")}</p>
          <p style="margin:6px 0"><b>Education</b><br>${esc(r.education||"(empty)")}</p></details></td>
      <td>${r.class_count} ${r.class_count===1?"class":"classes"}${(t=>t?`<div class="small" style="margin-top:4px">${rankTag(t)} <span class="muted">${t.lessons} taught</span></div>`:"")(teacher(r.id))}${r.school_name?`<div class="small muted">School: ${esc(r.school_name)}</div>`:""}
        <div class="small" style="margin-top:6px">${r.identity_checked_at?`<span class="tag ok">Identity checked</span> ${new Date(r.identity_checked_at).toLocaleDateString()}`:`<span class="tag group">Identity not checked</span>`}</div>
        <div class="small" style="margin-top:6px">${A.tdocsAdmin[r.id]?(A.tdocsAdmin[r.id].length?A.tdocsAdmin[r.id].map(d=>d.url?`<div style="overflow-wrap:anywhere"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a></div>`:`<div>${esc(d.name)}</div>`).join(""):"No documents uploaded"):`${whyBox("t-"+r.id)}<button class="btn sm ghost" style="margin-top:4px" onclick="showTeacherDocs('${r.id}')">Show documents</button>`}</div>
        <div class="acts"><button class="btn sm ghost" onclick="setIdentity('${r.id}',${!r.identity_checked_at})">${r.identity_checked_at?"Remove identity check":"Mark identity checked"}</button></div>
        ${adminQuals(r.id)}</td>
      <td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${pill(r.status)}${r.last_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(r.last_note)}</div>`:""}</td>
      <td><input id="note-${r.id}" aria-label="Note for ${esc(r.full_name)}" placeholder="Note (optional)" maxlength="1000">
        <div class="acts">${r.status==="approved"?act(r.id,"suspended","Suspend",true):r.status==="suspended"?act(r.id,"approved","Restore"):act(r.id,"approved","Approve")+act(r.id,"suspended","Suspend",true)}</div></td>
    </tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">${rows.length?"No teachers in this list.":"No teachers have signed up yet. When one does, they appear here waiting for approval."}</div>`}
  </div>`;
}
async function setStatus(id,status){
  const note=$("#note-"+id)?.value.trim()||null;
  const r = await sb.rpc("admin_set_teacher_status",{p_teacher_id:id,p_status:status,p_note:note});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); await loadPublic();
  toast(status==="approved"?"Teacher approved":"Teacher suspended"); render();
}

function adminHead(){
  const tab=(k,l)=>`<button role="tab" aria-selected="${A.adminTab===k}" onclick="A.adminTab='${k}';render()">${l}</button>`;
  return `<div class="results-head"><h2 style="margin:0">Manage accounts</h2>
      <span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="tag ${A.boss?"ok":"group"}">${A.boss?"Admin boss":"Admin"}</span> ${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span></div>
    ${A.boss && !A.staff.enrolled?`<div class="notice" style="margin:12px 0"><b>Protect this account.</b> It can refund money and add staff, and today it is protected by a password only. Add a second step: a code from an app on your phone. <button class="btn sm" style="margin-left:6px" onclick="A.twoStep=true;render()">Set up two-step sign-in</button></div>`:""}
    ${PAY.paused?`<div class="notice" style="margin:12px 0"><b>New bookings are paused.</b> Nobody can book until the admin boss starts them again${A.boss?` under Payments and settings`:""}. Lessons already booked go ahead.</div>`:""}
    ${attentionPanel()}
    ${convBox()}
    <div class="tabs" role="tablist">${tab("teachers","Teachers ("+(A.rows||[]).length+")")}${tab("learners","Students and parents ("+(A.lrows||[]).length+")")}${tab("bookings","Bookings ("+(A.brows||[]).filter(b=>b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length+" upcoming)")}${tab("classes","Classes ("+(A.crows||[]).length+")")}${tab("schools","Schools ("+(A.srows||[]).length+")")}${tab("affiliates","Affiliates ("+(A.arows||[]).length+")")}${tab("reviews","Reviews ("+(A.rrows||[]).length+")")}${tab("inbox","Reports and messages ("+(A.attn?A.attn.reports+A.attn.messages:0)+")")}${tab("requests",(A.boss?"Requests from admins":"My requests to the boss")+" ("+(A.reqs||[]).filter(q=>q.status==="pending").length+")")}${A.boss?tab("pay","Payments and settings"):""}${A.boss?tab("staff","Staff ("+(A.staffRows||[]).length+")"):""}${tab("log","Activity log")}${tab("visits","Visits")}</div>
    ${PAY.paused?"":`<details style="margin:0 0 14px"><summary class="small">Emergency: pause all new bookings</summary><p class="small muted" style="margin:8px 0">Use this for a payment fault or a safety incident. Nobody can book until the admin boss starts bookings again. Lessons already booked go ahead. The admin boss is told at once.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pause-why" aria-label="Why booking should be paused" placeholder="Why? (required)" maxlength="300" style="flex:1;min-width:200px"><button class="btn sm ghost" onclick="pauseNow()">Pause new bookings</button></div></details>`}`;
}
function adminLearners(){
  const rows=A.lrows||[];
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Student and parent accounts are active as soon as the email is confirmed. Suspend one to block it; restore it at any time. Every change is recorded with your account and the time.</p>
    ${rows.length?`<div class="scroll"><table class="admin" style="min-width:720px"><thead><tr><th>Account</th><th>Type</th><th>Children</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}</td>
      <td>${r.role==="parent"?"Parent":"Student"}<div class="small muted">${esc([r.city,r.country].filter(Boolean).join(", "))}</div>
        ${r.goals || (r.languages||[]).length || r.timezone || r.education_level || r.about?`<details style="padding:6px 10px;margin-top:6px"><summary class="small">Profile</summary>${r.education_level?`<p class="small" style="margin:6px 0">Level: ${esc(r.education_level)}</p>`:""}${r.about?`<p class="small" style="margin:6px 0">About: ${esc(r.about)}</p>`:""}<p class="small" style="margin:6px 0">Languages: ${esc((r.languages||[]).join(", ")||"(none given)")}</p><p class="small" style="margin:6px 0">Wants to learn: ${esc(r.goals||"(nothing written)")}</p><p class="small" style="margin:6px 0">Time zone: ${esc((r.timezone||"(not set)").replace(/_/g," "))}</p></details>`:""}</td>
      <td>${r.role==="parent"?r.child_count:"–"}</td>
      <td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td><span class="tag ${r.status==="active"?"ok":"bad"}">${r.status==="active"?"Active":"Suspended"}</span>${r.last_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(r.last_note)}</div>`:""}</td>
      <td><input id="lnote-${r.id}" aria-label="Note for ${esc(r.full_name)}" placeholder="Note (optional)" maxlength="1000">
        <div class="acts">${r.status==="active"?`<button class="btn sm ghost" onclick="setLearnerStatus('${r.id}','suspended')">Suspend</button>`:`<button class="btn sm" onclick="setLearnerStatus('${r.id}','active')">Restore</button>`}</div></td>
    </tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">No students or parents have signed up yet.</div>`}
  </div>`;
}
function adminBookings(){
  const rows=A.brows||[], now=Date.now(), at=b=>Date.parse(b.starts_at);
  const sets={upcoming:rows.filter(b=>b.status==="booked" && at(b)>now).sort((x,y)=>at(x)-at(y)), past:rows.filter(b=>b.status==="booked" && at(b)<=now), cancelled:rows.filter(b=>b.status==="cancelled"), all:rows, disputed:rows.filter(b=>b.attendance_disputed)};
  const list=sets[A.bfilter]||sets.upcoming;
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.bfilter===k}" onclick="A.bfilter='${k}';render()">${l} (${sets[k].length})</button>`;
  const who={student:"the student",parent:"the parent",teacher:"the teacher",admin:"an admin"};
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Every lesson booked on SeastackSchool. Times are shown in your time zone (${esc(TZ)}). Cancelling a booking here frees the seat and emails the teacher and the family. For a lesson that has started you can set the attendance; your choice is final and overrides the teacher's.</p>
    <div class="chips" style="margin-bottom:14px">${chip("upcoming","Upcoming")}${chip("past","Past")}${chip("cancelled","Cancelled")}${chip("all","All")}${chip("disputed","Attendance disputed")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:820px"><thead><tr><th>Lesson time</th><th>Class</th><th>For</th><th>Booked by</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${list.map(b=>{ const when=new Date(b.starts_at), upcoming=b.status==="booked" && at(b)>now; return `<tr>
      <td><b>${fmtDay(when)}</b><div class="small">${fmtTime(when)}</div></td>
      <td><b>${esc(b.class_title)}</b><div class="small">${esc(b.teacher_name||"(no name)")} · ${esc(b.teacher_email)}</div></td>
      <td>${esc(b.attendee_name)}</td>
      <td>${esc(b.learner_name||"(no name)")} <span class="small muted">(${b.learner_role})</span><div class="small">${esc(b.learner_email)}</div><div class="small muted">Booked ${new Date(b.created_at).toLocaleDateString()}</div></td>
      <td><span class="tag ${b.status==="cancelled"?"bad":upcoming?"ok":"group"}">${b.status==="cancelled"?"Cancelled":upcoming?"Booked":b.attendance==="no_show"?"Did not attend":"Took place"}</span>${b.attendance_disputed?`<div class="small" style="color:var(--rose);margin-top:4px">The family disputes this</div>`:""}${b.attendance_locked?`<div class="small muted" style="margin-top:4px">Attendance decided by you</div>`:""}${b.status==="cancelled"?`<div class="small muted" style="margin-top:4px">by ${who[b.cancelled_by_kind]||"someone"}, ${new Date(b.cancelled_at).toLocaleDateString()}</div>`:""}${b.emailed?"":`<div class="small muted" style="margin-top:4px">No booking email sent</div>`}${b.mode==="in_person"?`<div class="small muted" style="margin-top:4px">In person</div>`:b.joined_at?`<div class="small muted" style="margin-top:4px">Opened the lesson at ${fmtTime(new Date(b.joined_at))}</div>`:""}</td>
      <td>${(x=>{ const paid=x.pay_status==="paid", refundable=paid||x.pay_status==="kept";
          const ask=(kind,id,label)=>reqWaiting(kind,id)?`<span class="tag group">Waiting for the admin boss</span>`:`<input id="bwhy-${b.id}" aria-label="Reason for the admin boss" placeholder="Reason for the boss (required)" maxlength="1000"><div class="acts"><button class="btn sm ghost" onclick="sendRequest('${kind}','${id}','bwhy-${b.id}')">${label}</button></div>`;
          return (upcoming ? (paid && !A.boss ? ask("cancel_paid_booking",b.id,"Ask the boss to cancel and refund") : `<button class="btn sm ghost" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel"+(paid?" and refund":""):"Cancel booking"}</button>`)
            : b.status==="booked"?`<div class="acts" style="margin:0"><button class="btn sm ghost" onclick="markAttendance('${b.id}','attended')">Attended</button><button class="btn sm ghost" onclick="markAttendance('${b.id}','no_show')">Did not attend</button></div>`:"")
            + (!upcoming && refundable && !A.boss ? `<div style="margin-top:6px">${ask("refund",x.payment_id,"Ask the boss for a refund")}</div>` : "")
            + (A.boss && x.has_msgs ? `<div style="margin-top:6px"><input id="cwhy-${b.id}" aria-label="Why you are reading these messages" placeholder="Why read their messages? (required)" maxlength="300"><div class="acts"><button class="btn sm ghost" onclick="readConv('${x.teacher_id}','${x.learner_id}','cwhy-${b.id}',null)">Read their messages</button></div></div>` : "") })(A.bx[b.id]||{})}</td>
    </tr>` }).join("")}</tbody></table></div>${rows.length>=500?`<p class="small muted">Showing the 500 most recent bookings.</p>`:""}`
    :`<div class="empty">${rows.length?"No bookings in this list.":"No lessons have been booked yet."}</div>`}
  </div>`;
}
async function setLearnerStatus(id,status){
  const note=$("#lnote-"+id)?.value.trim()||null;
  const r = await sb.rpc("admin_set_learner_status",{p_learner_id:id,p_status:status,p_note:note});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); toast(status==="active"?"Account restored":"Account suspended"); render();
}

/* ---------- student and parent accounts ---------- */
function accountPage(){
  if(!sb) return `<div class="wrap page"><h2>My account</h2><div class="notice">Accounts can't be reached right now. Check your connection and reload the page.</div></div>`;
  if(A.recovery) return newPasswordPage();
  if(!A.user){ kindFor("account",null); return authPage() }
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.learner) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">My account</h2>${who}</div>
    <div class="notice">${A.teacher?`You're signed in with a teacher account. <a href="#/studio">Open the teacher studio</a>`:A.school?`You're signed in with a school account. <a href="#/myschool">Open my school</a>`:A.aff?`You're signed in with an affiliate account. <a href="#/partner">Open the affiliate dashboard</a>`:A.admin?`You're signed in with the admin account. <a href="#/admin">Manage accounts</a>`:"This account has no profile yet."}</div></div>`;
  const L=A.learner, parent=L.role==="parent";
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">My account</h2>${who}</div>
    ${L.status==="suspended"?`<div class="notice bad">This account is suspended. Contact support from the Help page.</div>`:""}
    <div class="cols"><div>
      <form class="box row" id="acctf" novalidate onsubmit="event.preventDefault();saveLearner(this)">
        <h3 style="grid-column:1/-1;margin:0">${parent?"Parent profile":"Student profile"}</h3>
        <label class="field" style="grid-column:1/-1">Full name<input name="full_name" id="ac-name" maxlength="120" value="${esc(L.full_name)}"></label>
        <label class="field">Country<input name="country" id="ac-country" maxlength="80" value="${esc(L.country||"")}"></label>
        <label class="field">City<input name="city" id="ac-city" maxlength="120" value="${esc(L.city||"")}"></label>
        <label class="field" style="grid-column:1/-1">Your time zone (lesson times are shown in it)<select name="timezone" id="ac-tz">${(z=>tzList().concat(tzList().includes(z)?[]:[z]).map(o=>`<option value="${esc(o)}" ${o===z?"selected":""}>${esc(o.replace(/_/g," "))}</option>`).join(""))(L.timezone||TZ)}</select></label>
        <label class="field" style="grid-column:1/-1">Languages you speak, separated by commas<input name="languages" id="ac-langs" value="${esc((L.languages||[]).join(", "))}" placeholder="English, French"></label>
        <label class="field" style="grid-column:1/-1">${parent?"What you'd like your children to learn":"What you want to learn"}<textarea name="goals" id="ac-goals" rows="2" maxlength="1000">${esc(L.goals||"")}</textarea></label>
        ${parent?"":`<label class="field" style="grid-column:1/-1">Your level (school grade, college or university, working adult)<input name="education_level" id="ac-level" maxlength="120" value="${esc(L.education_level||"")}" placeholder="e.g. Grade 10, or university student"></label>
        <label class="field" style="grid-column:1/-1">About you (what you study or do, and what you already know)<textarea name="about" id="ac-about" rows="2" maxlength="1000">${esc(L.about||"")}</textarea></label>
        <label class="field" style="grid-column:1/-1">Anything else your teachers should know (optional)<textarea name="note" id="ac-note" rows="2" maxlength="500">${esc(L.note_for_teachers||"")}</textarea></label>`}
        <p class="small muted" style="grid-column:1/-1;margin:0">Your profile is not public. ${parent?"The teachers of the classes you book see your name, country, languages and what you'd like your children to learn, with each child's first name, school grade and note. They never see your email or city.":"The teachers of the classes you book see your name, level, country, languages, what you want to learn, what you wrote about yourself and your note. They never see your email or city."}</p>
        <button class="btn sm" style="grid-column:1/-1;justify-self:start">Save profile</button>
      </form>
      ${parent?familyBox():""}${accountSettings()}
    </div><div>
      <div class="box"><h3>My lessons</h3><p class="muted" style="margin:0 0 12px">${(n=>n===1?"1 upcoming lesson.":n+" upcoming lessons.")(A.bookings.filter(b=>b.learner_id===A.user.id && b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length)}<span class="paynote"> Online payment is not open yet, so nothing is charged when you book.</span></p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#/learning">Open my lessons</a><a class="btn sm ghost" href="#/classes">Find a class</a></div></div>
    </div></div>
  </div>`;
}
function familyBox(){
  return `<div class="box"><h3>My children</h3>
    <p class="muted small">Children under 13 don't need their own account. Add them here, and when you book you choose which child the lesson is for. The school grade and note are optional, and are shown only to the teachers of the classes you book for that child.</p>
    ${A.children.length?A.children.map(k=>`<div class="lesson"><div style="flex:1;min-width:200px"><b>${esc(k.first_name)}</b>, age ${k.age}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><input id="cgrade-${k.id}" value="${esc(k.grade||"")}" maxlength="80" placeholder="School grade or level" aria-label="School grade or level of ${esc(k.first_name)}" style="flex:0 1 170px;min-width:130px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><input id="cnote-${k.id}" value="${esc(k.note||"")}" maxlength="300" placeholder="Note for teachers (optional)" aria-label="Note for teachers about ${esc(k.first_name)}" style="flex:1;min-width:180px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="saveChildNote('${k.id}')">Save</button></div></div><button class="btn ghost sm" onclick="dropChild('${k.id}')">${A.removingChild===k.id?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No children added yet.</div>`}
    <form class="row" id="childf" novalidate onsubmit="event.preventDefault();addChild(this)">
      <label class="field">Child's first name<input name="n" id="ch-name" maxlength="60"></label>
      <label class="field">Age<input name="a" id="ch-age" type="number" min="3" max="17"></label>
      <label class="field">School grade or level (optional)<input name="g" id="ch-grade" maxlength="80" placeholder="e.g. Grade 4"></label>
      <button class="btn sm" style="align-self:end">Add child</button>
    </form></div>`;
}
async function saveLearner(f){
  const name=f.full_name.value.trim();
  if(!name) return toast("Enter your full name");
  const row={full_name:name,country:f.country.value.trim(),city:f.city.value.trim(),timezone:f.timezone.value,
    languages:f.languages.value.split(",").map(s=>s.trim()).filter(Boolean).slice(0,12),goals:f.goals.value.trim()};
  if(f.note) row.note_for_teachers=f.note.value.trim();
  if(f.education_level){ row.education_level=f.education_level.value.trim(); row.about=f.about.value.trim() }
  const r = await sb.from("learners").update(row).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "Your profile could not be saved");
  A.learner=r.data;
  // the saved time zone takes effect now, on this device too
  try{ localStorage.removeItem("ss:tz") }catch(e){}
  if(row.timezone){ TZ=row.timezone; document.querySelectorAll("select.tzpick").forEach(s=>{ s.value=TZ }) }
  toast("Profile saved"); render();
}
async function addChild(f){
  const name=f.n.value.trim(), age=+f.a.value;
  if(!name) return toast("Enter your child's first name");
  if(!(age>=3 && age<=17)) return toast("Enter an age between 3 and 17");
  const r = await sb.from("children").insert({parent_id:A.user.id,first_name:name,age,grade:f.g.value.trim()});
  if(r.error) return toast(/up to 10/.test(r.error.message) ? "A parent account can list up to 10 children" : /row-level security/i.test(r.error.message) ? "Your account can't add children right now" : r.error.message);
  await loadMe(); toast("Child added"); render();
}
async function saveChildNote(id){
  const note=($("#cnote-"+id)?.value||"").trim(), grade=($("#cgrade-"+id)?.value||"").trim();
  const r = await sb.from("children").update({note,grade}).eq("id",id).select("id").maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "The details could not be saved");
  const k=A.children.find(c=>c.id===id); if(k){ k.note=note; k.grade=grade }
  toast("Saved");
}
async function saveAffiliate(f){
  const name=f.full_name.value.trim(); let web=f.website.value.trim();
  if(!name) return toast("Enter your full name");
  if(web && !/^https?:\/\//i.test(web)) web="https://"+web;
  if(web && !/^https?:\/\/\S+$/.test(web)) return toast("The website address doesn't look right");
  const r = await sb.from("affiliates").update({full_name:name,country:f.country.value.trim(),website:web,pitch:f.pitch.value.trim()}).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "Your profile could not be saved");
  A.aff=r.data; toast("Profile saved"); render();
}
async function dropChild(id){
  if(A.removingChild!==id){ A.removingChild=id; render(); return }
  A.removingChild=null;
  const r = await sb.from("children").delete().eq("id",id);
  if(r.error) return toast(r.error.message);
  await loadMe(); toast("Child removed"); render();
}
// My lessons: a signed-in student or parent manages family in their account, not in this browser.
const baseLearning = learning;
learning = function(){
  if(A.learner) return realLessons();
  if(!A.user) return `<div class="wrap page"><h2>My lessons</h2>
    <div class="empty"><h3>Sign in to see your lessons</h3><p class="muted">Your booked lessons and your family details are kept in your student or parent account.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn" href="#/account" onclick="A.mode='signin';A.err='';A.msg='';setTimeout(render,0)">Sign in</a><a class="btn ghost" href="#/account" onclick="A.mode='signup';A.kind='student';A.err='';A.msg='';setTimeout(render,0)">Create a free account</a></div></div></div>`;
  return `<div class="wrap page"><h2>My lessons</h2><div class="notice">${A.teacher?`You're signed in with a teacher account. Bookings in your classes are in the <a href="#/studio">Teacher studio</a>.`:"Lessons are booked from a student or parent account. This account is a different type, so it has no lessons."}</div></div>`;
};
function bookingRow(b, upcoming){
  const c=cls(b.class_id), t=c?teacher(c.t):null, when=new Date(b.starts_at), link=A.links[b.class_id], inPerson=!!c && c.mode==="in_person", addr=A.addresses[b.class_id];
  return `<div class="lesson"><div><b>${c?esc(c.title):"Class no longer listed"}</b>
    <div class="small muted">${fmtDay(when)}, ${fmtTime(when)} (your time)${t?" · with "+esc(t.name):""} · for ${esc(b.attendee_name)}${payNote(b)}</div>
    ${!upcoming?"":inPerson?`<div class="small">${addr?"Where: "+esc(addr):`In person${c.place?" in "+esc(c.place):""}. The teacher hasn't added the address yet; it will appear here when they do.`}</div>`
      :!link?`<div class="small muted">The teacher hasn't added a lesson link yet. It will appear here when they do.</div>`:""}</div>
    ${upcoming?`<div style="display:flex;gap:8px;flex-wrap:wrap">${link && !inPerson?`<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer" onclick="recordJoin('${b.id}')">Join lesson</a>`:""}${t?`<a class="btn ghost sm" href="#/messages/${t.id}">Message teacher</a>`:""}<button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel"+refundHint(b):"Cancel"}</button></div>`:(b.status!=="booked" || !t ? ""
      : b.attendance!=="no_show" ? `<a class="btn ghost sm" href="#/teacher/${t.id}">Rate this teacher</a>`
      : b.attendance_locked ? `<span class="small muted">Marked as not attended</span>`
      : b.attendance_disputed ? `<span class="small muted">Marked as not attended. Sent to SeastackSchool to review.</span>`
      : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="small muted">The teacher marked this lesson as not attended.</span><button class="btn ghost sm" onclick="disputeAttendance('${b.id}')">This is wrong</button></div>`)}</div>`;
}
function realLessons(){
  const now=Date.now(), mine=A.bookings.filter(b=>b.learner_id===A.user.id), end=b=>Date.parse(b.starts_at)+90*6e4;
  const up=mine.filter(b=>b.status==="booked" && end(b)>now), past=mine.filter(b=>b.status==="booked" && end(b)<=now), gone=mine.filter(b=>b.status==="cancelled");
  return `<div class="wrap page"><h2>My lessons</h2>
    ${up.length?up.map(b=>bookingRow(b,true)).join(""):`<div class="empty"><h3>No lessons booked yet</h3><p class="muted">Find a class that fits your week.</p><a class="btn" href="#/classes">Find classes</a></div>`}
    ${past.length?`<h3 style="margin-top:24px">Past lessons</h3>${past.map(b=>bookingRow(b,false)).join("")}`:""}
    ${gone.length?`<h3 style="margin-top:24px">Cancelled</h3>${gone.map(b=>bookingRow(b,false)).join("")}`:""}
    <p class="small muted" style="margin-top:18px"><span class="paynote">Online payment is not open yet, so nothing is charged for these bookings.</span>${A.learner.role==="parent"?` Your children are managed in <a href="#/account">your account</a>.`:""}</p>
  </div>`;
}
// Opening an online lesson from here is recorded once, around the lesson time, so the teacher can see who joined.
function recordJoin(id){ try{ sb.rpc("record_join",{p_booking_id:id}).then(()=>{}, ()=>{}) }catch(e){} }
async function cancelReal(id){
  if(A.cancelling!==id){ A.cancelling=id; render(); return }
  A.cancelling=null;
  const r = await sb.rpc("cancel_booking",{p_booking_id:id});
  if(r.error){ toast(r.error.message); render(); return }
  notifyBooking(id,"cancelled"); settleRefunds();
  await loadMe(); await loadPublic(); toast("Booking cancelled"); render();
}
// Emails the teacher and the learner. The booking itself never depends on this succeeding.
function notifyBooking(){ /* alerts and their emails are created by the database when a booking changes */ }

/* ---------- booking: real classes can't be booked yet ---------- */
const baseOpenBooking = openBooking;
openBooking = function(cid,key){
  const c=cls(cid);
  if(!c || !c.real) return baseOpenBooking(cid,key);
  RB={cid,key:key||null,child:null,done:null,err:""}; BK={};
  showRealBooking(); $("#dlg").showModal();
};
function showRealBooking(){
  const c=cls(RB.cid), t=teacher(c.t), body=$("#dlgBody"), x=`<button class="x" onclick="$('#dlg').close()" aria-label="Close">×</button>`;
  if(RB.done){
    body.innerHTML = `<div class="dlg-head"><h3>You're booked</h3>${x}</div>
      <div class="ok"><b>${esc(c.title)}</b><div>${fmtDay(RB.done.start)}, ${fmtTime(RB.done.start)} (your time) · for ${esc(RB.done.who)}</div></div>
      <p class="small muted" style="margin-top:12px">Nothing was charged: online payment is not open yet. ${c.mode==="in_person"?`This class is in person${c.place?" in "+esc(c.place):""}. The address is in My lessons once the teacher has added it.`:A.links[c.id]?"The lesson link is in My lessons.":"The teacher hasn't added a lesson link yet. It will appear in My lessons when they do."}</p>
      <div style="display:flex;justify-content:flex-end"><a class="btn" href="#/learning" onclick="$('#dlg').close()">Go to My lessons</a></div>`;
    return;
  }
  const parent=A.learner?.role==="parent";
  const kids=parent?A.children.filter(k=>k.age>=c.ages[0] && k.age<=c.ages[1]):[];
  let block="";   // why this visitor can't book, if they can't
  if(!A.user) block=`To book this class, sign in or create a free student or parent account.<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#/account" onclick="A.mode='signup';A.kind='student';$('#dlg').close()">Create an account</a><a class="btn sm ghost" href="#/account" onclick="A.mode='signin';$('#dlg').close()">Sign in</a></div>`;
  else if(!A.learner) block=`Lessons are booked from a student or parent account. You're signed in with ${A.teacher?"a teacher":A.aff?"an affiliate":A.school?"a school":"the admin"} account.`;
  else if(A.learner.status!=="active") block="This account is suspended, so it can't book lessons.";
  else if(!parent && c.ages[1]<13) block="This class is for children under 13, so it's booked from a parent account.";
  else if(parent && !A.children.length) block=`Add your child to your account first. <a href="#/account" onclick="$('#dlg').close()">Open my account</a>`;
  else if(parent && !kids.length) block=`This class is for ${ageLabel(c.ages).toLowerCase()}. None of the children on your account are that age.`;
  if(!block && PAY.enabled && !PAY.payable.has(c.t)) block=(t.school?"This school":"This teacher")+" isn't set up to take paid bookings yet. Please check back soon.";
  if(kids.length && !kids.some(k=>k.id===RB.child)) RB.child=kids[0].id;
  const ss=sessions(c);
  body.innerHTML = `<div class="dlg-head"><div><span class="tag ${c.type}">${typeLabel(c)}</span><h3 style="margin-top:6px">${esc(c.title)}</h3>
    <div class="small">with <a href="#/teacher/${t.id}" onclick="$('#dlg').close()">${esc(t.name)}</a> · ${c.mins} min · ${money(c.price)} · ${ageLabel(c.ages)} · ${modeLabel(c)}</div></div>${x}</div>
    <label class="small muted" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px">Times are shown in <select class="tzpick" id="tzbook" onchange="setTZ(this.value)" style="max-width:230px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit">${tzOptions()}</select></label>
    ${t.tz?`<p class="small muted" style="margin:6px 0 0">The teacher's time zone is ${esc(t.tz.replace(/_/g," "))}.</p>`:""}
    <div class="slots" role="group" aria-label="Choose a time">${ss.map(s=>`<button class="slot" aria-pressed="${RB.key===s.key}" ${s.left?"":"disabled"} onclick="RB.key='${s.key}';RB.err='';showRealBooking()"><b>${fmtDay(s.start)}</b>${fmtTime(s.start)}<div class="small ${s.left<=2&&s.left?"places low":"muted"}">${s.left?(c.type==="private"?"Open":s.left+" of "+c.cap+" places left"):"Full"}</div></button>`).join("") || "<p>No open times in the next two weeks.</p>"}</div>
    ${block?`<div class="notice">${block}</div>`:`
    ${parent?`<label class="field" style="margin:12px 0">Which child is this lesson for?<select id="rb-child" onchange="RB.child=this.value">${kids.map(k=>`<option value="${k.id}" ${RB.child===k.id?"selected":""}>${esc(k.first_name)}, ${k.age}</option>`).join("")}</select></label>`
            :`<p class="small" style="margin:12px 0">Booking for <b>${esc(A.learner.full_name||"you")}</b>.</p>`}
    <p class="small muted">${PAY.enabled?`You pay ${money(c.price)} on Stripe's secure page, then the lesson is booked. Full refund if you cancel ${PAY.hours} hours or more before the lesson, or if the teacher cancels.`:"Online payment is not open yet, so nothing is charged when you book."}</p>
    <div class="err" id="rberr">${esc(RB.err||"")}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:6px"><button class="btn" id="rbbtn" ${RB.key && ss.some(s=>s.key===RB.key&&s.left)?"":"disabled"} onclick="bookReal()">${PAY.enabled?"Pay "+money(c.price)+" and book":"Book this lesson"}</button></div>`}`;
}
async function bookReal(){
  const c=cls(RB.cid), start=+RB.key.split("@")[1], btn=$("#rbbtn"), parent=A.learner.role==="parent";
  btn.disabled=true; btn.textContent="Please wait…";
  if(PAY.enabled){   // paid: Stripe takes the money first, and the booking is made when Stripe confirms it
    const p = await sb.functions.invoke("stripe-checkout",{body:{class_id:c.id,starts_at:new Date(start).toISOString(),child_id:parent?RB.child:null,tz:TZ}});
    if(p.error || !p.data || !p.data.url){ RB.err = (p.data && p.data.message) || "The payment page could not be opened. Nothing was charged."; await loadPublic(); render(); showRealBooking(); return }
    location.href = p.data.url; return;
  }
  const r = await sb.rpc("book_class",{p_class_id:c.id,p_starts_at:new Date(start).toISOString(),p_child_id:parent?RB.child:null});
  if(r.error){ RB.err=r.error.message; await loadPublic(); render(); showRealBooking(); return }
  notifyBooking(r.data,"booked");
  const who = parent ? (A.children.find(k=>k.id===RB.child)?.first_name||"your child") : (A.learner.full_name||"you");
  await loadMe(); await loadPublic();
  RB.done={start:new Date(start),who}; toast("Lesson booked"); render(); showRealBooking();
}

/* ---------- your own account: getting started (teachers), change password, delete account ---------- */
function teacherChecklist(){
  const t=A.teacher, cl=A.classes;
  const items=[
    [!!(t.full_name.trim() && t.intro.trim() && (t.languages||[]).length), "Fill in your profile: name, introduction and teaching languages", "profile", "Open My profile"],
    [A.quals.length>0 && A.quals.every(q=>q.doc_name), "Add your qualifications, with a photo of the document for each, so families know what you are qualified to teach", "profile", "Open My profile"],
    [A.tdocs.some(idDoc) || !!t.identity_checked_at, "Upload an identity document", "profile", "Open My profile"],
    [!!t.photo, "Add a profile photo", "profile", "Open My profile"],
    ...(PAY.enabled && !t.school_id ? [[!!(A.payout && A.payout.charges_enabled), "Connect Stripe so you can be paid. Classes can't be booked until you do", "profile", "Open My profile"]] : []),
    [cl.length>0, t.school_id ? "Your school gives you your first class" : "Create your first class", t.school_id ? null : "list", "Open My classes"],
    [cl.length>0 && cl.every(c=>c.mode==="in_person" ? !!A.addresses[c.id] : !!A.links[c.id]), "Add a lesson link (online) or address (in person) to every class", "list", "Open My classes"],
    [t.status==="approved", t.school_id ? "Be approved by your school" : "Be approved by SeastackSchool, which happens after we review your profile", null, ""]
  ];
  const done=items.filter(i=>i[0]).length;
  if(done===items.length) return "";
  return `<div class="box" style="margin:12px 0"><h3>Getting started: ${done} of ${items.length} done</h3>
    ${items.map(([ok,text,tab,label])=>`<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:5px 0"><span aria-hidden="true" style="color:${ok?"var(--leaf)":"var(--muted)"};font-weight:700">${ok?"✓":"○"}</span><span style="flex:1;min-width:200px;${ok?"color:var(--muted)":""}">${text}<span class="sr">${ok?" (done)":" (to do)"}</span></span>${!ok&&tab&&TAB!==tab?`<button class="btn ghost sm" onclick="TAB='${tab}';render()">${label}</button>`:""}</div>`).join("")}</div>`;
}
function accountSettings(){
  const what = A.teacher ? "your profile, classes, documents and ratings"
    : A.school ? "your school's page and documents. Your teachers keep their own accounts but go back to waiting for approval"
    : A.aff ? "your affiliate link and its history"
    : A.learner && A.learner.role==="parent" ? "your children's details, your bookings and your ratings" : "your bookings and your ratings";
  return `<details style="margin-top:16px"><summary>Password and account</summary>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-top:12px"><input type="checkbox" id="alert-email" ${A.alertEmail?"checked":""} onchange="setAlertEmail(this.checked)" style="margin-top:4px"><span><b>Email me alerts</b><span class="small muted" style="display:block">Bookings, cancellations, messages, lesson reminders and decisions about your account. Alerts always show on the site under Alerts.</span></span></label>
    <form id="pwf" novalidate onsubmit="event.preventDefault();changePassword(this)" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:end">
      <label class="field" style="flex:1;min-width:220px">New password (at least 8 characters)<input name="password" id="pw-new" type="password" autocomplete="new-password"></label>
      <button class="btn sm">Change password</button></form>
    <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><b>Delete my account</b>
      <p class="small muted" style="margin:6px 0 10px">This permanently removes your account, including ${what}. It cannot be undone.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="del-confirm" placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" autocomplete="off" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn sm ghost" onclick="deleteAccount()">Delete my account</button></div></div>
  </details>`;
}
async function changePassword(f){
  const v=f.password.value;
  if(v.length<8) return toast("Choose a password with at least 8 characters");
  const r = await sb.auth.updateUser({password:v});
  if(r.error) return toast(r.error.message);
  f.reset(); toast("Password changed");
}
async function deleteAccount(){
  if(($("#del-confirm")?.value||"").trim()!=="DELETE") return toast("Type DELETE in capitals to confirm");
  if(A.teacher && A.classes.some(c=>classHasUpcoming(c.id))) return toast("You have upcoming bookings. Cancel those lesson dates first, then delete your account.");
  // documents are files, so they are removed first; the account and everything else go together
  try{
    if(A.teacher && A.tdocs.length) await sb.storage.from("teacher-docs").remove(A.tdocs.map(d=>d.path));
    if(A.school && A.docs.length) await DOCS().remove(A.docs.map(d=>d.path));
  }catch(e){}
  const r = await sb.rpc("delete_my_account");
  if(r.error) return toast(r.error.message);
  try{ await sb.auth.signOut({scope:"local"}) }catch(e){}
  A.mode="signin"; A.msg=""; A.err=""; location.hash="#/"; toast("Your account has been deleted");
}

/* ---------- trust and safety: identity documents, reports, the Help inbox, what needs the admin ---------- */
function trustLine(t){
  if(!t || !t.real) return "";
  const nq=(t.quals||[]).length;
  const tags=[t.checked?`<span class="tag ok">Identity checked by SeastackSchool</span>`:"", nq?`<span class="tag ok">${nq} verified ${nq===1?"qualification":"qualifications"}</span>`:""].filter(Boolean);
  return tags.length ? `<div class="small" style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${tags.join("")}</div>` : "";
}
const idDoc = d => !/\/qual-[^/]*$/.test(d.path);   // identity files, as opposed to a qualification's document
function teacherDocsBox(){
  const t=A.teacher;
  return `<div class="box"><h3>Identity documents</h3>
    <p class="muted small">Upload a photo ID. Certificates go with each qualification in the box above. Only you and SeastackSchool can open these; they are never shown to students or visitors. ${t.identity_checked_at?`<b>Your identity was checked on ${new Date(t.identity_checked_at).toLocaleDateString()}</b>, and your profile shows "Identity checked by SeastackSchool".`:"Once we have checked them, your profile shows \"Identity checked by SeastackSchool\"."}</p>
    ${A.tdocs.some(idDoc)?A.tdocs.map((d,i)=>!idDoc(d)?"":`<div class="lesson"><span style="overflow-wrap:anywhere">${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a>`:esc(d.name)}</span><button class="btn ghost sm" onclick="dropTDoc(${i})">${A.removingTDoc===d.path?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No documents uploaded yet.</div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><input type="file" id="tdocfile" accept=".pdf,.jpg,.jpeg,.png" aria-label="Choose a document"><button class="btn sm" id="tdocbtn" onclick="uploadTDoc()">Upload</button></div>
    <p class="small muted" style="margin:8px 0 0">PDF, JPG or PNG, up to 10 MB each, up to 5 files.</p></div>`;
}
async function uploadTDoc(){
  const file=$("#tdocfile").files[0], btn=$("#tdocbtn");
  if(!file) return toast("Choose a file first");
  if(A.tdocs.filter(idDoc).length>=5) return toast("You can upload up to 5 documents. Remove one first.");
  if(file.size>10*1024*1024) return toast("That file is larger than 10 MB");
  if(!["application/pdf","image/jpeg","image/png"].includes(file.type)) return toast("Upload a PDF, JPG or PNG file");
  btn.disabled=true; btn.textContent="Uploading…";
  const path=A.user.id+"/"+Date.now()+"-"+file.name.replace(/[^A-Za-z0-9._-]/g,"_").slice(-80);
  const r = await sb.storage.from("teacher-docs").upload(path, file, {contentType:file.type});
  if(r.error){ toast(r.error.message); render(); return }
  A.tdocs = await listDocs(A.user.id, "teacher-docs"); toast("Document uploaded"); render();
}
async function dropTDoc(i){
  const d=A.tdocs[i]; if(!d) return;
  if(A.removingTDoc!==d.path){ A.removingTDoc=d.path; render(); return }
  A.removingTDoc=null;
  const r = await sb.storage.from("teacher-docs").remove([d.path]);
  if(r.error) return toast(r.error.message);
  A.tdocs = await listDocs(A.user.id, "teacher-docs"); toast("Document removed"); render();
}
// A school opens its own teachers' qualification documents directly. Staff give a reason first: the opening is
// logged, and only then does the database let the files be read, for ten minutes.
async function showTeacherDocs(id){
  if(A.admin && !(await staffOpenDocs("teacher-docs", id, "t-"+id))) return;
  A.tdocsAdmin[id] = await listDocs(id, "teacher-docs", A.admin ? 600 : 3600); render();
}
async function staffOpenDocs(bucket, id, key){
  const why = readWhy(key);
  if(why.length<5){ toast("Choose or write why you are opening these documents"); return false }
  const r = await sb.rpc("staff_open_documents",{p_bucket:bucket,p_owner:id,p_reason:why});
  if(r.error){ toast(r.error.message); return false }
  return true;
}
function whyBox(key){
  return `<select id="why-${key}" aria-label="Why you are opening these documents" style="max-width:100%"><option value="">Why are you opening these?</option><option>Checking a new account</option><option>Verifying a qualification</option><option>Handling a report</option><option value="Other">Another reason (write it)</option></select><input id="whyx-${key}" aria-label="More detail" placeholder="More detail (optional)" maxlength="300" style="margin-top:4px">`;
}
function readWhy(key){
  const s=$("#why-"+key)?.value||"", x=$("#whyx-"+key)?.value.trim()||"";
  return s==="Other" ? x : s ? s+(x?": "+x:"") : "";
}
/* ---------- qualifications: the public sees the title only; the admin verifies the document behind each one ---------- */
const qualStatus = q => q.verified_at ? `<span class="tag ok">Verified by SeastackSchool</span>${q.school_verified_at?` <span class="tag ok">and by the school</span>`:""}` : q.school_verified_at ? `<span class="tag ok">Verified by the school</span>` : q.doc_name ? `<span class="tag group">Waiting for verification</span>` : `<span class="tag bad">Document needed</span>`;
// The teacher's own view of their level and what the next one needs.
function teacherLevelBox(){
  const t=teacher(A.teacher.id);
  if(!t || !t.real) return "";
  const idOk=!!A.teacher.identity_checked_at, qOk=A.quals.some(q=>q.verified_at), rated=t.nrate>0;
  const tick=(ok,text)=>`<div style="display:flex;gap:10px;align-items:baseline;padding:3px 0"><span aria-hidden="true" style="color:${ok?"var(--leaf)":"var(--muted)"};font-weight:700">${ok?"✓":"○"}</span><span ${ok?`class="muted"`:""}>${text}<span class="sr">${ok?" (done)":" (to do)"}</span></span></div>`;
  const next = t.lvl===0 ? [[idOk,"Identity checked by SeastackSchool"],[qOk,"At least one qualification verified"]]
    : t.lvl===1 ? [[t.lessons>=10,`10 lessons taught here (you have ${t.lessons})`],[!rated||t.avg>=4,"Ratings averaging 4.0 or higher"]]
    : t.lvl===2 ? [[t.lessons>=50,`50 lessons taught here (you have ${t.lessons})`],[t.nrate>=5,`5 or more ratings (you have ${t.nrate})`],[t.avg>=4.5,"Ratings averaging 4.5 or higher"]] : [];
  return `<div class="box" id="levelbox" style="margin:12px 0"><h3>Your level:${rankTag(t)}</h3>
    ${next.length?`<p class="muted small" style="margin:0 0 6px">To reach <b>${RANKS[t.lvl+1]}</b>:</p>${next.map(x=>tick(x[0],x[1])).join("")}`:`<p class="muted small" style="margin:0">You are at the highest level. It stays while your ratings average 4.5 or higher.</p>`}
    <p class="small muted" style="margin:8px 0 0">Your level is shown on your profile and classes. It is worked out automatically from verified facts, lessons taught and ratings.</p></div>`;
}
function teacherQualsBox(){
  const inp=`padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)`;
  return `<div class="box" id="qualbox"><h3>Qualifications</h3>
    <p class="muted small">List each degree, teaching certificate or licence, and upload a clear photo or scan of the document for it. Students and parents see only the title, never the document. A qualification appears on your public profile after SeastackSchool, or your school if you belong to one, has verified its document.</p>
    ${A.quals.length?A.quals.map(q=>`<div class="lesson"><div style="flex:1;min-width:200px">${qualLine(q)} ${qualStatus(q)}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px"><input type="file" id="qfile-${q.id}" accept=".pdf,.jpg,.jpeg,.png" aria-label="Document for ${esc(q.title)}"><button class="btn ghost sm" id="qbtn-${q.id}" onclick="uploadQualDoc('${q.id}')">${q.doc_name?"Replace document":"Upload document"}</button></div>
        ${q.verified_at?`<div class="small muted" style="margin-top:4px">Replacing the document sends it for verification again.</div>`:""}</div>
      <button class="btn ghost sm" onclick="dropQual('${q.id}')">${A.removingQual===q.id?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No qualifications added yet.</div>`}
    ${A.quals.length<8?`<form id="qualf" novalidate onsubmit="event.preventDefault();addQual(this)" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
      <input name="title" id="q-title" maxlength="140" placeholder="Qualification, e.g. Bachelor of Education" aria-label="Qualification title" style="flex:2;min-width:200px;${inp}">
      <input name="issuer" id="q-issuer" maxlength="140" placeholder="Awarded by" aria-label="Awarded by" style="flex:2;min-width:160px;${inp}">
      <input name="year" id="q-year" maxlength="4" inputmode="numeric" placeholder="Year" aria-label="Year" style="flex:0 1 90px;min-width:70px;${inp}">
      <button class="btn sm">Add qualification</button></form>`:`<p class="small muted" style="margin:10px 0 0">You can list up to 8 qualifications.</p>`}
    <p class="small muted" style="margin:8px 0 0">Documents: PDF, JPG or PNG, up to 10 MB each.</p></div>`;
}
async function reloadQuals(){
  const q = await sb.from("teacher_qualifications").select("*").eq("teacher_id",A.user.id).order("created_at"); A.quals = q.data || [];
  A.tdocs = await listDocs(A.user.id, "teacher-docs");
}
async function addQual(f){
  const title=f.title.value.trim(), year=f.year.value.trim();
  if(title.length<2) return toast("Enter the title of the qualification");
  if(year && !/^\d{4}$/.test(year)) return toast("Enter the year as four digits, or leave it empty");
  const r = await sb.from("teacher_qualifications").insert({teacher_id:A.user.id,title,issuer:f.issuer.value.trim(),year});
  if(r.error) return toast(/up to 8/.test(r.error.message) ? "You can list up to 8 qualifications" : r.error.message);
  await reloadQuals(); toast("Qualification added. Now upload its document."); render();
}
async function uploadQualDoc(id){
  const q=A.quals.find(x=>x.id===id), file=$("#qfile-"+id)?.files[0], btn=$("#qbtn-"+id); if(!q) return;
  if(!file) return toast("Choose the photo or scan of the document first");
  if(file.size>10*1024*1024) return toast("That file is larger than 10 MB");
  const ext={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"}[file.type];
  if(!ext) return toast("Upload a PDF, JPG or PNG file");
  btn.disabled=true; btn.textContent="Uploading…";
  const name="qual-"+id+"-"+Date.now()+"."+ext, store=sb.storage.from("teacher-docs");
  const up = await store.upload(A.user.id+"/"+name, file, {contentType:file.type});
  if(up.error){ toast(up.error.message); render(); return }
  const r = await sb.from("teacher_qualifications").update({doc_name:name}).eq("id",id).select("id").maybeSingle();
  if(r.error || !r.data){ await store.remove([A.user.id+"/"+name]); toast(r.error?.message || "The document could not be saved"); render(); return }
  if(q.doc_name) await store.remove([A.user.id+"/"+q.doc_name]);
  await reloadQuals(); toast("Document uploaded. SeastackSchool will verify it."); render();
}
async function dropQual(id){
  const q=A.quals.find(x=>x.id===id); if(!q) return;
  if(A.removingQual!==id){ A.removingQual=id; render(); return }
  A.removingQual=null;
  const r = await sb.from("teacher_qualifications").delete().eq("id",id);
  if(r.error) return toast(r.error.message);
  if(q.doc_name) await sb.storage.from("teacher-docs").remove([A.user.id+"/"+q.doc_name]);
  await reloadQuals(); await loadPublic(); toast("Qualification removed"); render();
}
// Admin: each qualification with its document and a verify button.
function adminQuals(tid){
  const list=(A.aquals||[]).filter(q=>q.teacher_id===tid), docs=A.tdocsAdmin[tid];
  if(!list.length) return `<div class="small muted" style="margin-top:8px">No qualifications listed</div>`;
  return `<div class="small" style="margin-top:8px"><b>Qualifications</b>${list.map(q=>{ const d=docs && q.doc_name ? docs.find(x=>x.path.endsWith("/"+q.doc_name)) : null;
    return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line)">${qualLine(q)}<div style="margin-top:3px">${qualStatus(q)}${q.verified_at?" "+new Date(q.verified_at).toLocaleDateString():""}</div>
      <div class="acts">${!q.doc_name?"":d&&d.url?`<a class="btn sm ghost" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open document</a>`:`<button class="btn sm ghost" onclick="showTeacherDocs('${tid}')">Show document</button>`}
        ${q.verified_at?`<button class="btn sm ghost" onclick="verifyQual('${q.id}',false)">Remove verification</button>`:q.doc_name?`<button class="btn sm" onclick="verifyQual('${q.id}',true)">Verify</button>`:""}</div></div>` }).join("")}</div>`;
}
function qualsWaiting(){
  const w=(A.aquals||[]).filter(q=>q.doc_name && !q.verified_at); if(!w.length) return "";
  const names=[...new Set(w.map(q=>((A.rows||[]).find(r=>r.id===q.teacher_id)||{}).full_name||"(no name yet)"))];
  return `<div class="notice" style="margin:0 0 14px">${w.length} ${w.length===1?"qualification is":"qualifications are"} waiting for you to verify the document: ${esc(names.join(", "))}. Open the document, compare it with the title, then choose Verify.</div>`;
}
async function verifyQual(id, yes){
  const r = await sb.rpc("admin_verify_qualification",{p_id:id,p_verified:yes});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); await loadPublic(); toast(yes?"Qualification verified. It now shows on the teacher's profile.":"Verification removed. The qualification is no longer public."); render();
}
async function setIdentity(id, checked){
  const r = await sb.rpc("admin_set_identity_checked",{p_teacher_id:id,p_checked:checked});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); await loadPublic(); toast(checked?"Marked as identity checked":"Identity check removed"); render();
}
// A signed-in person can report a concern about a teacher; it goes to the admin only.
function reportBox(tid){
  const t=teacher(tid);
  if(!A.user) return `<details style="margin-top:0"><summary>Report a concern about this teacher</summary><p class="small muted" style="margin:8px 0 0"><a href="#/account">Sign in</a> to send a report, or write to us from the <a href="#/help">Help page</a>. If a child is in immediate danger, contact your local emergency services first.</p></details>`;
  if(A.user.id===tid) return "";
  return `<details style="margin-top:0"><summary>Report a concern about this teacher</summary>
    <form id="reportf" novalidate onsubmit="event.preventDefault();sendReport('${tid}',this)" style="margin-top:10px">
      <label class="field">What is it about?<select name="category" id="rp-cat"><option value="safety">A child's safety</option><option value="conduct">The teacher's behaviour</option><option value="no_show">The teacher did not turn up</option><option value="listing">The profile or class is misleading</option><option value="other">Something else</option></select></label>
      <label class="field" style="margin-top:8px">What happened?<textarea name="details" id="rp-details" rows="3" maxlength="2000"></textarea></label>
      <button class="btn sm" style="margin-top:10px">Send report</button>
      <p class="small muted" style="margin:8px 0 0">Only SeastackSchool sees this; ${esc((t.name||"the teacher").split(" ")[0])} is not told who sent it. If a child is in immediate danger, contact your local emergency services first.</p>
    </form></details>`;
}
async function sendReport(tid,f){
  const d=f.details.value.trim();
  if(d.length<10) return toast("Describe what happened in a sentence or two");
  const r = await sb.rpc("submit_report",{p_teacher_id:tid,p_category:f.category.value,p_details:d});
  if(r.error) return toast(r.error.message);
  f.reset(); toast("Report sent to SeastackSchool");
}
// The Help page form: stored for the admin to read.
async function sendSupport(f){
  const email=f.email.value.trim(), msg=f.message.value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email address so we can reply");
  if(msg.length<5) return toast("Write your message first");
  const r = await sb.rpc("submit_support",{p_email:email,p_topic:f.topic.value,p_message:msg});
  if(r.error) return toast(r.error.message);
  f.reset(); toast("Message sent to SeastackSchool");
}
function attentionPanel(){
  const a=A.attn; if(!a) return "";
  const go=(tab,extra)=>`A.adminTab='${tab}';${extra||""}render()`;
  const items=[
    [A.boss?(A.reqs||[]).filter(q=>q.status==="pending" && !q.mine).length:0,"request","requests","from an admin for your decision",go("requests")],
    [a.teachers,"teacher","teachers","waiting for approval",go("teachers","A.filter='pending';")],
    [a.classes,"class","classes","held by the automatic check",go("classes","A.cfilter='pending';")],
    [a.qualifications,"qualification","qualifications","waiting for you to verify the document",go("teachers","A.filter='all';")],
    [a.schools,"school","schools","waiting for review",go("schools","A.sfilter='pending';")],
    [a.affiliates,"affiliate","affiliates","waiting for approval",go("affiliates","A.afilter='pending';")],
    [a.disputes,"attendance mark","attendance marks","disputed by a family",go("bookings","A.bfilter='disputed';")],
    [a.hidden_by_school,"rating","ratings","hidden by a school",go("reviews")],
    [a.reports,"report","reports","about a teacher",go("inbox")],
    [a.messages,"Help message","Help messages","not answered",go("inbox")]
  ].filter(x=>x[0]>0);
  if(!items.length) return `<div class="ok" style="margin:12px 0">Nothing is waiting for you.</div>`;
  return `<div class="notice" style="margin:12px 0"><b>Waiting for you:</b> <span style="display:inline-flex;gap:6px;flex-wrap:wrap;vertical-align:middle">${items.map(([n,one,many,what,fn])=>`<button class="chip" onclick="${fn}">${n} ${n===1?one:many} ${what}</button>`).join("")}</span></div>`;
}
function adminInbox(){
  const ib=A.inbox||{reports:[],messages:[]}, cats={safety:"A child's safety",conduct:"Behaviour",no_show:"Teacher did not turn up",listing:"Misleading profile or class",other:"Other"};
  const done=(kind,id,st)=>st==="open"?`<button class="btn sm" onclick="resolveItem('${kind}','${id}',true)">Mark as dealt with</button>`:`<span class="tag ok">Dealt with</span> <button class="btn sm ghost" onclick="resolveItem('${kind}','${id}',false)">Reopen</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <h3>Reports about teachers</h3>
    <p class="muted">Sent by signed-in students, parents and others from a teacher's profile. The teacher is not told who reported them. You can suspend the teacher from the Teachers tab. Where the person who reported and the teacher have written to each other, you can read that one conversation; each reading is recorded in the activity log.</p>
    ${ib.reports.length?`<div class="scroll"><table class="admin" style="min-width:800px"><thead><tr><th>Teacher</th><th>About</th><th>What happened</th><th>From</th><th>Date</th><th>Action</th></tr></thead><tbody>
    ${ib.reports.map(r=>`<tr><td><b>${esc(r.teacher_name||"(no name)")}</b><div class="small">${esc(r.teacher_email)}</div><div class="small muted">Teacher is ${esc(r.teacher_status)}</div></td>
      <td><span class="tag ${r.category==="safety"?"bad":"group"}">${cats[r.category]||esc(r.category)}</span></td>
      <td class="small" style="max-width:300px;white-space:pre-line">${esc(r.details)}${r.admin_note?`<div class="muted" style="margin-top:4px">Your note: ${esc(r.admin_note)}</div>`:""}</td>
      <td class="small">${esc(r.reporter_email||"(account deleted)")}</td><td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${r.status==="open"?`<input id="rnote-${r.id}" aria-label="Note" placeholder="Note (optional)" maxlength="1000">`:""}<div class="acts">${done("report",r.id,r.status)}${(x=>x.has_msgs?`<button class="btn sm ghost" onclick="readConv('${x.teacher_id}','${x.reporter_id}',null,'${r.id}')">Read their messages</button>`:"")(A.rx[r.id]||{})}</div></td></tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">No reports.</div>`}
    <h3 style="margin-top:28px">Help messages</h3>
    <p class="muted">Sent from the Help page. Reply to the person from your own email; this list only tracks what has been dealt with.</p>
    ${ib.messages.length?`<div class="scroll"><table class="admin" style="min-width:700px"><thead><tr><th>From</th><th>Topic</th><th>Message</th><th>Date</th><th>Action</th></tr></thead><tbody>
    ${ib.messages.map(m=>`<tr><td class="small" style="overflow-wrap:anywhere">${esc(m.email)}</td><td class="small">${esc(m.topic)}</td><td class="small" style="max-width:340px;white-space:pre-line">${esc(m.message)}</td>
      <td class="small">${new Date(m.created_at).toLocaleDateString()}</td><td><div class="acts" style="margin:0">${done("message",m.id,m.status)}</div></td></tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">No messages.</div>`}
  </div>`;
}
async function resolveItem(kind,id,resolved){
  const note = kind==="report" ? ($("#rnote-"+id)?.value.trim()||null) : null;
  const r = await sb.rpc("admin_resolve",{p_kind:kind,p_id:String(id),p_resolved:resolved,p_note:note});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); toast(resolved?"Marked as dealt with":"Reopened"); render();
}
// Terms of Use and Privacy Policy. Plain-language drafts of how the site works today; to be reviewed by a lawyer.
function legalPage(title, updated, sections){
  return `<div class="wrap page"><div style="max-width:70ch"><h2>${title}</h2><p class="muted small">Last updated ${updated}</p>
    ${sections.map(([h,ps])=>`<h3 style="margin-top:24px">${h}</h3>${ps.map(p=>`<p>${p}</p>`).join("")}`).join("")}
    <p class="muted small" style="margin-top:28px">Questions about this page? Write to us from the <a href="#/help">Help page</a>.</p></div></div>`;
}
function termsPage(){
  return legalPage("Terms of Use","3 October 2026",[
    ["What SeastackSchool is",["SeastackSchool is a website where independent teachers and schools list lessons, online or in person, and students and parents book them. Teachers and schools are not employees of SeastackSchool. Each teacher or school is responsible for the lessons they give."]],
    ["Accounts",["You must give accurate information and keep your password to yourself. One person or one school per account.","Student accounts are for people aged 13 or over. Children under 13 do not have accounts: a parent or guardian books for them from a parent account and is responsible for those bookings."]],
    ["Teachers",["Teacher accounts are reviewed before the profile and classes are shown publicly. A profile must be truthful, including experience and qualifications.","Teachers must behave professionally, keep contact with children limited to the lesson and its arrangements, and follow the law where they and their students are. \"Identity checked by SeastackSchool\" means we have seen the identity documents the teacher uploaded. It is not a background check or a guarantee. A qualification is shown on a teacher's profile only after SeastackSchool, or the school the teacher belongs to, has seen a photo or copy of the document for it. The profile says which of the two verified it. The document itself is never shown. Seeing a document is not a guarantee that it is genuine. Everything else on a profile, including education and experience, is the teacher's own statement. A teacher's level (New, Verified, Established, Senior) is worked out automatically from identity and qualification checks, lessons taught on SeastackSchool and ratings. It is not a guarantee of quality.","Teachers who are not part of a school are independent. They are not employees, agents or contractors of SeastackSchool. Each independent teacher is solely responsible for their own taxes: declaring their income, and charging, collecting and paying any sales tax, GST, HST or VAT that applies to their lessons. SeastackSchool does not withhold, collect, pay or file any tax for teachers, does not issue tax documents for them beyond what the law requires of it, and does not give tax advice."]],
    ["Schools",["A school uploads documents showing it is registered or licensed, and is reviewed before its page is public. \"Documents reviewed by SeastackSchool\" means we have seen those documents. It is not accreditation or certification by any government or authority.","A school is responsible for the teachers it approves and for their lessons.","A school creates the classes its teachers take and sets their prices. Where online payment is open, payment for a school's lessons goes to the school. The school, not SeastackSchool, is responsible for paying its teachers and for all taxes and employment obligations that arise from its lessons and its staff."]],
    ["Messages",["A teacher and a student or parent can message each other once a lesson has been booked between them. Messages are for arranging and discussing lessons. Do not use them to move lessons or payment away from SeastackSchool, or to ask a child for personal contact details.","SeastackSchool, and the school a teacher belongs to, can read messages to keep families and teachers safe. SeastackSchool can suspend an account that misuses them."]],
    ["Booking, attendance and cancelling",["A booking reserves one place in one lesson. You can cancel before the lesson starts. Teachers, schools and SeastackSchool can also cancel a booking.","A lesson counts as attended unless the teacher marks otherwise. If you disagree with that mark you can ask SeastackSchool to review it, and our decision is final."]],
    ["Prices and payment", PAY.enabled ? ["Prices are set by teachers and shown in US dollars. You pay for a lesson when you book it, on a secure page run by Stripe. SeastackSchool never sees or stores your card number.",
      `SeastackSchool keeps ${PAY.fee}% of each lesson price as its fee. The teacher receives the rest, paid to them by Stripe.`,
      `Refunds: if you cancel ${PAY.hours} hours or more before the lesson starts, you are refunded in full. If you cancel later than that, you are not refunded and the teacher is paid. If the teacher or SeastackSchool cancels, you are always refunded in full. A refund goes back to the card you paid with and can take several days to appear.`]
      : ["Prices are set by teachers and shown in US dollars. Online payment is not open yet: booking on SeastackSchool charges nothing. When payment opens, these terms will be updated first."]],
    ["Ratings",["Only a student or parent who attended and finished a lesson can rate that teacher. Ratings must be honest and about the lesson. SeastackSchool, and a school for its own teachers, may hide a rating."]],
    ["Affiliates",["Affiliates are credited for accounts that sign up through their link. No commission is earned or paid until online payment opens and the rates are confirmed."]],
    ["What is not allowed",["Do not use SeastackSchool to harm or harass anyone, to contact children for any purpose other than their lessons, to post false or misleading information, to upload documents that are not yours, or to interfere with the site."]],
    ["Reports, suspension and removal",["You can report a concern about a teacher from their profile. We may suspend or remove any account, listing or rating that breaks these terms or puts someone at risk."]],
    ["Changes",["We may change these terms as the site grows. The date at the top shows the latest version."]]
  ]);
}
function privacyPage(){
  return legalPage("Privacy Policy","3 October 2026",[
    ["What we collect",["<b>Every account:</b> your email address, your name, and a password, which is stored in scrambled form that we cannot read.","<b>Teachers:</b> the profile you write (headline, city, country, time zone, subjects, experience, education, qualifications, languages, introduction), your classes, lesson links or addresses, and the identity and qualification documents you upload.","<b>Students and parents:</b> if you choose to add them, your country, city, time zone, languages, your level, a few lines about you, what you want to learn, and a note for your teachers.","<b>Parents:</b> each child's first name and age, and an optional school grade and note for that child's teachers. We do not ask for a child's surname, email, photo or date of birth, and children do not have accounts.","<b>Affiliates:</b> if you choose to add them, your country, a website and how you promote the site.","<b>Schools:</b> the school's details, a contact person, and the documents you upload.","<b>Bookings:</b> which lesson was booked, who it is for, attendance, and when an online lesson was opened from the site.","<b>Ratings, reports and Help messages</b> that you send.","<b>Messages</b> between a teacher and a student or parent.","<b>Alerts:</b> a record of the alerts sent to you (for example a booking, a cancellation or a lesson reminder). We email these to your account's address unless you switch email alerts off under Password and account.","<b>Place suggestions:</b> when you type a city or an address, the letters you type are sent to an OpenStreetMap search service (Photon) so that it can suggest places. Your name and account are not sent.","<b>Payments:</b> the lesson, the amount and the status of each payment. Card details are entered on Stripe's page and never reach SeastackSchool. Teachers who connect Stripe give their payout details to Stripe, not to us.","<b>Teachers:</b> a profile photo, if you add one."]],
    ["Visits",["We record the page opened, the website the visit came from, the country, whether a phone or a computer was used, and the time. We do not use cookies for this and do not store IP addresses or names. Your choice of time zone and an affiliate code, if you arrived through one, are kept in your own browser."]],
    ["Who can see what",["Public: an approved teacher's profile, classes and ratings, and an approved school's page. A rating shows the reviewer's first name only.","A teacher sees the name on each booking in their classes (a child's first name, or a student's own name) and what you chose to tell teachers: a student's level, country, languages, what they want to learn, what they wrote about themselves and their note; for a child, the parent's name, country and languages, what the parent wants the child to learn, and the child's school grade and note. A teacher does not see your email, your city or your other bookings. A school sees the names on its teachers' bookings.","Student, parent and affiliate profiles are not public.","A message is seen by the two people in the conversation. SeastackSchool staff can read messages when needed for safety. If the teacher belongs to a school, that school can read the messages sent since the teacher joined it.","A teacher's profile photo is public once the teacher is approved.","Lesson links and in-person addresses are shown only to people who booked that class.","Identity documents and school documents can be opened only by the account that uploaded them and by SeastackSchool. A school can open the qualification documents of its own teachers, but not their identity documents.","Affiliates see how many people signed up through their link, never their names or emails.","SeastackSchool staff who manage the site can see account emails, bookings, reports and messages in order to run it."]],
    ["Who we share it with",["We do not sell personal information. The site relies on service providers that store or carry data for us: a database and sign-in provider, a website host, and an email provider. They may only use the data to provide those services."]],
    ["Emails",["We email you to confirm your address, to reset your password, and about your bookings."]],
    ["How long we keep it",["We keep your information while your account exists. Documents stay until you remove them. To delete your account and its data, write to us from the Help page; some records may be kept where the law requires it."]],
    ["Children",["Children under 13 use SeastackSchool only through a parent's account. A parent can remove a child from their account at any time."]],
    ["Your choices",["You can edit your profile, remove children, remove documents and cancel bookings from your account. For anything else, including a copy of your data or a correction, write to us from the Help page."]]
  ]);
}

/* ---------- ratings: real reviews for real teachers, from people who have had a lesson ---------- */
const baseReviewsFor = reviewsFor;
reviewsFor = function(tid){
  const t=teacher(tid);
  if(!t || !t.real) return baseReviewsFor(tid);
  return A.reviews.filter(r=>r.teacher_id===tid && !r.hidden).map(r=>({t:tid, name:r.author, stars:r.stars, text:r.body}));
};
function realReviewBox(tid){
  const t=teacher(tid), first=esc((t.name||"this teacher").split(" ")[0]), p=s=>`<p class="muted small" style="margin:0">${s}</p>`;
  if(!A.user) return p(`Only students and parents who have finished a lesson with ${first} can rate them. <a href="#/account">Sign in</a>`);
  if(!A.learner) return p(`Only students and parents who have finished a lesson with ${first} can rate them.`);
  // the lesson must have finished, the same rule the database enforces
  const had=A.bookings.some(b=>{ const c=cls(b.class_id); return b.learner_id===A.user.id && b.status==="booked" && b.attendance!=="no_show" && c && c.t===tid && Date.parse(b.starts_at)+c.mins*6e4<=Date.now() });
  if(!had) return p(`You can rate ${first} after you've attended and finished a lesson with them.`);
  const mine=A.reviews.find(r=>r.teacher_id===tid && r.learner_id===A.user.id);
  return `<form id="revf" novalidate onsubmit="event.preventDefault();submitReview('${tid}',this)">
    <label class="field">Your rating<select name="stars" id="rv-stars">${[5,4,3,2,1].map(n=>`<option value="${n}" ${mine&&mine.stars===n?"selected":""}>${n} ${n===1?"star":"stars"}</option>`).join("")}</select></label>
    <label class="field" style="margin-top:8px">Your review (optional)<textarea name="text" id="rv-text" rows="3" maxlength="1000">${esc(mine?mine.body:"")}</textarea></label>
    <button class="btn sm" style="margin-top:10px">${mine?"Update my review":"Post review"}</button>
    ${mine&&mine.hidden?`<p class="small muted" style="margin:8px 0 0">Your review is currently hidden by SeastackSchool.</p>`:""}</form>`;
}
async function submitReview(tid,f){
  const r = await sb.rpc("submit_review",{p_teacher_id:tid,p_stars:+f.stars.value,p_body:f.text.value.trim()});
  if(r.error) return toast(r.error.message);
  await loadPublic(); toast("Review saved"); render();
}
function adminReviews(){
  const rows=A.rrows||[];
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Ratings left by students and parents who have had a lesson with the teacher. Hide a review to remove it from the teacher's page and rating; you can show it again at any time. A school can also hide or show reviews of its own teachers, but once you decide on a review, your decision is final. Teachers cannot change their own ratings.</p>
    ${rows.length?`<div class="scroll"><table class="admin" style="min-width:760px"><thead><tr><th>Teacher</th><th>Rating</th><th>Review</th><th>From</th><th>Date</th><th>Action</th></tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td><b>${esc(r.teacher_name||"(no name)")}</b>${r.school_name?`<div class="small muted">${esc(r.school_name)}</div>`:""}</td>
      <td><span class="stars">${starStr(r.stars)}</span></td>
      <td class="small" style="max-width:320px">${esc(r.body||"(no text)")}</td>
      <td class="small">${esc(r.author)}<div>${esc(r.learner_email)}</div></td>
      <td class="small">${new Date(r.updated_at).toLocaleDateString()}</td>
      <td>${r.hidden?`<span class="tag bad">Hidden</span>${r.changed_by_kind==="school"?`<div class="small muted">by the school</div>`:r.changed_by_kind==="admin"?`<div class="small muted">by you</div>`:""}<div class="acts"><button class="btn sm" onclick="setReviewHidden('${r.id}',false)">Show again</button></div>`:`<button class="btn sm ghost" onclick="setReviewHidden('${r.id}',true)">Hide</button>`}</td>
    </tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">No reviews yet. They appear here once students and parents rate a teacher after a lesson.</div>`}
  </div>`;
}
async function setReviewHidden(id,hidden){
  const r = await sb.rpc("admin_set_review_hidden",{p_review_id:id,p_hidden:hidden});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); await loadPublic(); toast(hidden?"Review hidden":"Review shown again"); render();
}

/* ---------- schools: a school account, its documents, its teachers, its public page ---------- */
const DOCS = () => sb.storage.from("school-docs");
function schoolTag(t){
  const s = t && t.school && A.schools.find(x=>x.id===t.school);
  return s ? ` · <a href="#/school/${s.id}">${esc(s.name)}</a>` : "";
}
async function listDocs(folder, bucket="school-docs", ttl=3600){
  const l = await sb.storage.from(bucket).list(folder, {limit:50, sortBy:{column:"created_at", order:"asc"}});
  const files = (l.data||[]).filter(f=>f.name && f.id);
  if(!files.length) return [];
  const paths = files.map(f=>folder+"/"+f.name);
  const s = await sb.storage.from(bucket).createSignedUrls(paths, ttl);
  return files.map((f,i)=>({name:f.name.replace(/^\d+-/,""), path:paths[i], url:(s.data||[])[i]?.signedUrl || ""}));
}
async function loadSchoolExtras(){
  const m = await sb.from("teachers").select("*").eq("school_id", A.user.id).order("created_at");
  A.members = m.data || [];
  const ids = A.members.map(x=>x.id);
  A.mclasses = ids.length ? ((await sb.from("classes").select("*").in("teacher_id", ids)).data || []) : [];
  A.mreviews = ids.length ? ((await sb.from("reviews").select("*").in("teacher_id", ids).order("updated_at",{ascending:false})).data || []) : [];
  A.docs = await listDocs(A.user.id);
  A.mquals = ids.length ? ((await sb.from("teacher_qualifications").select("*").in("teacher_id", ids).order("created_at")).data || []) : [];
  const sm = await sb.rpc("school_list_messages"); A.smsgs = sm.error ? [] : (sm.data || []);
}
async function schoolReviewAction(id, hidden){
  const r = await sb.rpc("school_set_review_hidden",{p_review_id:id,p_hidden:hidden});
  if(r.error) return toast(r.error.message);
  await loadSchoolExtras(); await loadPublic(); toast(hidden?"Review hidden":"Review shown again"); render();
}
function schoolDash(){
  if(!sb) return `<div class="wrap page"><h2>My school</h2><div class="notice">Accounts can't be reached right now. Check your connection and reload the page.</div></div>`;
  if(A.recovery) return newPasswordPage();
  if(!A.user){ kindFor("myschool","school"); return authPage() }
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.school) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">My school</h2>${who}</div>
    <div class="notice">This page is for school accounts. To register a school, create a separate school account with a different email.</div></div>`;
  const s=A.school, p=A.schoolPriv||{contact_name:"",reviewer_note:"",join_code:""}, link=SITE_BASE+"?school="+p.join_code+"#/studio", now=Date.now();
  const cids=new Set(A.mclasses.map(c=>c.id)), up=A.bookings.filter(b=>cids.has(b.class_id) && b.status==="booked" && Date.parse(b.starts_at)>now);
  const pill=t=>`<span class="tag ${t.status==="approved"?"ok":t.status==="suspended"?"bad":"group"}">${t.status==="approved"?"Public":t.status==="suspended"?"Suspended":"Waiting for you"}</span>`;
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">${esc(s.name||"My school")}</h2>${who}</div>
    ${s.status==="approved"?`<div class="ok" style="margin:12px 0">Your school is approved${s.reviewed_at?`; documents reviewed on ${new Date(s.reviewed_at).toLocaleDateString()}`:""}. <a href="#/school/${s.id}">See your school's page</a></div>`
      :s.status==="suspended"?`<div class="notice bad">Your school is suspended, so its page and the teachers it approved are hidden. Contact support from the Help page.</div>`
      :`<div class="notice">Your school is waiting for review. Fill in the details below and upload your documents. Nothing is public until SeastackSchool has reviewed them.</div>`}
    <div class="cols"><div>
      <form class="box row" id="schoolf" novalidate onsubmit="event.preventDefault();saveSchool(this)">
        <h3 style="grid-column:1/-1;margin:0">School details</h3>
        <label class="field" style="grid-column:1/-1">School name<input name="name" id="sc-name" maxlength="140" value="${esc(s.name)}"></label>
        <label class="field">Country<input name="country" id="sc-country" maxlength="80" value="${esc(s.country)}"></label>
        <label class="field">City<input name="city" id="sc-city" maxlength="120" value="${esc(s.city)}"></label>
        <label class="field">Kind of school<input name="school_type" id="sc-type" maxlength="80" value="${esc(s.school_type||"")}" placeholder="e.g. Language school, primary school"></label>
        <label class="field">Year founded<input name="founded_year" id="sc-year" type="number" min="1000" max="2100" value="${s.founded_year||""}"></label>
        <label class="field" style="grid-column:1/-1">Registration and accreditation (who registered, licensed or accredited the school; shown on your public page)<textarea name="accreditation" id="sc-accr" rows="2" maxlength="1000">${esc(s.accreditation||"")}</textarea></label>
        <label class="field" style="grid-column:1/-1">Website (optional)<input name="website" id="sc-web" maxlength="300" value="${esc(s.website)}" placeholder="https://"></label>
        <label class="field" style="grid-column:1/-1">About the school (shown on your public page)<textarea name="about" id="sc-about" rows="4" maxlength="3000">${esc(s.about)}</textarea></label>
        <label class="field" style="grid-column:1/-1">Contact person (not public)<input name="contact_name" id="sc-contact" maxlength="120" value="${esc(p.contact_name)}"></label>
        <label class="field" style="grid-column:1/-1">Note to the reviewer about your documents (not public)<textarea name="reviewer_note" id="sc-note" rows="2" maxlength="2000">${esc(p.reviewer_note)}</textarea></label>
        <button class="btn" style="grid-column:1/-1;justify-self:start">Save details</button>
      </form>
      <div class="box"><h3>Documents</h3>
        <p class="muted small">Upload the documents that show your school is registered or licensed. Only you and SeastackSchool can open them; they are never shown to visitors.</p>
        ${A.docs.length?A.docs.map((d,i)=>`<div class="lesson"><span style="overflow-wrap:anywhere">${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a>`:esc(d.name)}</span><button class="btn ghost sm" onclick="dropDoc(${i})">${A.removingDoc===d.path?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No documents uploaded yet.</div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><input type="file" id="docfile" accept=".pdf,.jpg,.jpeg,.png" aria-label="Choose a document"><button class="btn sm" id="docbtn" onclick="uploadDoc()">Upload</button></div>
        <p class="small muted" style="margin:8px 0 0">PDF, JPG or PNG, up to 10 MB each, up to 10 files.</p></div>
      ${accountSettings()}
    </div><div>
      <div class="box"><h3>Your teachers</h3>
        <p class="muted small">Send teachers this link. They create a teacher account through it and appear here for you to approve. ${s.status==="approved"?"":"You can approve them once your school is approved."}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="reflink" readonly value="${esc(link)}" aria-label="Invitation link for teachers" style="flex:1;min-width:200px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn sm" onclick="copyRef()">Copy link</button></div>
        <p class="small muted" style="margin:8px 0 12px">School code: <b>${esc(p.join_code)}</b>. A teacher who already has an account can enter it in their teacher studio.</p>
        ${A.members.length?A.members.map(t=>`<div class="lesson"><div><b>${esc(t.full_name||"(no name yet)")}</b> ${pill(t)}<div class="small muted">${(n=>n+" "+(n===1?"class":"classes"))(A.mclasses.filter(c=>c.teacher_id===t.id).length)}${t.city?" · "+esc(t.city):""}</div>${schoolQuals(t.id)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${t.status==="pending" && s.status==="approved"?`<button class="btn sm" onclick="memberAction('${t.id}','approve')">Approve</button>`:""}<button class="btn ghost sm" onclick="memberAction('${t.id}','remove')">${A.removingMember===t.id?"Confirm remove":"Remove"}</button></div></div>`).join("")
        :`<div class="empty">No teachers have joined yet.</div>`}</div>
      ${schoolClassesBox()}${schoolPayBox()}${schoolEarnings()}
      <div class="box"><h3>Upcoming bookings</h3>
        ${up.length?up.map(b=>{ const c=A.mclasses.find(x=>x.id===b.class_id), t=A.members.find(x=>x.id===c.teacher_id), w=new Date(b.starts_at); return `<div class="lesson"><div><b>${esc(c.title)}</b><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · ${esc(t?t.full_name:"")} · for ${esc(b.attendee_name)}</div></div></div>` }).join("")
        :`<p class="muted" style="margin:0">No upcoming bookings in your teachers' classes yet.</p>`}</div>
      ${schoolMsgsBox()}
      <div class="box"><h3>Ratings of your teachers</h3>
        <p class="muted small">Only families who have finished a lesson can rate a teacher. As the school's admin you can hide a rating or show it again; teachers cannot. SeastackSchool can overrule your choice, and then it is final.</p>
        ${A.mreviews.length?A.mreviews.map(v=>{ const t=A.members.find(x=>x.id===v.teacher_id); return `<div class="lesson"><div><span class="stars">${starStr(v.stars)}</span> <b>${esc(t?t.full_name:"")}</b>${v.hidden?` <span class="tag bad">Not shown</span>`:""}
          ${v.body?`<div class="small" style="margin-top:4px">${esc(v.body)}</div>`:""}<div class="small muted">${esc(v.author)} · ${new Date(v.updated_at).toLocaleDateString()}</div></div>
          ${v.admin_locked?`<span class="small muted">Decided by SeastackSchool</span>`:`<button class="btn ghost sm" onclick="schoolReviewAction('${v.id}',${!v.hidden})">${v.hidden?"Show again":"Hide"}</button>`}</div>` }).join("")
        :`<p class="muted" style="margin:0">No ratings yet.</p>`}</div>
    </div></div>
  </div>`;
}
async function saveSchool(f){
  const name=f.name.value.trim(); let web=f.website.value.trim();
  if(!name) return toast("Enter your school's name");
  if(web && !/^https?:\/\//i.test(web)) web="https://"+web;
  if(web && !/^https?:\/\/\S+$/.test(web)) return toast("The website address doesn't look right");
  const yr=+f.founded_year.value||null;
  if(yr && !(yr>=1000 && yr<=new Date().getFullYear())) return toast("Check the year the school was founded");
  const a = await sb.from("schools").update({name,country:f.country.value.trim(),city:f.city.value.trim(),website:web,about:f.about.value.trim(),school_type:f.school_type.value.trim(),founded_year:yr,accreditation:f.accreditation.value.trim()}).eq("id",A.user.id).select().maybeSingle();
  if(a.error || !a.data) return toast(a.error?.message || "Your school details could not be saved");
  const b = await sb.from("school_private").update({contact_name:f.contact_name.value.trim(),reviewer_note:f.reviewer_note.value.trim()}).eq("id",A.user.id).select().maybeSingle();
  if(b.error) return toast(b.error.message);
  A.school=a.data; if(b.data) A.schoolPriv=b.data; await loadPublic(); toast("School details saved"); render();
}
async function uploadDoc(){
  const file=$("#docfile").files[0], btn=$("#docbtn");
  if(!file) return toast("Choose a file first");
  if(A.docs.length>=10) return toast("You can upload up to 10 documents. Remove one first.");
  if(file.size>10*1024*1024) return toast("That file is larger than 10 MB");
  if(!["application/pdf","image/jpeg","image/png"].includes(file.type)) return toast("Upload a PDF, JPG or PNG file");
  btn.disabled=true; btn.textContent="Uploading…";
  const path=A.user.id+"/"+Date.now()+"-"+file.name.replace(/[^A-Za-z0-9._-]/g,"_").slice(-80);
  const r = await DOCS().upload(path, file, {contentType:file.type});
  if(r.error){ toast(r.error.message); render(); return }
  A.docs = await listDocs(A.user.id); toast("Document uploaded"); render();
}
async function dropDoc(i){
  const d=A.docs[i]; if(!d) return;
  if(A.removingDoc!==d.path){ A.removingDoc=d.path; render(); return }
  A.removingDoc=null;
  const r = await DOCS().remove([d.path]);
  if(r.error) return toast(r.error.message);
  A.docs = await listDocs(A.user.id); toast("Document removed"); render();
}
async function memberAction(id, action){
  if(action==="remove" && A.removingMember!==id){ A.removingMember=id; render(); return }
  A.removingMember=null;
  const r = await sb.rpc("school_set_member",{p_teacher_id:id,p_action:action});
  if(r.error){ toast(r.error.message); render(); return }
  await loadSchoolExtras(); await loadPublic(); toast(action==="approve"?"Teacher approved":"Teacher removed from your school"); render();
}
// Shown in the teacher studio: which school the teacher belongs to, or a box to join one.
function teacherSchoolBox(){
  const t=A.teacher;
  if(t.school_id) return `<div class="box" style="margin:12px 0"><div class="results-head" style="margin:0"><span>School: <b>${esc(A.mySchool?A.mySchool.name||"(unnamed school)":"your school")}</b>${A.mySchool&&A.mySchool.status!=="approved"?` <span class="small muted">(the school itself is still being reviewed)</span>`:""}</span>
      <button class="btn ghost sm" onclick="leaveSchool()">${A.leaving?"Confirm leave":"Leave this school"}</button></div></div>`;
  return `<details style="margin:12px 0"><summary>Join a school</summary>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="sch-code" maxlength="12" placeholder="School code" aria-label="School code" value="${esc(schoolCodeFromLink())}" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn sm" onclick="joinSchool()">Join</button></div>
    <p class="small muted" style="margin:8px 0 0">If a school invited you, enter its code. The school then approves you, and your classes appear under its name.</p></details>`;
}
async function joinSchool(){
  const code=($("#sch-code")?.value||"").trim();
  if(!code) return toast("Enter the school code");
  const r = await sb.rpc("join_school",{p_code:code});
  if(r.error) return toast(r.error.message);
  try{ sessionStorage.removeItem("ss:school") }catch(e){}
  await loadMe(); toast("You joined "+(r.data||"the school")); render();
}
async function leaveSchool(){
  if(!A.leaving){ A.leaving=true; render(); return }
  A.leaving=false;
  const r = await sb.rpc("leave_school");
  if(r.error){ toast(r.error.message); render(); return }
  await loadMe(); await loadPublic(); toast("You left the school"); render();
}
// Public pages inside the app.
function schoolsList(){
  return `<div class="wrap page"><h2>Schools</h2>
    <p class="muted">Schools on SeastackSchool have had their documents reviewed before their page and teachers went public.</p>
    ${A.schools.length?`<div class="grid2">${A.schools.map(s=>{ const n=TEACHERS.filter(t=>t.school===s.id).length; return `<a class="res" href="#/school/${s.id}" style="text-decoration:none;color:inherit"><b>${esc(s.name)}</b><span class="small muted">${esc([s.city,s.country].filter(Boolean).join(", "))}</span><span class="small">${n} ${n===1?"teacher":"teachers"}</span></a>` }).join("")}</div>`
    :`<div class="empty"><h3>No schools are listed yet</h3><p class="muted">If you run a school, you can register it and list your teachers and classes.</p><a class="btn" href="#/account" onclick="A.mode='signup';A.kind='school';A.err='';A.msg='';setTimeout(render,0)">Register a school</a></div>`}
  </div>`;
}
function schoolPage(id){
  const s=A.schools.find(x=>x.id===id);
  if(!s) return `<div class="wrap page"><h2>School not found</h2><p class="muted">This school is not listed, or its page is still loading.</p><a href="#/schools">See all schools</a></div>`;
  const ts=TEACHERS.filter(t=>t.school===s.id), cs=allClasses().filter(c=>ts.some(t=>t.id===c.t));
  return `<div class="wrap profile">
    <div class="profile-head"><div class="avatar lg" style="background:#eee9fb" aria-hidden="true">${esc(initials(s.name||"S"))}</div>
      <div><h2 style="margin:0">${esc(s.name)}</h2>
        ${s.school_type||s.founded_year?`<div><b>${esc([s.school_type, s.founded_year?"founded "+s.founded_year:""].filter(Boolean).join(", "))}</b></div>`:""}
        <div class="muted">${esc([s.city,s.country].filter(Boolean).join(", "))}${s.website?` · <a href="${esc(s.website)}" target="_blank" rel="noopener noreferrer">Website</a>`:""}</div>
        <div class="small muted">Documents reviewed by SeastackSchool${s.reviewed_at?" on "+new Date(s.reviewed_at).toLocaleDateString():""}</div></div></div>
    <div class="cols"><div>
      ${s.about?`<div class="box"><h3>About the school</h3><p style="margin:0;white-space:pre-line">${esc(s.about)}</p></div>`:""}
      ${s.accreditation?`<div class="box"><h3>Registration and accreditation</h3><p style="margin:0 0 8px;white-space:pre-line">${esc(s.accreditation)}</p><p class="small muted" style="margin:0">Stated by the school. SeastackSchool has reviewed the school's documents; that is not accreditation by any authority.</p></div>`:""}
      <h3>Classes</h3>${cs.length?`<div class="list">${cs.map(card).join("")}</div>`:`<div class="empty">No classes listed yet.</div>`}
    </div><div>
      <div class="box"><h3>Teachers</h3>${ts.length?ts.map(t=>`<div class="review"><a href="#/teacher/${t.id}"><b>${esc(t.name)}</b></a>${rankTag(t)}${t.headline?`<div class="small">${esc(t.headline)}</div>`:""}<div class="small muted">${esc(t.langs.join(", "))}</div></div>`).join(""):`<p class="muted" style="margin:0">No teachers listed yet.</p>`}</div>
    </div></div>
  </div>`;
}
// Admin: review schools and their documents.
function adminSchools(){
  const rows=A.srows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.sfilter==="all"?rows:rows.filter(r=>r.status===A.sfilter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.sfilter===k}" onclick="A.sfilter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setSchoolStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">${A.boss?"":"Approving or restoring a school is the admin boss's decision: open the documents, write what you found in the note, and ask. You can suspend a school yourself to protect families. "}Open each school's documents before approving it. An approved school gets a public page and can approve its own teachers. Suspending a school hides its page and the teachers it approved; restoring it brings them back.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for review ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:900px"><thead><tr><th>School</th><th>Details</th><th>Documents</th><th>Teachers</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>{ const docs=A.sdocs[r.id]; return `<tr>
      <td><b>${esc(r.name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}
        <div class="small muted">Contact: ${esc(r.contact_name||"(none)")}</div><div class="small muted">${esc([r.city,r.country].filter(Boolean).join(", ")||"(no location yet)")}</div>
        ${r.website?`<div class="small"><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer">Website</a></div>`:""}</td>
      <td class="small"><details style="padding:6px 10px"><summary class="small">Read</summary><p style="margin:6px 0"><b>About</b><br>${esc(r.about||"(empty)")}</p><p style="margin:6px 0"><b>Kind and year founded</b><br>${esc([r.school_type,r.founded_year].filter(Boolean).join(", ")||"(empty)")}</p><p style="margin:6px 0"><b>Registration and accreditation</b><br>${esc(r.accreditation||"(empty)")}</p><p style="margin:6px 0"><b>Note to reviewer</b><br>${esc(r.reviewer_note||"(empty)")}</p></details></td>
      <td class="small">${docs?(docs.length?docs.map(d=>d.url?`<div style="overflow-wrap:anywhere"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a></div>`:`<div>${esc(d.name)}</div>`).join(""):"No documents uploaded"):`${whyBox("s-"+r.id)}<button class="btn sm ghost" style="margin-top:4px" onclick="showSchoolDocs('${r.id}')">Show documents</button>`}</td>
      <td>${r.teachers} <span class="small muted">(${r.teachers_public} public)</span></td>
      <td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${pill(r.status)}${r.reviewed_at?`<div class="small muted" style="margin-top:4px">Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}</div>`:""}${r.last_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(r.last_note)}</div>`:""}</td>
      <td><input id="snote-${r.id}" aria-label="Note for ${esc(r.name)}" placeholder="Note (optional)" maxlength="1000">
        <div class="acts">${(ok=>r.status==="approved"?act(r.id,"suspended","Suspend",true):r.status==="suspended"?ok("Restore"):ok("Approve")+act(r.id,"suspended","Suspend",true))(l=>A.boss?act(r.id,"approved",l):reqWaiting("school_approve",r.id)?`<span class="tag group">Waiting for the admin boss</span>`:`<button class="btn sm" onclick="sendRequest('school_approve','${r.id}','snote-${r.id}')">Ask the boss to ${l.toLowerCase()}</button>`)}</div></td>
    </tr>` }).join("")}</tbody></table></div>`
    :`<div class="empty">${rows.length?"No schools in this list.":"No school has registered yet."}</div>`}
  </div>`;
}
async function showSchoolDocs(id){
  if(!(await staffOpenDocs("school-docs", id, "s-"+id))) return;
  A.sdocs[id] = await listDocs(id, "school-docs", 600); render();
}
async function setSchoolStatus(id,status){
  const note=$("#snote-"+id)?.value.trim()||null;
  const r = await sb.rpc("admin_set_school_status",{p_school_id:id,p_status:status,p_note:note});
  if(r.error) return toast(r.error.message);
  const keep=A.sdocs; await loadAdmin(); A.sdocs=keep; await loadPublic();
  toast(status==="approved"?"School approved":"School suspended"); render();
}

/* ---------- affiliates: referral link, tier ladder, referrals (modelled on Seastack Book's program) ---------- */
function partnerPage(){
  if(!sb) return `<div class="wrap page"><h2>Affiliate dashboard</h2><div class="notice">Accounts can't be reached right now. Check your connection and reload the page.</div></div>`;
  if(A.recovery) return newPasswordPage();
  if(!A.user){ kindFor("partner","affiliate"); return authPage() }
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.aff) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">Affiliate dashboard</h2>${who}</div>
    <div class="notice">This page is for affiliate accounts. To become an affiliate, create a separate affiliate account with a different email.</div></div>`;
  const a=A.aff, d=A.adash || {active:0,signups:0,clicks_30d:0,clicks_all:0,referrals:[],level2:0,level3:0,settings:{tiers:[],l2_rate:5,l3_rate:3,window_days:90}};
  const tiers=d.settings.tiers, cur=tiers.slice().reverse().find(t=>d.active>=t.min) || tiers[0], next=tiers.find(t=>t.min>d.active);
  const link=SITE_BASE+"?ref="+a.code, kinds={teacher:"Teacher",student:"Student",parent:"Parent"};
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">Affiliate dashboard</h2>${who}</div>
    ${a.status==="pending"?`<div class="notice">Your affiliate account is waiting for approval. Your link starts counting once you're approved.</div>`
      :a.status==="suspended"?`<div class="notice bad">Your affiliate account is suspended, so your link is not counting. Contact support from the Help page.</div>`:""}
    <div class="cols"><div>
      <div class="box"><h3>Your referral link</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="reflink" readonly value="${esc(link)}" aria-label="Your referral link" style="flex:1;min-width:220px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn sm" onclick="copyRef()">Copy link</button></div>
        <p class="small muted" style="margin:10px 0 0">Your code is <b>${esc(a.code)}</b>. Anyone who opens this link and signs up as a teacher, student or parent within ${d.settings.window_days} days counts as your referral. The first link a person opens is the one that counts. You can add <b>?ref=${esc(a.code)}</b> to the address of any page on the site.</p>
        <p class="small muted" style="margin:8px 0 0">Someone who becomes an affiliate through your link joins your second level.</p></div>
      <form class="box row" id="afff" novalidate onsubmit="event.preventDefault();saveAffiliate(this)">
        <h3 style="grid-column:1/-1;margin:0">Your profile</h3>
        <label class="field">Full name<input name="full_name" id="af-name" maxlength="120" value="${esc(a.full_name)}"></label>
        <label class="field">Country<input name="country" id="af-country" maxlength="80" value="${esc(a.country||"")}"></label>
        <label class="field" style="grid-column:1/-1">Website or social page (optional)<input name="website" id="af-web" maxlength="300" value="${esc(a.website||"")}" placeholder="https://"></label>
        <label class="field" style="grid-column:1/-1">How you tell people about SeastackSchool<textarea name="pitch" id="af-pitch" rows="2" maxlength="600">${esc(a.pitch||"")}</textarea></label>
        <p class="small muted" style="grid-column:1/-1;margin:0">Only you and SeastackSchool see this.</p>
        <button class="btn sm" style="grid-column:1/-1;justify-self:start">Save profile</button>
      </form>
      <div class="box"><h3>Your referrals</h3>
        ${d.referrals.length?`<div class="scroll"><table style="min-width:360px"><thead><tr><th>Type</th><th>Signed up</th><th>Status</th></tr></thead><tbody>
        ${d.referrals.map(r=>`<tr><td>${kinds[r.kind]||"Account"}</td><td>${r.joined_at?new Date(r.joined_at).toLocaleDateString():""}</td><td><span class="tag ${r.active?"ok":"group"}">${r.active?"Active":"Signed up"}</span></td></tr>`).join("")}</tbody></table></div>`
        :`<p class="muted" style="margin:0">No one has signed up through your link yet.</p>`}
        <p class="small muted" style="margin:10px 0 0">A referral is active once a teacher is approved and has listed a class, or a student or parent has booked a lesson. Names are not shown, to protect families' privacy.</p></div>
      ${accountSettings()}
    </div><div>
      <div class="box"><h3>Your numbers</h3>
        <table style="min-width:0"><tbody>
          <tr><td>Link opens, last 30 days</td><td style="text-align:right"><b>${d.clicks_30d}</b></td></tr>
          <tr><td>Link opens, all time</td><td style="text-align:right"><b>${d.clicks_all}</b></td></tr>
          <tr><td>Sign-ups</td><td style="text-align:right"><b>${d.signups}</b></td></tr>
          <tr><td>Active referrals</td><td style="text-align:right"><b>${d.active}</b></td></tr>
          <tr><td>Affiliates on your second level</td><td style="text-align:right"><b>${d.level2}</b></td></tr>
          <tr><td>Affiliates on your third level</td><td style="text-align:right"><b>${d.level3}</b></td></tr>
        </tbody></table></div>
      <div class="box"><h3>Your tier: ${esc(cur?cur.name:"Starter")}</h3>
        <table style="min-width:0"><thead><tr><th>Tier</th><th>Active referrals</th><th>Commission</th></tr></thead><tbody>
        ${tiers.map(t=>`<tr><td>${t===cur?`<b>${esc(t.name)}</b> <span class="tag ok">You</span>`:esc(t.name)}</td><td>${t.min}${t===tiers[tiers.length-1]?"+":""}</td><td>${d.settings.rates_public?t.rate+"%":"To be confirmed"}</td></tr>`).join("")}</tbody></table>
        <p class="small" style="margin:10px 0 0">${next?`${next.min-d.active} more active ${next.min-d.active===1?"referral":"referrals"} to reach ${esc(next.name)}${d.settings.rates_public?" ("+next.rate+"%)":""}.`:"You are on the top tier."}</p>
        ${d.settings.rates_public?`<p class="small muted" style="margin:8px 0 0">Second level ${d.settings.l2_rate}%, third level ${d.settings.l3_rate}%.</p>`:""}
        <p class="small muted" style="margin:8px 0 0">Commission is a share of what SeastackSchool collects from the accounts you refer. ${d.settings.rates_public?"These are the planned rates.":"The commission rates will be confirmed before online payment opens."} Online payment is not open yet, so nothing is earned or paid yet. Earned so far: <b>$0</b>.</p></div>
    </div></div>
  </div>`;
}
function copyRef(){
  const el=$("#reflink");
  const fallback=()=>{ el.focus(); el.select(); toast("Link selected. Copy it with Ctrl+C or the Copy menu.") };
  if(navigator.clipboard) navigator.clipboard.writeText(el.value).then(()=>toast("Link copied"), fallback); else fallback();
}
function adminAffiliates(){
  const rows=A.arows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.afilter==="all"?rows:rows.filter(r=>r.status===A.afilter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.afilter===k}" onclick="A.afilter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setAffiliateStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Affiliates share a personal link and are credited with the teachers, students and parents who sign up through it. A link only counts once you approve the affiliate. No commission is calculated yet, because online payment is not open.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for approval ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:860px"><thead><tr><th>Affiliate</th><th>How they will promote</th><th>Link opens</th><th>Sign-ups</th><th>Active</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}
        <div class="small muted">Code ${esc(r.code)}${r.recruited_by_code?` · brought in by ${esc(r.recruited_by_code)}`:""}</div></td>
      <td class="small">${esc(r.pitch||"(nothing written)")}${r.country?`<div class="muted" style="margin-top:4px">${esc(r.country)}</div>`:""}${r.website?`<div style="margin-top:4px;overflow-wrap:anywhere"><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer">${esc(r.website)}</a></div>`:""}</td>
      <td>${r.clicks}</td><td>${r.signups}</td><td>${r.active}</td>
      <td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${pill(r.status)}${r.last_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(r.last_note)}</div>`:""}</td>
      <td><input id="anote-${r.id}" aria-label="Note for ${esc(r.full_name)}" placeholder="Note (optional)" maxlength="1000">
        <div class="acts">${r.status==="approved"?act(r.id,"suspended","Suspend",true):r.status==="suspended"?act(r.id,"approved","Restore"):act(r.id,"approved","Approve")+act(r.id,"suspended","Suspend",true)}</div></td>
    </tr>`).join("")}</tbody></table></div>`
    :`<div class="empty">${rows.length?"No affiliates in this list.":"No one has applied to be an affiliate yet."}</div>`}
  </div>`;
}
async function setAffiliateStatus(id,status){
  const note=$("#anote-"+id)?.value.trim()||null;
  const r = await sb.rpc("admin_set_affiliate_status",{p_affiliate_id:id,p_status:status,p_note:note});
  if(r.error) return toast(r.error.message);
  await loadAdmin(); toast(status==="approved"?"Affiliate approved":"Affiliate suspended"); render();
}

/* ---------- visits: where people come from and when (no cookies, no IP addresses) ---------- */
const ROUTES = ["classes","learning","studio","help","teacher","account","admin","partner","schools","school","myschool","terms","privacy"];
const PAGE_NAMES = {"/":"Home","/classes":"Find classes","/learning":"My lessons","/studio":"Teacher studio","/help":"Help","/teacher":"A teacher's profile","/account":"Sign in / my account","/admin":"Manage accounts","/partner":"Affiliate dashboard","/schools":"Schools","/school":"A school's page","/myschool":"School dashboard","/terms":"Terms of Use","/privacy":"Privacy Policy"};
let lastTracked = null, memSid = null;
function trackVisit(r){
  if(!sb || !A.ready || A.staffer) return;          // the admin's own visits are not counted
  const path = "/" + (ROUTES.includes(r) ? r : "");
  if(path===lastTracked) return;
  lastTracked = path;
  let sid = null, landing = false;
  try{
    sid = sessionStorage.getItem("ss:sid");
    if(!sid){ sid = uid()+uid()+uid(); sessionStorage.setItem("ss:sid", sid); landing = true }
  }catch(e){ landing = !memSid; sid = memSid || (memSid = uid()+uid()+uid()) }
  const args = {p_session:sid, p_landing:landing, p_path:path};
  if(landing){
    let ref = "";
    try{ const u = new URL(document.referrer); if(u.host!==location.host) ref = u.host.replace(/^www\./,"") }catch(e){}
    const q = new URLSearchParams(location.search);
    args.p_referrer = ref || null; args.p_source = q.get("utm_source"); args.p_medium = q.get("utm_medium"); args.p_campaign = q.get("utm_campaign");
  }
  sb.rpc("log_visit", args).then(()=>{}, ()=>{});
}
async function loadVisits(){
  A.vloading = true;
  const r = await sb.rpc("admin_visit_stats", {p_days:A.vdays, p_tz:TZ});
  A.vloading = false;
  A.visits = r.error ? {error:r.error.message} : r.data;
  render();
}
function adminVisits(){
  if(!A.visits){ if(!A.vloading) loadVisits(); return `<div class="wrap page">${adminHead()}<p class="muted">Loading visits…</p></div>` }
  const v = A.visits;
  if(v.error) return `<div class="wrap page">${adminHead()}<div class="notice bad">The visit numbers could not be loaded: ${esc(v.error)}</div><button class="btn sm" onclick="A.visits=null;render()">Try again</button></div>`;
  const chip = (d,l) => `<button class="chip" aria-pressed="${A.vdays===d}" onclick="A.vdays=${d};A.visits=null;render()">${l}</button>`;
  const max = Math.max(1, ...v.by_day.map(d=>d.visits));
  const country = c => { if(!c || c==="??") return "Unknown"; try{ return new Intl.DisplayNames(undefined,{type:"region"}).of(c) || c }catch(e){ return c } };
  const cap = s => s ? s[0].toUpperCase()+s.slice(1) : "Unknown";
  const list = (title,rows,key,fmt) => `<div class="box" style="margin:0"><h3>${title}</h3>${rows.length?`<table style="min-width:0"><tbody>${rows.map(r=>`<tr><td>${esc(fmt?fmt(r.name):r.name)}</td><td style="text-align:right;font-variant-numeric:tabular-nums"><b>${r[key]}</b></td></tr>`).join("")}</tbody></table>`:`<p class="muted small" style="margin:0">Nothing yet.</p>`}</div>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Where visitors come from and when. A visit is one browser tab session. Your own admin visits are not counted. No cookies, names or IP addresses are stored.</p>
    <div class="chips" style="margin-bottom:14px">${chip(7,"Last 7 days")}${chip(30,"Last 30 days")}${chip(90,"Last 90 days")}<button class="chip" onclick="A.visits=null;render()">Refresh</button></div>
    <div class="box"><h3>${v.visits} ${v.visits===1?"visit":"visits"} · ${v.views} page ${v.views===1?"view":"views"}</h3>
      ${v.by_day.length?`<div class="scroll"><table style="min-width:420px"><thead><tr><th>Day</th><th>Visits</th><th style="width:45%"><span class="sr">Bar</span></th><th>Page views</th></tr></thead><tbody>
      ${v.by_day.slice().reverse().map(d=>`<tr><td>${new Date(d.day+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})}</td><td style="font-variant-numeric:tabular-nums"><b>${d.visits}</b></td><td><div style="height:10px;border-radius:5px;background:var(--pen);width:${Math.max(2,Math.round(d.visits/max*100))}%"></div></td><td style="font-variant-numeric:tabular-nums">${d.views}</td></tr>`).join("")}</tbody></table></div>`
      :`<p class="muted" style="margin:0">No visits recorded in this period yet.</p>`}</div>
    <div class="grid2">${list("Where visits came from",v.referrers,"visits")}${list("Countries",v.countries,"visits",country)}${list("Pages viewed",v.pages,"views",p=>PAGE_NAMES[p]||p)}${list("Devices",v.devices,"visits",cap)}</div>
    <div class="box" style="margin-top:16px"><h3>Latest visits</h3>
      ${v.recent.length?`<div class="scroll"><table style="min-width:640px"><thead><tr><th>When</th><th>Came from</th><th>Country</th><th>Device</th><th>First page</th></tr></thead><tbody>
      ${v.recent.map(r=>{ const w=new Date(r.at); return `<tr><td>${fmtDay(w)}, ${fmtTime(w)}</td><td>${esc(r.source||r.referrer||"Direct")}${r.campaign?`<div class="small muted">Campaign: ${esc(r.campaign)}</div>`:""}</td><td>${esc(country(r.country))}</td><td>${cap(r.device)}</td><td>${esc(PAGE_NAMES[r.path]||r.path)}</td></tr>` }).join("")}</tbody></table></div>`
      :`<p class="muted" style="margin:0">No visits yet.</p>`}</div>
  </div>`;
}

/* ---------- router + start ---------- */
const baseRender = render;
render = function(){
  let r=routeName();
  // #/class/<id> is where a class's own page sends people: show the class list and open that class's booking.
  if(r==="class"){ A.pendingClass = location.hash.split("/")[2] || null; history.replaceState(null,"",location.pathname+location.search+"#/classes"); r="classes" }
  if(["admin","account","partner","myschool","school","schools","terms","privacy","messages","alerts","app"].includes(r)){
    $("#app").innerHTML = r==="app" ? appPage() : r==="alerts" ? alertsPage() : r==="messages" ? messagesPage(location.hash.split("/")[2]) : r==="terms" ? termsPage() : r==="privacy" ? privacyPage() : r==="admin" ? adminPage() : r==="partner" ? partnerPage() : r==="myschool" ? schoolDash() : r==="school" ? schoolPage(location.hash.split("/")[2]) : r==="schools" ? schoolsList() : accountPage();
    document.querySelectorAll("nav.main a").forEach(a=>a.classList.toggle("on",a.dataset.r===r));
  } else baseRender();
  fieldHints();
  trackVisit(r);
  if(A.pendingClass && A.ready){
    const id=A.pendingClass; A.pendingClass=null;
    if(cls(id)) openBooking(id); else toast("That class is no longer listed");
  }
};
(function start(){
  S.myClasses=[]; S.bookings=[]; S.children=[];   // nothing pretend is kept: lessons and children live in real accounts
  if(S.role==="teacher"){ S.role="learner"; $("#role").value="learner" } save();
  TAB="profile";
  const h=location.hash;
  if(/error_description=/.test(h)){
    A.err = decodeURIComponent((h.match(/error_description=([^&]*)/)||[])[1]||"").replace(/\+/g," ") + ". Ask for a new link and try again.";
    location.hash="#/account";
  }
  chrome(); render();
  if(!sb) return;
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){ A.recovery=true; location.hash="#/account" }
    const id=session?.user?.id||null;
    if(id!==(A.user?.id||null) || event==="PASSWORD_RECOVERY") setTimeout(async()=>{
      await refresh();
      if(id && (["","account","studio","partner","myschool"].includes(routeName()) || /access_token=/.test(location.hash))) location.hash = A.teacher ? "#/studio" : A.staffer ? "#/admin" : A.aff ? "#/partner" : A.school ? "#/myschool" : "#/account";
    },0);
  });
  refresh();
})();

/* ---------- the phone app: the site installs to the home screen and opens full screen, like any app ---------- */
var INSTALL_EVT = null;
var IN_APP = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true || /SeastackSchoolApp/.test(navigator.userAgent);
var ON_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if("serviceWorker" in navigator && location.protocol==="https:") window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}) });
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); INSTALL_EVT=e; appBar(false) });
window.addEventListener("appinstalled", ()=>{ INSTALL_EVT=null; const b=$("#appbar"); if(b) b.remove(); toast("SeastackSchool is installed") });
window.addEventListener("offline", ()=>toast("You are offline. Booking and messages need a connection."));
// The bar offers the app on phones. `asked` is true when the person pressed "Get the app" themselves.
function appBar(asked){
  const old=$("#appbar"); if(old) old.remove();
  if(IN_APP){ if(asked) toast("You are already using the app"); return }
  if(!asked){
    try{ if(localStorage.getItem("ss:appbar")==="no") return }catch(e){}
    if(innerWidth>860 || !(INSTALL_EVT || ON_IOS)) return;
  }
  const how = INSTALL_EVT ? "" : ON_IOS ? "In Safari, tap the Share button, then <b>Add to Home Screen</b>."
    : "On your phone, open seastackschool.com in Chrome, open the menu, then choose <b>Install app</b> or <b>Add to Home screen</b>.";
  const b=document.createElement("div"); b.id="appbar"; b.setAttribute("role","region"); b.setAttribute("aria-label","Get the SeastackSchool app");
  b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(0,0,0,.08);padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));display:flex;gap:12px;align-items:center";
  b.innerHTML=`<img src="app/icon-192.png" alt="" width="44" height="44" style="border-radius:10px;flex:none">
    <div style="flex:1;min-width:0"><b>Get the SeastackSchool app</b><div class="small muted">${how||"Free. Opens full screen from your home screen."}</div></div>
    ${INSTALL_EVT?`<button class="btn sm" onclick="installApp()">Install</button>`:""}
    <a class="btn sm ghost" href="#/app" onclick="appBarClose()">More</a><button class="btn sm ghost" aria-label="Close" onclick="appBarClose()">Not now</button>`;
  document.body.appendChild(b);
}
function appBarClose(){ const b=$("#appbar"); if(b) b.remove(); try{ localStorage.setItem("ss:appbar","no") }catch(e){} }
async function installApp(){
  if(!INSTALL_EVT) return appBar(true);
  const e=INSTALL_EVT; INSTALL_EVT=null; e.prompt();
  try{ await e.userChoice }catch(x){}
  const b=$("#appbar"); if(b) b.remove();
}
(function(){
  const ft=document.querySelector("footer .footer-top");
  if(ft && !IN_APP){ const a=document.createElement("a"); a.href="#"; a.id="getapp"; a.textContent="Get the app"; a.style.cssText="margin-left:auto;font-weight:700"; a.href="#/app"; ft.appendChild(a) }
  if(ON_IOS && !IN_APP) setTimeout(()=>appBar(false), 4000);
})();

// The "Get the app" page: every way to put SeastackSchool on a phone.
var APK_VERSION = null;
(async function(){ try{ const r = await fetch("downloads/version.txt",{cache:"no-store"}); if(r.ok){ const t=(await r.text()).trim(); if(/^[\d.]{1,20}$/.test(t)){ APK_VERSION=t; if(routeName()==="app") render() } } }catch(e){} })();
function appPage(){
  const card=(title, body)=>`<div class="box" style="margin:0"><h3 style="margin-top:0">${title}</h3>${body}</div>`;
  return `<div class="wrap page" style="max-width:860px"><h2>Get the SeastackSchool app</h2>
    <p class="muted">Free. Book lessons, message your teacher and get alerts from your phone. ${IN_APP?"<b>You are using the app now.</b>":""}</p>
    <div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${card("Android phone", APK_VERSION
      ? `<p class="small muted">Download the app file and open it. Android asks once to allow installing from your browser; say yes. Version ${esc(APK_VERSION)}.</p><a class="btn sm" href="downloads/seastackschool.apk" download>Download for Android</a>
         <p class="small muted" style="margin:10px 0 0">Or, in Chrome, ${INSTALL_EVT?`<a href="#" onclick="event.preventDefault();installApp()">install it in one tap</a>`:"open the menu and choose <b>Install app</b>"}; nothing to download.</p>`
      : `<p class="small muted">In Chrome, open the menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>${INSTALL_EVT?`<button class="btn sm" onclick="installApp()">Install</button>`:""}`)}
    ${card("iPhone or iPad", `<p class="small muted" style="margin-bottom:0">Open seastackschool.com in <b>Safari</b>, tap the Share button, then <b>Add to Home Screen</b>. The SeastackSchool icon appears with your other apps.</p>`)}
    ${card("Computer", `<p class="small muted" style="margin-bottom:0">Nothing to install. Use seastackschool.com in any browser. In Chrome or Edge you can also choose <b>Install SeastackSchool</b> from the address bar.</p>`)}
    </div>
    <p class="small muted" style="margin-top:16px">The app and the website are the same account and the same lessons. The app updates itself.</p></div>`;
}

// In the app, the main places sit in a bar at the bottom of the screen, where a thumb reaches them.
var TAB_ICONS = {
  find:'<path d="M11 4a7 7 0 1 0 4.4 12.5l4 4 1.4-1.4-4-4A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>',
  lessons:'<path d="M7 3v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V3h-2v2H9V3H7zm-2 8h14v8H5v-8z"/>',
  chat:'<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v10h2v2l2.5-2H20V6H4z"/>',
  bell:'<path d="M12 3a6 6 0 0 0-6 6v4l-2 3v1h16v-1l-2-3V9a6 6 0 0 0-6-6zm-2 16a2 2 0 0 0 4 0h-4z"/>',
  me:'<path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c4.4 0 8 2 8 4.5V20H4v-1.5C4 16 7.600 14 12 14z"/>',
  teach:'<path d="M12 4 2 9l10 5 8-4v6h2V9L12 4zm-6 9.200V16c0 1.700 2.700 3 6 3s6-1.300 6-3v-2.800l-6 3-6-3z"/>'
};
function tabBar(){
  if(!IN_APP) return;
  document.body.classList.add("in-app");
  let b=$("#tabbar");
  if(!b){
    b=document.createElement("nav"); b.id="tabbar"; b.setAttribute("aria-label","Main");
    document.body.appendChild(b);
    const st=document.createElement("style");
    st.textContent=`#tabbar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;background:var(--surface);border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px))}
      #tabbar a{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:10px;text-decoration:none;color:var(--muted);font-size:11px;font-weight:700;position:relative}
      #tabbar a.on{color:var(--pen)}#tabbar svg{width:24px;height:24px;fill:currentColor}
      #tabbar .n{position:absolute;top:0;left:calc(50% + 4px);background:var(--pen);color:#fff;border-radius:999px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 4px}
      @media (max-width:860px){body.in-app{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}body.in-app nav.main{display:none}body.in-app #toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}body.in-app #appbar{display:none}}
      @media (min-width:861px){#tabbar{display:none}}
      body.in-app{overscroll-behavior-y:contain;-webkit-tap-highlight-color:transparent}
      body.in-app::before{content:"";position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:30}`;
    document.head.appendChild(st);
  }
  const r=routeName(), un=A.alerts.filter(x=>!x.read_at).length, um=A.contacts.reduce((s,c)=>s+(c.unread||0),0);
  const home = !A.user ? "#/account" : A.teacher ? "#/studio" : A.staffer ? "#/admin" : A.aff ? "#/partner" : A.school ? "#/myschool" : "#/account";
  const items = [["find","Classes","#/classes",["","classes","class","teacher","schools","school"]]];
  if(A.teacher) items.push(["teach","My classes","#/studio",["studio"]]); else items.push(["lessons","My lessons","#/learning",["learning"]]);
  if(A.teacher || A.learner) items.push(["chat","Messages","#/messages",["messages"],um]);
  if(A.user) items.push(["bell","Alerts","#/alerts",["alerts"],un]);
  items.push(["me", A.user ? (A.staffer?"Admin":A.school?"School":A.aff?"Affiliate":"Account") : "Sign in", A.teacher ? "#/account" : home, A.teacher?["account"]:["account","admin","partner","myschool"]]);
  b.innerHTML = items.map(([ic,label,href,routes,n])=>`<a href="${href}" class="${routes.includes(r)?"on":""}" ${routes.includes(r)?'aria-current="page"':""}><svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[ic]}</svg>${label}${n?`<span class="n">${n>9?"9+":n}</span>`:""}</a>`).join("");
}
{ const baseChrome = chrome; chrome = function(){ baseChrome(); tabBar() }; }
window.addEventListener("hashchange", ()=>setTimeout(tabBar, 0));
tabBar();
