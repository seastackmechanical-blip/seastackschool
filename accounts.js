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
  tdocs:[], tdocsAdmin:{}, removingTDoc:null, attn:null, inbox:null, editing:null, cancelDateKey:null};
const CANCELLED = {};   // lesson dates a teacher has cancelled, keyed like BOOKED
// Demo teachers and classes disappear by themselves once this many real teachers are listed.
const DEMO_OFF_AT = 3;
// Schools stay out of the top menu until teachers and families are working well; their pages still exist.
const SHOW_SCHOOLS_MENU = false;
const BOOKED = {};   // seats taken per lesson, keyed "<class id>@<start in ms>"
let RB = {};         // the real booking in progress

/* ---------- helpers ---------- */
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
  for(const k in BOOKED) delete BOOKED[k];
  (n.data||[]).forEach(x=>{ BOOKED[x.class_id+"@"+Date.parse(x.starts_at)] = +x.booked });
  for(const k in CANCELLED) delete CANCELLED[k];
  (cx.data||[]).forEach(x=>{ CANCELLED[x.class_id+"@"+Date.parse(x.starts_at)] = true });
  for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(arr[i].real) arr.splice(i,1);
  const ok = new Set();
  t.data.forEach(x=>{ ok.add(x.id); TEACHERS.push({id:x.id,real:true,name:x.full_name||"New teacher",city:x.city,offset:tzOffset(x.timezone),tz:x.timezone,school:x.school_id,checked:!!x.identity_checked_at,color:"#C9D6F2",
    years:x.years_experience,langs:x.languages||[],subjects:[],rating:0,intro:x.intro,exp:x.experience}) });
  c.data.filter(x=>ok.has(x.teacher_id)).forEach(x=>CLASSES.push(toClass(x)));
  if(t.data.length >= DEMO_OFF_AT && TEACHERS.some(x=>!x.real)){
    for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(!arr[i].real) arr.splice(i,1);
    S.bookings=[]; save();      // demo bookings pointed at demo classes that are now gone
    const rb=$(".demo-ribbon"); if(rb) rb.textContent="ONLINE PAYMENT IS NOT OPEN YET / NOTHING IS CHARGED WHEN YOU BOOK";
  }
}
async function loadMe(){
  const {data:{session}} = await sb.auth.getSession();
  A.user = session?.user || null; A.teacher=null; A.admin=false; A.classes=[]; A.rows=null; A.learner=null; A.children=[]; A.lrows=null; A.bookings=[]; A.links={}; A.addresses={}; A.brows=null; A.aff=null; A.adash=null; A.arows=null;
  A.school=null; A.schoolPriv=null; A.members=[]; A.mclasses=[]; A.docs=[]; A.mySchool=null; A.srows=null; A.sdocs={};
  if(!A.user) return;
  const [t,adm,c,l,k,b,ln,af,sc,sp] = await Promise.all([
    sb.from("teachers").select("*").eq("id",A.user.id).maybeSingle(),
    sb.rpc("is_admin"),
    sb.from("classes").select("*").eq("teacher_id",A.user.id).order("created_at"),
    sb.from("learners").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("children").select("*").eq("parent_id",A.user.id).order("created_at"),
    sb.from("bookings").select("*").order("starts_at"),
    sb.from("class_links").select("*"),
    sb.from("affiliates").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("schools").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("school_private").select("*").eq("id",A.user.id).maybeSingle()]);
  A.teacher = t.data || null; A.admin = adm.data === true; A.classes = c.data || [];
  A.learner = l.data || null; A.children = k.data || [];
  A.bookings = b.data || []; (ln.data||[]).forEach(x=>{ if(x.url) A.links[x.class_id]=x.url; if(x.address) A.addresses[x.class_id]=x.address });
  A.aff = af.data || null;
  if(A.aff){ const d = await sb.rpc("my_affiliate_dashboard"); A.adash = d.error ? null : d.data }
  A.school = sc.data || null; A.schoolPriv = sp.data || null;
  if(A.school) await loadSchoolExtras();
  if(A.teacher && A.teacher.school_id){ const r = await sb.from("schools").select("id,name,status").eq("id",A.teacher.school_id).maybeSingle(); A.mySchool = r.data || null }
  A.tdocs = A.teacher ? await listDocs(A.user.id, "teacher-docs") : [];
  syncLearner();
  if(A.admin) await loadAdmin();
}
// A signed-in student or parent books as themselves; a parent's children come from their account.
function syncLearner(){
  if(!A.learner) return;
  S.role = A.learner.role==="parent" ? "parent" : "learner"; $("#role").value = S.role;
  if(A.learner.role==="parent") S.children = A.children.map(k=>({id:k.id,name:k.first_name,age:k.age}));
}
async function loadAdmin(){
  const [r,l,b,f] = await Promise.all([sb.rpc("admin_list_teachers"), sb.rpc("admin_list_learners"), sb.rpc("admin_list_bookings"), sb.rpc("admin_list_affiliates")]);
  const sr = await sb.rpc("admin_list_schools"); if(!sr.error) A.srows = sr.data;
  const rr = await sb.rpc("admin_list_reviews"); if(!rr.error) A.rrows = rr.data;
  const at = await sb.rpc("admin_attention"); if(!at.error) A.attn = at.data;
  const ib = await sb.rpc("admin_inbox"); if(!ib.error) A.inbox = ib.data;
  if(r.error || l.error || b.error || f.error) toast((r.error||l.error||b.error||f.error).message); else { A.rows = r.data; A.lrows = l.data; A.brows = b.data; A.arows = f.data }
}
async function refresh(){ await loadMe(); await loadPublic(); chrome(); A.ready=true; render() }

/* ---------- header ---------- */
function chrome(){
  let a = $("#acct");
  if(!a){ a=document.createElement("a"); a.id="acct"; a.className="btn sm ghost"; $(".top .wrap").appendChild(a) }
  a.href = !A.user ? "#/account" : A.teacher ? "#/studio" : A.admin ? "#/admin" : A.aff ? "#/partner" : A.school ? "#/myschool" : "#/account";
  a.textContent = !A.user ? "Sign in" : A.teacher ? "My teacher account" : A.admin ? "Admin" : A.aff ? "Affiliate dashboard" : A.school ? "My school" : "My account";
  let sl = $("#navschools");
  if(!sl && SHOW_SCHOOLS_MENU){ sl=document.createElement("a"); sl.id="navschools"; sl.href="#/schools"; sl.dataset.r="schools"; sl.textContent="Schools"; const nav=$("nav.main"); nav.insertBefore(sl, nav.querySelector('[data-r="help"]')) }
  a.onclick = A.user ? null : () => { A.mode="signin"; A.err=""; A.msg="" };
  let n = $("#navadmin");
  if(A.admin && !n){ n=document.createElement("a"); n.id="navadmin"; n.href="#/admin"; n.dataset.r="admin"; n.textContent="Manage accounts"; $("nav.main").appendChild(n) }
  if(!A.admin && n) n.remove();
}

/* ---------- sign in / sign up ---------- */
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
  if(!A.user) return authPage();
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.teacher) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">Teacher studio</h2>${who}</div>
    <div class="notice">${A.admin?`This is an admin account, so it has no teacher profile. <a href="#/admin">Manage teachers</a>`:A.learner?`This is a ${A.learner.role} account, so it has no teacher studio. To teach, create a separate teacher account with a different email. <a href="#/account">Open my account</a>`:"This account has no teacher profile."}</div></div>`;
  const tabs=[["profile","My profile"],["list","My classes"],["bookings","Bookings"],["plan","Weekly planner"],["grades","Students & grades"],["res","Resources"]];
  if(!tabs.some(t=>t[0]===TAB)) TAB="profile";
  const local = `<p class="small muted">This tool is saved in this browser only for now.</p>`;
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">Teacher studio</h2>${who}</div>
    ${statusBanner()}${teacherSchoolBox()}${teacherChecklist()}
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${TAB===k}" onclick="TAB='${k}';render()">${l}</button>`).join("")}</div>
    ${TAB==="profile"?profileForm()+teacherDocsBox()+accountSettings():TAB==="list"?listings():TAB==="bookings"?teacherBookings()+teacherDates()+teacherPast():TAB==="plan"?local+planner():TAB==="grades"?local+gradebook():local+resources()}
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
  return `<form class="box row" id="proff" onsubmit="event.preventDefault();saveProfile(this)">
    <label class="field">Full name<input name="full_name" id="pf-name" required maxlength="120" value="${esc(t.full_name)}"></label>
    <label class="field">City<input name="city" id="pf-city" maxlength="120" value="${esc(t.city)}" placeholder="e.g. Vancouver"></label>
    <label class="field">Your time zone<select name="timezone" id="pf-tz">${(zones.includes(tz)?zones:[tz].concat(zones)).map(z=>`<option ${z===tz?"selected":""}>${esc(z)}</option>`).join("")}</select></label>
    <label class="field">Years of teaching experience<input name="years" id="pf-years" type="number" min="0" max="80" value="${t.years_experience}"></label>
    <label class="field" style="grid-column:1/-1">Teaching languages, separated by commas<input name="languages" id="pf-langs" value="${esc((t.languages||[]).join(", "))}" placeholder="English, French"></label>
    <label class="field" style="grid-column:1/-1">Introduction (students read this first)<textarea name="intro" id="pf-intro" rows="3" maxlength="2000">${esc(t.intro)}</textarea></label>
    <label class="field" style="grid-column:1/-1">Experience and qualifications<textarea name="experience" id="pf-exp" rows="3" maxlength="2000">${esc(t.experience)}</textarea></label>
    <button class="btn" style="grid-column:1/-1;justify-self:start">Save profile</button>
  </form>`;
}
async function saveProfile(f){
  const row={full_name:f.full_name.value.trim(),city:f.city.value.trim(),timezone:f.timezone.value,years_experience:Math.max(0,Math.min(80,+f.years.value||0)),
    languages:f.languages.value.split(",").map(s=>s.trim()).filter(Boolean).slice(0,12),intro:f.intro.value.trim(),experience:f.experience.value.trim()};
  const r = await sb.from("teachers").update(row).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "Your profile could not be saved");
  A.teacher=r.data; await loadPublic(); toast("Profile saved"); render();
}
function myClassList(){
  if(!A.classes.length) return `<div class="empty" style="margin-bottom:16px">You haven't listed a class yet.</div>`;
  return `${classEditForm()}<div style="margin-bottom:16px">${A.classes.map(x=>{ const c=toClass(x); return `<div class="lesson">
    <div><span class="tag ${c.type}">${typeLabel(c)}</span> <b>${esc(c.title)}</b>
      <div class="small muted">${modeLabel(c)} · ${esc(c.subject)} · taught in ${esc(c.lang)} · ${c.level} · ${ageLabel(c.ages)} · ${money(c.price)} per lesson · ${x.days.map(d=>DAY3[d]).join(", ")} at ${x.start_time.slice(0,5)} (${esc((A.teacher.timezone||"UTC").replace(/_/g," "))} time) · ${c.mins} min</div>
      <div class="small" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="link-${x.id}" value="${esc((c.mode==="in_person"?A.addresses[x.id]:A.links[x.id])||"")}" placeholder="${c.mode==="in_person"?"Address (only people who booked can see it)":"Lesson link (Zoom, Meet…): https://"}" aria-label="${c.mode==="in_person"?"Address":"Lesson link"} for ${esc(c.title)}" style="flex:1;min-width:210px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="saveLink('${x.id}')">${c.mode==="in_person"?"Save address":"Save link"}</button></div>
      ${A.teacher.status==="approved"?`<div class="small muted" style="margin-top:6px;overflow-wrap:anywhere">This class's own page to share: <a href="${SITE_BASE}classes/${slugify(x.title,x.id)}/">${esc(SITE_BASE)}classes/${slugify(x.title,x.id)}/</a></div>`:""}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" onclick="A.editing='${x.id}';render();$('#editclass')?.scrollIntoView({block:'center'})">Edit</button><button class="btn ghost sm" onclick="removeClass('${x.id}')">${A.removing===x.id?"Confirm remove":"Remove"}</button></div></div>` }).join("")}</div>`;
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
  await loadMe(); await loadPublic(); toast("Class saved"); render();
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
    <label class="field">Subject<input name="subject" id="ed-subject" maxlength="60" value="${esc(x.subject)}"></label>
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
  A.editing=null; await loadMe(); await loadPublic(); toast("Class updated"); render();
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
      ${list.map(b=>`<div class="lesson" style="margin:8px 0 0"><span>${esc(b.attendee_name)}</span><button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel booking"}</button></div>`).join("")}</div>`;
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
  const ids=r.data||[]; ids.forEach(b=>notifyBooking(b,"cancelled"));
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
  if(!A.admin) return `<div class="wrap page"><h2>Manage accounts</h2><div class="notice">This page is for SeastackSchool admins. ${A.user?"You're signed in as "+esc(A.user.email)+".":`<a href="#/account">Sign in</a>`}</div></div>`;
  if(A.adminTab==="learners") return adminLearners();
  if(A.adminTab==="bookings") return adminBookings();
  if(A.adminTab==="visits") return adminVisits();
  if(A.adminTab==="affiliates") return adminAffiliates();
  if(A.adminTab==="schools") return adminSchools();
  if(A.adminTab==="reviews") return adminReviews();
  if(A.adminTab==="inbox") return adminInbox();
  const rows=A.rows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.filter==="all"?rows:rows.filter(r=>r.status===A.filter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.filter===k}" onclick="A.filter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Approve a teacher to make their profile and classes public. Suspend one to hide them again. Every change is recorded with your account and the time.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for approval ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:760px"><thead><tr><th>Teacher</th><th>Profile</th><th>Classes and identity</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}</td>
      <td class="small">${esc([r.city,r.timezone].filter(Boolean).join(" · "))}<br>${r.years_experience} years · ${esc((r.languages||[]).join(", ")||"no languages yet")}
        <details style="margin-top:6px;padding:6px 10px"><summary class="small">Read profile</summary><p style="margin:6px 0"><b>Introduction</b><br>${esc(r.intro||"(empty)")}</p><p style="margin:6px 0"><b>Experience</b><br>${esc(r.experience||"(empty)")}</p></details></td>
      <td>${r.class_count} ${r.class_count===1?"class":"classes"}${r.school_name?`<div class="small muted">School: ${esc(r.school_name)}</div>`:""}
        <div class="small" style="margin-top:6px">${r.identity_checked_at?`<span class="tag ok">Identity checked</span> ${new Date(r.identity_checked_at).toLocaleDateString()}`:`<span class="tag group">Identity not checked</span>`}</div>
        <div class="small" style="margin-top:6px">${A.tdocsAdmin[r.id]?(A.tdocsAdmin[r.id].length?A.tdocsAdmin[r.id].map(d=>d.url?`<div style="overflow-wrap:anywhere"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a></div>`:`<div>${esc(d.name)}</div>`).join(""):"No documents uploaded"):`<button class="btn sm ghost" onclick="showTeacherDocs('${r.id}')">Show documents</button>`}</div>
        <div class="acts"><button class="btn sm ghost" onclick="setIdentity('${r.id}',${!r.identity_checked_at})">${r.identity_checked_at?"Remove identity check":"Mark identity checked"}</button></div></td>
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
      <span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span></div>
    ${attentionPanel()}
    <div class="tabs" role="tablist">${tab("teachers","Teachers ("+(A.rows||[]).length+")")}${tab("learners","Students and parents ("+(A.lrows||[]).length+")")}${tab("bookings","Bookings ("+(A.brows||[]).filter(b=>b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length+" upcoming)")}${tab("schools","Schools ("+(A.srows||[]).length+")")}${tab("affiliates","Affiliates ("+(A.arows||[]).length+")")}${tab("reviews","Reviews ("+(A.rrows||[]).length+")")}${tab("inbox","Reports and messages ("+(A.attn?A.attn.reports+A.attn.messages:0)+")")}${tab("visits","Visits")}</div>`;
}
function adminLearners(){
  const rows=A.lrows||[];
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Student and parent accounts are active as soon as the email is confirmed. Suspend one to block it; restore it at any time. Every change is recorded with your account and the time.</p>
    ${rows.length?`<div class="scroll"><table class="admin" style="min-width:720px"><thead><tr><th>Account</th><th>Type</th><th>Children</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}</td>
      <td>${r.role==="parent"?"Parent":"Student"}</td>
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
      <td>${upcoming?`<button class="btn sm ghost" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel booking"}</button>`
          :b.status==="booked"?`<div class="acts" style="margin:0"><button class="btn sm ghost" onclick="markAttendance('${b.id}','attended')">Attended</button><button class="btn sm ghost" onclick="markAttendance('${b.id}','no_show')">Did not attend</button></div>`:""}</td>
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
  if(!A.user) return authPage();
  const who = `<span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span>`;
  if(!A.learner) return `<div class="wrap page"><div class="results-head"><h2 style="margin:0">My account</h2>${who}</div>
    <div class="notice">${A.teacher?`You're signed in with a teacher account. <a href="#/studio">Open the teacher studio</a>`:A.school?`You're signed in with a school account. <a href="#/myschool">Open my school</a>`:A.aff?`You're signed in with an affiliate account. <a href="#/partner">Open the affiliate dashboard</a>`:A.admin?`You're signed in with the admin account. <a href="#/admin">Manage accounts</a>`:"This account has no profile yet."}</div></div>`;
  const L=A.learner, parent=L.role==="parent";
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">My account</h2>${who}</div>
    ${L.status==="suspended"?`<div class="notice bad">This account is suspended. Contact support from the Help page.</div>`:""}
    <div class="cols"><div>
      <form class="box" id="acctf" novalidate onsubmit="event.preventDefault();saveLearner(this)">
        <h3>${parent?"Parent account":"Student account"}</h3>
        <label class="field">Full name<input name="full_name" id="ac-name" maxlength="120" value="${esc(L.full_name)}"></label>
        <p class="small muted" style="margin:10px 0">${parent?"You book lessons for your children from this account.":"You book lessons for yourself from this account."}</p>
        <button class="btn sm">Save name</button>
      </form>
      ${parent?familyBox():""}${accountSettings()}
    </div><div>
      <div class="box"><h3>My lessons</h3><p class="muted" style="margin:0 0 12px">${(n=>n===1?"1 upcoming lesson.":n+" upcoming lessons.")(A.bookings.filter(b=>b.learner_id===A.user.id && b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length)} Online payment is not open yet, so nothing is charged when you book.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#/learning">Open my lessons</a><a class="btn sm ghost" href="#/classes">Find a class</a></div></div>
    </div></div>
  </div>`;
}
function familyBox(){
  return `<div class="box"><h3>My children</h3>
    <p class="muted small">Children under 13 don't need their own account. Add them here, and when you book you choose which child the lesson is for.</p>
    ${A.children.length?A.children.map(k=>`<div class="lesson"><span><b>${esc(k.first_name)}</b>, age ${k.age}</span><button class="btn ghost sm" onclick="dropChild('${k.id}')">${A.removingChild===k.id?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No children added yet.</div>`}
    <form class="row" id="childf" novalidate onsubmit="event.preventDefault();addChild(this)">
      <label class="field">Child's first name<input name="n" id="ch-name" maxlength="60"></label>
      <label class="field">Age<input name="a" id="ch-age" type="number" min="3" max="17"></label>
      <button class="btn sm" style="align-self:end">Add child</button>
    </form></div>`;
}
async function saveLearner(f){
  const name=f.full_name.value.trim();
  if(!name) return toast("Enter your full name");
  const r = await sb.from("learners").update({full_name:name}).eq("id",A.user.id).select().maybeSingle();
  if(r.error || !r.data) return toast(r.error?.message || "Your name could not be saved");
  A.learner=r.data; toast("Name saved"); render();
}
async function addChild(f){
  const name=f.n.value.trim(), age=+f.a.value;
  if(!name) return toast("Enter your child's first name");
  if(!(age>=3 && age<=17)) return toast("Enter an age between 3 and 17");
  const r = await sb.from("children").insert({parent_id:A.user.id,first_name:name,age});
  if(r.error) return toast(/up to 10/.test(r.error.message) ? "A parent account can list up to 10 children" : /row-level security/i.test(r.error.message) ? "Your account can't add children right now" : r.error.message);
  await loadMe(); toast("Child added"); render();
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
learning = function(){ return A.learner ? realLessons() : baseLearning() };
function bookingRow(b, upcoming){
  const c=cls(b.class_id), t=c?teacher(c.t):null, when=new Date(b.starts_at), link=A.links[b.class_id], inPerson=!!c && c.mode==="in_person", addr=A.addresses[b.class_id];
  return `<div class="lesson"><div><b>${c?esc(c.title):"Class no longer listed"}</b>
    <div class="small muted">${fmtDay(when)}, ${fmtTime(when)} (your time)${t?" · with "+esc(t.name):""} · for ${esc(b.attendee_name)}</div>
    ${!upcoming?"":inPerson?`<div class="small">${addr?"Where: "+esc(addr):`In person${c.place?" in "+esc(c.place):""}. The teacher hasn't added the address yet; it will appear here when they do.`}</div>`
      :!link?`<div class="small muted">The teacher hasn't added a lesson link yet. It will appear here when they do.</div>`:""}</div>
    ${upcoming?`<div style="display:flex;gap:8px;flex-wrap:wrap">${link && !inPerson?`<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer" onclick="recordJoin('${b.id}')">Join lesson</a>`:""}<button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel"}</button></div>`:(b.status!=="booked" || !t ? ""
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
    <p class="small muted" style="margin-top:18px">Online payment is not open yet, so nothing is charged for these bookings.${A.learner.role==="parent"?` Your children are managed in <a href="#/account">your account</a>.`:""}</p>
  </div>`;
}
// Opening an online lesson from here is recorded once, around the lesson time, so the teacher can see who joined.
function recordJoin(id){ try{ sb.rpc("record_join",{p_booking_id:id}).then(()=>{}, ()=>{}) }catch(e){} }
async function cancelReal(id){
  if(A.cancelling!==id){ A.cancelling=id; render(); return }
  A.cancelling=null;
  const r = await sb.rpc("cancel_booking",{p_booking_id:id});
  if(r.error){ toast(r.error.message); render(); return }
  notifyBooking(id,"cancelled");
  await loadMe(); await loadPublic(); toast("Booking cancelled"); render();
}
// Emails the teacher and the learner. The booking itself never depends on this succeeding.
function notifyBooking(id,event){
  try{ sb.functions.invoke("booking-notify",{body:{booking_id:id,event,tz:TZ}}).catch(()=>{}) }catch(e){}
}

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
    <p class="small muted">Online payment is not open yet, so nothing is charged when you book.</p>
    <div class="err" id="rberr">${esc(RB.err||"")}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:6px"><button class="btn" id="rbbtn" ${RB.key && ss.some(s=>s.key===RB.key&&s.left)?"":"disabled"} onclick="bookReal()">Book this lesson</button></div>`}`;
}
async function bookReal(){
  const c=cls(RB.cid), start=+RB.key.split("@")[1], btn=$("#rbbtn"), parent=A.learner.role==="parent";
  btn.disabled=true; btn.textContent="Please wait…";
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
    [A.tdocs.length>0 || !!t.identity_checked_at, "Upload an identity document", "profile", "Open My profile"],
    [cl.length>0, "Create your first class", "list", "Open My classes"],
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
  return t && t.real && t.checked ? `<div class="small" style="margin-top:4px"><span class="tag ok">Identity checked by SeastackSchool</span></div>` : "";
}
function teacherDocsBox(){
  const t=A.teacher;
  return `<div class="box"><h3>Identity documents</h3>
    <p class="muted small">Upload a photo ID, and any teaching certificate you'd like us to see. Only you and SeastackSchool can open these; they are never shown to students or visitors. ${t.identity_checked_at?`<b>Your identity was checked on ${new Date(t.identity_checked_at).toLocaleDateString()}</b>, and your profile shows "Identity checked by SeastackSchool".`:"Once we have checked them, your profile shows \"Identity checked by SeastackSchool\"."}</p>
    ${A.tdocs.length?A.tdocs.map((d,i)=>`<div class="lesson"><span style="overflow-wrap:anywhere">${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a>`:esc(d.name)}</span><button class="btn ghost sm" onclick="dropTDoc(${i})">${A.removingTDoc===d.path?"Confirm remove":"Remove"}</button></div>`).join(""):`<div class="empty" style="margin-bottom:12px">No documents uploaded yet.</div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><input type="file" id="tdocfile" accept=".pdf,.jpg,.jpeg,.png" aria-label="Choose a document"><button class="btn sm" id="tdocbtn" onclick="uploadTDoc()">Upload</button></div>
    <p class="small muted" style="margin:8px 0 0">PDF, JPG or PNG, up to 10 MB each, up to 5 files.</p></div>`;
}
async function uploadTDoc(){
  const file=$("#tdocfile").files[0], btn=$("#tdocbtn");
  if(!file) return toast("Choose a file first");
  if(A.tdocs.length>=5) return toast("You can upload up to 5 documents. Remove one first.");
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
async function showTeacherDocs(id){ A.tdocsAdmin[id] = await listDocs(id, "teacher-docs"); render() }
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
    [a.teachers,"teacher","teachers","waiting for approval",go("teachers","A.filter='pending';")],
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
    <p class="muted">Sent by signed-in students, parents and others from a teacher's profile. The teacher is not told who reported them. You can suspend the teacher from the Teachers tab.</p>
    ${ib.reports.length?`<div class="scroll"><table class="admin" style="min-width:800px"><thead><tr><th>Teacher</th><th>About</th><th>What happened</th><th>From</th><th>Date</th><th>Action</th></tr></thead><tbody>
    ${ib.reports.map(r=>`<tr><td><b>${esc(r.teacher_name||"(no name)")}</b><div class="small">${esc(r.teacher_email)}</div><div class="small muted">Teacher is ${esc(r.teacher_status)}</div></td>
      <td><span class="tag ${r.category==="safety"?"bad":"group"}">${cats[r.category]||esc(r.category)}</span></td>
      <td class="small" style="max-width:300px;white-space:pre-line">${esc(r.details)}${r.admin_note?`<div class="muted" style="margin-top:4px">Your note: ${esc(r.admin_note)}</div>`:""}</td>
      <td class="small">${esc(r.reporter_email||"(account deleted)")}</td><td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${r.status==="open"?`<input id="rnote-${r.id}" aria-label="Note" placeholder="Note (optional)" maxlength="1000">`:""}<div class="acts">${done("report",r.id,r.status)}</div></td></tr>`).join("")}</tbody></table></div>`
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
    ["Teachers",["Teacher accounts are reviewed before the profile and classes are shown publicly. A profile must be truthful, including experience and qualifications.","Teachers must behave professionally, keep contact with children limited to the lesson and its arrangements, and follow the law where they and their students are. \"Identity checked by SeastackSchool\" means we have seen the identity documents the teacher uploaded. It is not a background check or a guarantee."]],
    ["Schools",["A school uploads documents showing it is registered or licensed, and is reviewed before its page is public. \"Documents reviewed by SeastackSchool\" means we have seen those documents. It is not accreditation or certification by any government or authority.","A school is responsible for the teachers it approves and for their lessons."]],
    ["Booking, attendance and cancelling",["A booking reserves one place in one lesson. You can cancel before the lesson starts. Teachers, schools and SeastackSchool can also cancel a booking.","A lesson counts as attended unless the teacher marks otherwise. If you disagree with that mark you can ask SeastackSchool to review it, and our decision is final."]],
    ["Prices and payment",["Prices are set by teachers and shown in US dollars. Online payment is not open yet: booking on SeastackSchool charges nothing. When payment opens, these terms will be updated first."]],
    ["Ratings",["Only a student or parent who attended and finished a lesson can rate that teacher. Ratings must be honest and about the lesson. SeastackSchool, and a school for its own teachers, may hide a rating."]],
    ["Affiliates",["Affiliates are credited for accounts that sign up through their link. No commission is earned or paid until online payment opens and the rates are confirmed."]],
    ["What is not allowed",["Do not use SeastackSchool to harm or harass anyone, to contact children for any purpose other than their lessons, to post false or misleading information, to upload documents that are not yours, or to interfere with the site."]],
    ["Reports, suspension and removal",["You can report a concern about a teacher from their profile. We may suspend or remove any account, listing or rating that breaks these terms or puts someone at risk."]],
    ["Changes",["We may change these terms as the site grows. The date at the top shows the latest version."]]
  ]);
}
function privacyPage(){
  return legalPage("Privacy Policy","3 October 2026",[
    ["What we collect",["<b>Every account:</b> your email address, your name, and a password, which is stored in scrambled form that we cannot read.","<b>Teachers:</b> the profile you write (city, time zone, experience, languages, introduction), your classes, lesson links or addresses, and any identity documents you upload.","<b>Parents:</b> each child's first name and age. We do not ask for a child's surname, email, photo or date of birth, and children do not have accounts.","<b>Schools:</b> the school's details, a contact person, and the documents you upload.","<b>Bookings:</b> which lesson was booked, who it is for, attendance, and when an online lesson was opened from the site.","<b>Ratings, reports and Help messages</b> that you send."]],
    ["Visits",["We record the page opened, the website the visit came from, the country, whether a phone or a computer was used, and the time. We do not use cookies for this and do not store IP addresses or names. Your choice of time zone and an affiliate code, if you arrived through one, are kept in your own browser."]],
    ["Who can see what",["Public: an approved teacher's profile, classes and ratings, and an approved school's page. A rating shows the reviewer's first name only.","A teacher sees the name on each booking in their classes (a child's first name, or a student's own name), not the family's email. A school sees the same for its teachers.","Lesson links and in-person addresses are shown only to people who booked that class.","Identity documents and school documents can be opened only by the account that uploaded them and by SeastackSchool.","Affiliates see how many people signed up through their link, never their names or emails.","SeastackSchool staff who manage the site can see account emails, bookings, reports and messages in order to run it."]],
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
async function listDocs(folder, bucket="school-docs"){
  const l = await sb.storage.from(bucket).list(folder, {limit:50, sortBy:{column:"created_at", order:"asc"}});
  const files = (l.data||[]).filter(f=>f.name && f.id);
  if(!files.length) return [];
  const paths = files.map(f=>folder+"/"+f.name);
  const s = await sb.storage.from(bucket).createSignedUrls(paths, 3600);
  return files.map((f,i)=>({name:f.name.replace(/^\d+-/,""), path:paths[i], url:(s.data||[])[i]?.signedUrl || ""}));
}
async function loadSchoolExtras(){
  const m = await sb.from("teachers").select("*").eq("school_id", A.user.id).order("created_at");
  A.members = m.data || [];
  const ids = A.members.map(x=>x.id);
  A.mclasses = ids.length ? ((await sb.from("classes").select("*").in("teacher_id", ids)).data || []) : [];
  A.mreviews = ids.length ? ((await sb.from("reviews").select("*").in("teacher_id", ids).order("updated_at",{ascending:false})).data || []) : [];
  A.docs = await listDocs(A.user.id);
}
async function schoolReviewAction(id, hidden){
  const r = await sb.rpc("school_set_review_hidden",{p_review_id:id,p_hidden:hidden});
  if(r.error) return toast(r.error.message);
  await loadSchoolExtras(); await loadPublic(); toast(hidden?"Review hidden":"Review shown again"); render();
}
function schoolDash(){
  if(!sb) return `<div class="wrap page"><h2>My school</h2><div class="notice">Accounts can't be reached right now. Check your connection and reload the page.</div></div>`;
  if(A.recovery) return newPasswordPage();
  if(!A.user) return authPage();
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
        ${A.members.length?A.members.map(t=>`<div class="lesson"><div><b>${esc(t.full_name||"(no name yet)")}</b> ${pill(t)}<div class="small muted">${(n=>n+" "+(n===1?"class":"classes"))(A.mclasses.filter(c=>c.teacher_id===t.id).length)}${t.city?" · "+esc(t.city):""}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${t.status==="pending" && s.status==="approved"?`<button class="btn sm" onclick="memberAction('${t.id}','approve')">Approve</button>`:""}<button class="btn ghost sm" onclick="memberAction('${t.id}','remove')">${A.removingMember===t.id?"Confirm remove":"Remove"}</button></div></div>`).join("")
        :`<div class="empty">No teachers have joined yet.</div>`}</div>
      <div class="box"><h3>Upcoming bookings</h3>
        ${up.length?up.map(b=>{ const c=A.mclasses.find(x=>x.id===b.class_id), t=A.members.find(x=>x.id===c.teacher_id), w=new Date(b.starts_at); return `<div class="lesson"><div><b>${esc(c.title)}</b><div class="small muted">${fmtDay(w)}, ${fmtTime(w)} · ${esc(t?t.full_name:"")} · for ${esc(b.attendee_name)}</div></div></div>` }).join("")
        :`<p class="muted" style="margin:0">No upcoming bookings in your teachers' classes yet.</p>`}</div>
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
  const a = await sb.from("schools").update({name,country:f.country.value.trim(),city:f.city.value.trim(),website:web,about:f.about.value.trim()}).eq("id",A.user.id).select().maybeSingle();
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
        <div class="muted">${esc([s.city,s.country].filter(Boolean).join(", "))}${s.website?` · <a href="${esc(s.website)}" target="_blank" rel="noopener noreferrer">Website</a>`:""}</div>
        <div class="small muted">Documents reviewed by SeastackSchool${s.reviewed_at?" on "+new Date(s.reviewed_at).toLocaleDateString():""}</div></div></div>
    <div class="cols"><div>
      ${s.about?`<div class="box"><h3>About the school</h3><p style="margin:0;white-space:pre-line">${esc(s.about)}</p></div>`:""}
      <h3>Classes</h3>${cs.length?`<div class="list">${cs.map(card).join("")}</div>`:`<div class="empty">No classes listed yet.</div>`}
    </div><div>
      <div class="box"><h3>Teachers</h3>${ts.length?ts.map(t=>`<div class="review"><a href="#/teacher/${t.id}"><b>${esc(t.name)}</b></a><div class="small muted">${esc(t.langs.join(", "))}</div></div>`).join(""):`<p class="muted" style="margin:0">No teachers listed yet.</p>`}</div>
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
    <p class="muted">Open each school's documents before approving it. An approved school gets a public page and can approve its own teachers. Suspending a school hides its page and the teachers it approved; restoring it brings them back.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for review ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:900px"><thead><tr><th>School</th><th>Details</th><th>Documents</th><th>Teachers</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>{ const docs=A.sdocs[r.id]; return `<tr>
      <td><b>${esc(r.name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}
        <div class="small muted">Contact: ${esc(r.contact_name||"(none)")}</div><div class="small muted">${esc([r.city,r.country].filter(Boolean).join(", ")||"(no location yet)")}</div>
        ${r.website?`<div class="small"><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer">Website</a></div>`:""}</td>
      <td class="small"><details style="padding:6px 10px"><summary class="small">Read</summary><p style="margin:6px 0"><b>About</b><br>${esc(r.about||"(empty)")}</p><p style="margin:6px 0"><b>Note to reviewer</b><br>${esc(r.reviewer_note||"(empty)")}</p></details></td>
      <td class="small">${docs?(docs.length?docs.map(d=>d.url?`<div style="overflow-wrap:anywhere"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a></div>`:`<div>${esc(d.name)}</div>`).join(""):"No documents uploaded"):`<button class="btn sm ghost" onclick="showSchoolDocs('${r.id}')">Show documents</button>`}</td>
      <td>${r.teachers} <span class="small muted">(${r.teachers_public} public)</span></td>
      <td class="small">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${pill(r.status)}${r.reviewed_at?`<div class="small muted" style="margin-top:4px">Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}</div>`:""}${r.last_note?`<div class="small muted" style="margin-top:4px">Note: ${esc(r.last_note)}</div>`:""}</td>
      <td><input id="snote-${r.id}" aria-label="Note for ${esc(r.name)}" placeholder="Note (optional)" maxlength="1000">
        <div class="acts">${r.status==="approved"?act(r.id,"suspended","Suspend",true):r.status==="suspended"?act(r.id,"approved","Restore"):act(r.id,"approved","Approve")+act(r.id,"suspended","Suspend",true)}</div></td>
    </tr>` }).join("")}</tbody></table></div>`
    :`<div class="empty">${rows.length?"No schools in this list.":"No school has registered yet."}</div>`}
  </div>`;
}
async function showSchoolDocs(id){ A.sdocs[id] = await listDocs(id); render() }
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
  if(!A.user) return authPage();
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
      <td class="small">${esc(r.pitch||"(nothing written)")}</td>
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
  if(!sb || !A.ready || A.admin) return;          // the admin's own visits are not counted
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
  if(["admin","account","partner","myschool","school","schools","terms","privacy"].includes(r)){
    $("#app").innerHTML = r==="terms" ? termsPage() : r==="privacy" ? privacyPage() : r==="admin" ? adminPage() : r==="partner" ? partnerPage() : r==="myschool" ? schoolDash() : r==="school" ? schoolPage(location.hash.split("/")[2]) : r==="schools" ? schoolsList() : accountPage();
    document.querySelectorAll("nav.main a").forEach(a=>a.classList.toggle("on",a.dataset.r===r));
  } else baseRender();
  trackVisit(r);
  if(A.pendingClass && A.ready){
    const id=A.pendingClass; A.pendingClass=null;
    if(cls(id)) openBooking(id); else toast("That class is no longer listed");
  }
};
(function start(){
  S.myClasses=[]; if(S.role==="teacher"){ S.role="learner"; $("#role").value="learner" } save();
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
      if(id && (["","account","studio","partner","myschool"].includes(routeName()) || /access_token=/.test(location.hash))) location.hash = A.teacher ? "#/studio" : A.admin ? "#/admin" : A.aff ? "#/partner" : A.school ? "#/myschool" : "#/account";
    },0);
  });
  refresh();
})();
