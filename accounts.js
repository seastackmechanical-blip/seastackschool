/* SeastackSchool accounts: real teacher accounts, their classes, and admin management (Supabase).
   Loaded after the page script in index.html; it replaces the prototype's teacher studio and adds #/admin. */
const SB_URL = "https://xzmamfglxmjjxjsetuaa.supabase.co";
const SB_KEY = "sb_publishable_J6pwCLXOBOp2hXlI183_dw_m06F6Jhh";
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const A = {user:null, teacher:null, admin:false, classes:[], rows:null, mode:"signin", msg:"", err:"", recovery:false, filter:"pending", removing:null,
  learner:null, children:[], lrows:null, kind:"student", adminTab:"teachers", removingChild:null,
  bookings:[], links:{}, cancelling:null, brows:null, bfilter:"upcoming",
  ready:false, visits:null, vdays:30, vloading:false,
  aff:null, adash:null, arows:null, afilter:"pending"};
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
    ages:[x.age_min,x.age_max],level:x.level,days:x.days,hour:+x.start_time.slice(0,2)+(+x.start_time.slice(3,5))/60,mins:x.duration_min};
}
const DAY3 = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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
const slugify = (s,id) => (String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "page") + "-" + String(id).slice(0,8);

/* ---------- data ---------- */
async function loadPublic(){
  if(!sb) return;
  const [t,c,n] = await Promise.all([sb.from("teachers").select("*").eq("status","approved"), sb.from("classes").select("*"), sb.rpc("session_counts")]);
  if(t.error || c.error) return;
  for(const k in BOOKED) delete BOOKED[k];
  (n.data||[]).forEach(x=>{ BOOKED[x.class_id+"@"+Date.parse(x.starts_at)] = +x.booked });
  for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(arr[i].real) arr.splice(i,1);
  const ok = new Set();
  t.data.forEach(x=>{ ok.add(x.id); TEACHERS.push({id:x.id,real:true,name:x.full_name||"New teacher",city:x.city,offset:tzOffset(x.timezone),tz:x.timezone,color:"#C9D6F2",
    years:x.years_experience,langs:x.languages||[],subjects:[],rating:0,intro:x.intro,exp:x.experience}) });
  c.data.filter(x=>ok.has(x.teacher_id)).forEach(x=>CLASSES.push(toClass(x)));
}
async function loadMe(){
  const {data:{session}} = await sb.auth.getSession();
  A.user = session?.user || null; A.teacher=null; A.admin=false; A.classes=[]; A.rows=null; A.learner=null; A.children=[]; A.lrows=null; A.bookings=[]; A.links={}; A.brows=null; A.aff=null; A.adash=null; A.arows=null;
  if(!A.user) return;
  const [t,adm,c,l,k,b,ln,af] = await Promise.all([
    sb.from("teachers").select("*").eq("id",A.user.id).maybeSingle(),
    sb.rpc("is_admin"),
    sb.from("classes").select("*").eq("teacher_id",A.user.id).order("created_at"),
    sb.from("learners").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("children").select("*").eq("parent_id",A.user.id).order("created_at"),
    sb.from("bookings").select("*").order("starts_at"),
    sb.from("class_links").select("*"),
    sb.from("affiliates").select("*").eq("id",A.user.id).maybeSingle()]);
  A.teacher = t.data || null; A.admin = adm.data === true; A.classes = c.data || [];
  A.learner = l.data || null; A.children = k.data || [];
  A.bookings = b.data || []; (ln.data||[]).forEach(x=>{ A.links[x.class_id]=x.url });
  A.aff = af.data || null;
  if(A.aff){ const d = await sb.rpc("my_affiliate_dashboard"); A.adash = d.error ? null : d.data }
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
  if(r.error || l.error || b.error || f.error) toast((r.error||l.error||b.error||f.error).message); else { A.rows = r.data; A.lrows = l.data; A.brows = b.data; A.arows = f.data }
}
async function refresh(){ await loadMe(); await loadPublic(); chrome(); A.ready=true; render() }

/* ---------- header ---------- */
function chrome(){
  let a = $("#acct");
  if(!a){ a=document.createElement("a"); a.id="acct"; a.className="btn sm ghost"; $(".top .wrap").appendChild(a) }
  a.href = !A.user ? "#/account" : A.teacher ? "#/studio" : A.admin ? "#/admin" : A.aff ? "#/partner" : "#/account";
  a.textContent = !A.user ? "Sign in" : A.teacher ? "My teacher account" : A.admin ? "Admin" : A.aff ? "Affiliate dashboard" : "My account";
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
      ${up?`<fieldset class="field" style="border:0;padding:0;margin:0"><legend>I am a…</legend><div class="choices">${[["student","Student","I'm 13 or older and book lessons for myself."],["parent","Parent","I book lessons for my children."],["teacher","Teacher","I want to offer lessons. Teacher accounts are reviewed before going public."],["affiliate","Affiliate","I want to refer teachers and families with my own link. Affiliate accounts are reviewed before they are activated."]].map(([k,l,d])=>`<label class="choice"><input type="radio" name="kind" value="${k}" id="au-kind-${k}" ${A.kind===k?"checked":""} onchange="A.kind=this.value;$('#au-pitchwrap').hidden=this.value!=='affiliate'"><span><b>${l}</b>${d}</span></label>`).join("")}</div></fieldset>`:""}
      ${up?`<label class="field">Full name<input name="full_name" id="au-name" required maxlength="120" autocomplete="name"></label>
      <label class="field" id="au-pitchwrap" ${A.kind==="affiliate"?"":"hidden"}>How will you tell people about SeastackSchool? (optional)<textarea name="pitch" id="au-pitch" rows="2" maxlength="600"></textarea></label>`:""}
      <label class="field">Email<input name="email" id="au-email" type="email" required autocomplete="email"></label>
      ${fg?"":`<label class="field">Password${up?" (at least 8 characters)":""}<input name="password" id="au-pass" type="password" required minlength="${up?8:1}" autocomplete="${up?"new-password":"current-password"}"></label>`}
      <div class="err" id="autherr">${esc(A.err)}</div>
      <button class="btn" id="authbtn" style="align-self:flex-start">${up?"Create account":fg?"Send reset link":"Sign in"}</button>
    </form>
    <p class="small" style="margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap">
      ${up||fg?`<button class="btn ghost sm" onclick="${sw("signin")}">I already have an account</button>`:`<button class="btn ghost sm" onclick="${sw("signup")}">Create an account</button><button class="btn ghost sm" onclick="${sw("forgot")}">Forgot password</button>`}
    </p>
  </div></div>`;
}
async function authSubmit(f){
  const btn=$("#authbtn"), errEl=$("#autherr"), label=btn.textContent, email=f.email.value.trim(), back=location.origin+location.pathname;
  // Every outcome shows a message in the form, and a failed attempt keeps what was typed.
  const fail = m => { errEl.textContent=m; btn.disabled=false; btn.textContent=label };
  if(A.mode==="signup" && !f.full_name.value.trim()) return fail("Enter your full name.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, like name@example.com.");
  if(A.mode==="signup" && f.password.value.length<8) return fail("Choose a password with at least 8 characters.");
  if(A.mode==="signin" && !f.password.value) return fail("Enter your password.");
  btn.disabled=true; btn.textContent="Please wait…"; errEl.textContent=""; A.err=""; A.msg="";
  let error=null;
  try{
    if(A.mode==="signup"){
      const r = await sb.auth.signUp({email,password:f.password.value,options:{data:{full_name:f.full_name.value.trim(),account_type:f.kind.value,ref:storedRef(),pitch:f.kind.value==="affiliate"?f.pitch.value.trim():null},emailRedirectTo:back}});
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
    ${statusBanner()}
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${TAB===k}" onclick="TAB='${k}';render()">${l}</button>`).join("")}</div>
    ${TAB==="profile"?profileForm():TAB==="list"?listings():TAB==="bookings"?teacherBookings():TAB==="plan"?local+planner():TAB==="grades"?local+gradebook():local+resources()}
  </div>`;
};
function statusBanner(){
  const s=A.teacher.status;
  return s==="approved" ? `<div class="ok" style="margin:12px 0">Your account is approved. Your profile and classes are public. <a href="#/teacher/${A.teacher.id}">See your public profile</a>
      <div class="small" style="margin-top:6px;overflow-wrap:anywhere">Your own page to share: <a href="${SITE_BASE}teachers/${slugify(A.teacher.full_name,A.teacher.id)}/">${esc(SITE_BASE)}teachers/${slugify(A.teacher.full_name,A.teacher.id)}/</a> (new and changed pages appear within about an hour)</div></div>`
    : s==="suspended" ? `<div class="notice bad">Your account is suspended, so your profile and classes are hidden. Contact support from the Help page.</div>`
    : `<div class="notice">Your account is waiting for approval. Fill in your profile and add your classes now; students will see them once you're approved.</div>`;
}
function profileForm(){
  const t=A.teacher, tz = t.timezone==="UTC" && !t.full_name.trim() ? TZ : t.timezone, zones=tzList();
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
  return `<div style="margin-bottom:16px">${A.classes.map(x=>{ const c=toClass(x); return `<div class="lesson">
    <div><span class="tag ${c.type}">${typeLabel(c)}</span> <b>${esc(c.title)}</b>
      <div class="small muted">${esc(c.subject)} · taught in ${esc(c.lang)} · ${c.level} · ${ageLabel(c.ages)} · ${money(c.price)} per lesson · ${x.days.map(d=>DAY3[d]).join(", ")} at ${x.start_time.slice(0,5)} (your time) · ${c.mins} min</div>
      <div class="small" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="link-${x.id}" value="${esc(A.links[x.id]||"")}" placeholder="Lesson link (Zoom, Meet…): https://" aria-label="Lesson link for ${esc(c.title)}" style="flex:1;min-width:210px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="saveLink('${x.id}')">Save link</button></div>
      ${A.teacher.status==="approved"?`<div class="small muted" style="margin-top:6px;overflow-wrap:anywhere">This class's own page to share: <a href="${SITE_BASE}classes/${slugify(x.title,x.id)}/">${esc(SITE_BASE)}classes/${slugify(x.title,x.id)}/</a></div>`:""}</div>
    <button class="btn ghost sm" onclick="removeClass('${x.id}')">${A.removing===x.id?"Confirm remove":"Remove"}</button></div>` }).join("")}</div>`;
}
addListing = async function(f){
  const days=[...f.querySelectorAll("[name=day]:checked")].map(x=>+x.value);
  if(!days.length) return toast("Choose at least one day");
  const type=f.type.value, a0=+f.a0.value, a1=Math.min(99,+f.a1.value||99);
  if(a1<a0) return toast("Oldest age must be the same as or above the youngest age");
  const row={teacher_id:A.user.id,title:f.title.value.trim(),subject:f.subject.value.trim(),language:f.lang.value.trim(),type,price:+f.price.value,
    capacity:type==="private"?1:Math.max(2,+f.cap.value||6),level:f.level.value,age_min:a0,age_max:a1,days,start_time:f.time.value,duration_min:+f.mins.value};
  const link=(f.link?.value||"").trim();
  if(link && !/^https:\/\/\S+$/.test(link)) return toast("The lesson link must start with https://");
  const r = await sb.from("classes").insert(row).select("id").single();
  if(r.error) return toast(/row-level security/i.test(r.error.message) ? "Your account can't add classes right now" : r.error.message);
  if(link){ const k = await sb.from("class_links").insert({class_id:r.data.id,url:link}); if(k.error) toast("Class saved, but the lesson link could not be saved") }
  await loadMe(); await loadPublic(); toast("Class saved"); render();
};
async function removeClass(id){
  if(A.removing!==id){ A.removing=id; render(); return }
  A.removing=null;
  const r = await sb.from("classes").delete().eq("id",id);
  if(r.error) return toast(r.error.message);
  await loadMe(); await loadPublic(); toast("Class removed"); render();
}
// The link students use to join (the teacher's own Zoom, Meet, etc.). Only people who booked can see it.
async function saveLink(id){
  const url=($("#link-"+id)?.value||"").trim();
  if(url && !/^https:\/\/\S+$/.test(url)) return toast("The lesson link must start with https://");
  const r = url ? await sb.from("class_links").upsert({class_id:id,url,updated_at:new Date().toISOString()})
                : await sb.from("class_links").delete().eq("class_id",id);
  if(r.error) return toast(r.error.message);
  if(url) A.links[id]=url; else delete A.links[id];
  toast(url?"Lesson link saved":"Lesson link removed");
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
      ${A.links[c.id]?"":`<p class="small" style="color:var(--rose);margin:0 0 6px">Add a lesson link for this class under My classes so students can join.</p>`}
      ${list.map(b=>`<div class="lesson" style="margin:8px 0 0"><span>${esc(b.attendee_name)}</span><button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel booking"}</button></div>`).join("")}</div>`;
  }).join("");
}
startTeaching = function(){ A.kind="teacher"; if(!A.user){ A.mode="signup"; A.err=""; A.msg="" } TAB = A.teacher && A.teacher.full_name.trim() ? "list" : "profile" };

/* ---------- admin: manage teachers ---------- */
function adminPage(){
  if(!A.admin) return `<div class="wrap page"><h2>Manage accounts</h2><div class="notice">This page is for SeastackSchool admins. ${A.user?"You're signed in as "+esc(A.user.email)+".":`<a href="#/account">Sign in</a>`}</div></div>`;
  if(A.adminTab==="learners") return adminLearners();
  if(A.adminTab==="bookings") return adminBookings();
  if(A.adminTab==="visits") return adminVisits();
  if(A.adminTab==="affiliates") return adminAffiliates();
  const rows=A.rows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.filter==="all"?rows:rows.filter(r=>r.status===A.filter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.filter===k}" onclick="A.filter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Approve a teacher to make their profile and classes public. Suspend one to hide them again. Every change is recorded with your account and the time.</p>
    <div class="chips" style="margin-bottom:14px">${chip("pending","Waiting for approval ("+n("pending")+")")}${chip("approved","Approved ("+n("approved")+")")}${chip("suspended","Suspended ("+n("suspended")+")")}${chip("all","All ("+rows.length+")")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:760px"><thead><tr><th>Teacher</th><th>Profile</th><th>Classes</th><th>Joined</th><th>Status</th><th>Decision</th></tr></thead><tbody>
    ${list.map(r=>`<tr>
      <td><b>${esc(r.full_name||"(no name yet)")}</b><div class="small">${esc(r.email)}</div>${r.email_confirmed?"":`<div class="small" style="color:var(--rose)">Email not confirmed</div>`}</td>
      <td class="small">${esc([r.city,r.timezone].filter(Boolean).join(" · "))}<br>${r.years_experience} years · ${esc((r.languages||[]).join(", ")||"no languages yet")}
        <details style="margin-top:6px;padding:6px 10px"><summary class="small">Read profile</summary><p style="margin:6px 0"><b>Introduction</b><br>${esc(r.intro||"(empty)")}</p><p style="margin:6px 0"><b>Experience</b><br>${esc(r.experience||"(empty)")}</p></details></td>
      <td>${r.class_count}</td>
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
    <div class="tabs" role="tablist">${tab("teachers","Teachers ("+(A.rows||[]).length+")")}${tab("learners","Students and parents ("+(A.lrows||[]).length+")")}${tab("bookings","Bookings ("+(A.brows||[]).filter(b=>b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length+" upcoming)")}${tab("affiliates","Affiliates ("+(A.arows||[]).length+")")}${tab("visits","Visits")}</div>`;
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
  const sets={upcoming:rows.filter(b=>b.status==="booked" && at(b)>now).sort((x,y)=>at(x)-at(y)), past:rows.filter(b=>b.status==="booked" && at(b)<=now), cancelled:rows.filter(b=>b.status==="cancelled"), all:rows};
  const list=sets[A.bfilter]||sets.upcoming;
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.bfilter===k}" onclick="A.bfilter='${k}';render()">${l} (${sets[k].length})</button>`;
  const who={student:"the student",parent:"the parent",teacher:"the teacher",admin:"an admin"};
  return `<div class="wrap page">
    ${adminHead()}
    <p class="muted">Every lesson booked on SeastackSchool. Times are shown in your time zone (${esc(TZ)}). Cancelling a booking here frees the seat and emails the teacher and the family.</p>
    <div class="chips" style="margin-bottom:14px">${chip("upcoming","Upcoming")}${chip("past","Past")}${chip("cancelled","Cancelled")}${chip("all","All")}</div>
    ${list.length?`<div class="scroll"><table class="admin" style="min-width:820px"><thead><tr><th>Lesson time</th><th>Class</th><th>For</th><th>Booked by</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${list.map(b=>{ const when=new Date(b.starts_at), upcoming=b.status==="booked" && at(b)>now; return `<tr>
      <td><b>${fmtDay(when)}</b><div class="small">${fmtTime(when)}</div></td>
      <td><b>${esc(b.class_title)}</b><div class="small">${esc(b.teacher_name||"(no name)")} · ${esc(b.teacher_email)}</div></td>
      <td>${esc(b.attendee_name)}</td>
      <td>${esc(b.learner_name||"(no name)")} <span class="small muted">(${b.learner_role})</span><div class="small">${esc(b.learner_email)}</div><div class="small muted">Booked ${new Date(b.created_at).toLocaleDateString()}</div></td>
      <td><span class="tag ${b.status==="cancelled"?"bad":upcoming?"ok":"group"}">${b.status==="cancelled"?"Cancelled":upcoming?"Booked":"Took place"}</span>${b.status==="cancelled"?`<div class="small muted" style="margin-top:4px">by ${who[b.cancelled_by_kind]||"someone"}, ${new Date(b.cancelled_at).toLocaleDateString()}</div>`:""}${b.emailed?"":`<div class="small muted" style="margin-top:4px">No booking email sent</div>`}</td>
      <td>${upcoming?`<button class="btn sm ghost" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel booking"}</button>`:""}</td>
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
    <div class="notice">${A.teacher?`You're signed in with a teacher account. <a href="#/studio">Open the teacher studio</a>`:A.aff?`You're signed in with an affiliate account. <a href="#/partner">Open the affiliate dashboard</a>`:A.admin?`You're signed in with the admin account. <a href="#/admin">Manage accounts</a>`:"This account has no profile yet."}</div></div>`;
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
      ${parent?familyBox():""}
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
  const c=cls(b.class_id), t=c?teacher(c.t):null, when=new Date(b.starts_at), link=A.links[b.class_id];
  return `<div class="lesson"><div><b>${c?esc(c.title):"Class no longer listed"}</b>
    <div class="small muted">${fmtDay(when)}, ${fmtTime(when)} (your time)${t?" · with "+esc(t.name):""} · for ${esc(b.attendee_name)}</div>
    ${upcoming && !link?`<div class="small muted">The teacher hasn't added a lesson link yet. It will appear here when they do.</div>`:""}</div>
    ${upcoming?`<div style="display:flex;gap:8px;flex-wrap:wrap">${link?`<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Join lesson</a>`:""}<button class="btn ghost sm" onclick="cancelReal('${b.id}')">${A.cancelling===b.id?"Confirm cancel":"Cancel"}</button></div>`:""}</div>`;
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
      <p class="small muted" style="margin-top:12px">Nothing was charged: online payment is not open yet. ${A.links[c.id]?"The lesson link is in My lessons.":"The teacher hasn't added a lesson link yet. It will appear in My lessons when they do."}</p>
      <div style="display:flex;justify-content:flex-end"><a class="btn" href="#/learning" onclick="$('#dlg').close()">Go to My lessons</a></div>`;
    return;
  }
  const parent=A.learner?.role==="parent";
  const kids=parent?A.children.filter(k=>k.age>=c.ages[0] && k.age<=c.ages[1]):[];
  let block="";   // why this visitor can't book, if they can't
  if(!A.user) block=`To book this class, sign in or create a free student or parent account.<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#/account" onclick="A.mode='signup';A.kind='student';$('#dlg').close()">Create an account</a><a class="btn sm ghost" href="#/account" onclick="A.mode='signin';$('#dlg').close()">Sign in</a></div>`;
  else if(!A.learner) block=`Lessons are booked from a student or parent account. You're signed in with ${A.teacher?"a teacher":A.aff?"an affiliate":"the admin"} account.`;
  else if(A.learner.status!=="active") block="This account is suspended, so it can't book lessons.";
  else if(!parent && c.ages[1]<13) block="This class is for children under 13, so it's booked from a parent account.";
  else if(parent && !A.children.length) block=`Add your child to your account first. <a href="#/account" onclick="$('#dlg').close()">Open my account</a>`;
  else if(parent && !kids.length) block=`This class is for ${ageLabel(c.ages).toLowerCase()}. None of the children on your account are that age.`;
  if(kids.length && !kids.some(k=>k.id===RB.child)) RB.child=kids[0].id;
  const ss=sessions(c);
  body.innerHTML = `<div class="dlg-head"><div><span class="tag ${c.type}">${typeLabel(c)}</span><h3 style="margin-top:6px">${esc(c.title)}</h3>
    <div class="small">with <a href="#/teacher/${t.id}" onclick="$('#dlg').close()">${esc(t.name)}</a> · ${c.mins} min · ${money(c.price)} · ${ageLabel(c.ages)}</div></div>${x}</div>
    <p class="small muted" style="margin-top:12px">Times are shown in your time zone (${esc(TZ)}).</p>
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
        ${tiers.map(t=>`<tr><td>${t===cur?`<b>${esc(t.name)}</b> <span class="tag ok">You</span>`:esc(t.name)}</td><td>${t.min}${t===tiers[tiers.length-1]?"+":""}</td><td>${t.rate}%</td></tr>`).join("")}</tbody></table>
        <p class="small" style="margin:10px 0 0">${next?`${next.min-d.active} more active ${next.min-d.active===1?"referral":"referrals"} to reach ${esc(next.name)} (${next.rate}%).`:"You are on the top tier."}</p>
        <p class="small muted" style="margin:8px 0 0">Second level ${d.settings.l2_rate}%, third level ${d.settings.l3_rate}%.</p>
        <p class="small muted" style="margin:8px 0 0">Commission is a share of what SeastackSchool collects from the accounts you refer. Online payment is not open yet, so nothing is earned or paid yet; these are the planned rates. Earned so far: <b>$0</b>.</p></div>
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
const ROUTES = ["classes","learning","studio","help","teacher","account","admin","partner"];
const PAGE_NAMES = {"/":"Home","/classes":"Find classes","/learning":"My lessons","/studio":"Teacher studio","/help":"Help","/teacher":"A teacher's profile","/account":"Sign in / my account","/admin":"Manage accounts","/partner":"Affiliate dashboard"};
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
  if(r==="admin" || r==="account" || r==="partner"){
    $("#app").innerHTML = r==="admin" ? adminPage() : r==="partner" ? partnerPage() : accountPage();
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
      if(id && (["","account","studio","partner"].includes(routeName()) || /access_token=/.test(location.hash))) location.hash = A.teacher ? "#/studio" : A.admin ? "#/admin" : A.aff ? "#/partner" : "#/account";
    },0);
  });
  refresh();
})();
