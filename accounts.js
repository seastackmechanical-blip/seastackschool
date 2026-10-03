/* SeastackSchool accounts: real teacher accounts, their classes, and admin management (Supabase).
   Loaded after the page script in index.html; it replaces the prototype's teacher studio and adds #/admin. */
const SB_URL = "https://xzmamfglxmjjxjsetuaa.supabase.co";
const SB_KEY = "sb_publishable_J6pwCLXOBOp2hXlI183_dw_m06F6Jhh";
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const A = {user:null, teacher:null, admin:false, classes:[], rows:null, mode:"signin", msg:"", err:"", recovery:false, filter:"pending", removing:null,
  learner:null, children:[], lrows:null, kind:"student", adminTab:"teachers", removingChild:null,
  bookings:[], links:{}, cancelling:null, brows:null, bfilter:"upcoming"};
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
  A.user = session?.user || null; A.teacher=null; A.admin=false; A.classes=[]; A.rows=null; A.learner=null; A.children=[]; A.lrows=null; A.bookings=[]; A.links={}; A.brows=null;
  if(!A.user) return;
  const [t,adm,c,l,k,b,ln] = await Promise.all([
    sb.from("teachers").select("*").eq("id",A.user.id).maybeSingle(),
    sb.rpc("is_admin"),
    sb.from("classes").select("*").eq("teacher_id",A.user.id).order("created_at"),
    sb.from("learners").select("*").eq("id",A.user.id).maybeSingle(),
    sb.from("children").select("*").eq("parent_id",A.user.id).order("created_at"),
    sb.from("bookings").select("*").order("starts_at"),
    sb.from("class_links").select("*")]);
  A.teacher = t.data || null; A.admin = adm.data === true; A.classes = c.data || [];
  A.learner = l.data || null; A.children = k.data || [];
  A.bookings = b.data || []; (ln.data||[]).forEach(x=>{ A.links[x.class_id]=x.url });
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
  const [r,l,b] = await Promise.all([sb.rpc("admin_list_teachers"), sb.rpc("admin_list_learners"), sb.rpc("admin_list_bookings")]);
  if(r.error || l.error || b.error) toast((r.error||l.error||b.error).message); else { A.rows = r.data; A.lrows = l.data; A.brows = b.data }
}
async function refresh(){ await loadMe(); await loadPublic(); chrome(); render() }

/* ---------- header ---------- */
function chrome(){
  let a = $("#acct");
  if(!a){ a=document.createElement("a"); a.id="acct"; a.className="btn sm ghost"; $(".top .wrap").appendChild(a) }
  a.href = !A.user ? "#/account" : A.teacher ? "#/studio" : A.admin ? "#/admin" : "#/account";
  a.textContent = !A.user ? "Sign in" : A.teacher ? "My teacher account" : A.admin ? "Admin" : "My account";
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
      ${up?`<fieldset class="field" style="border:0;padding:0;margin:0"><legend>I am a…</legend><div class="choices">${[["student","Student","I'm 13 or older and book lessons for myself."],["parent","Parent","I book lessons for my children."],["teacher","Teacher","I want to offer lessons. Teacher accounts are reviewed before going public."]].map(([k,l,d])=>`<label class="choice"><input type="radio" name="kind" value="${k}" id="au-kind-${k}" ${A.kind===k?"checked":""} onchange="A.kind=this.value"><span><b>${l}</b>${d}</span></label>`).join("")}</div></fieldset>`:""}
      ${up?`<label class="field">Full name<input name="full_name" id="au-name" required maxlength="120" autocomplete="name"></label>`:""}
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
      const r = await sb.auth.signUp({email,password:f.password.value,options:{data:{full_name:f.full_name.value.trim(),account_type:f.kind.value},emailRedirectTo:back}});
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
  return s==="approved" ? `<div class="ok" style="margin:12px 0">Your account is approved. Your profile and classes are public. <a href="#/teacher/${A.teacher.id}">See your public profile</a></div>`
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
      <div class="small" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="link-${x.id}" value="${esc(A.links[x.id]||"")}" placeholder="Lesson link (Zoom, Meet…): https://" aria-label="Lesson link for ${esc(c.title)}" style="flex:1;min-width:210px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><button class="btn ghost sm" onclick="saveLink('${x.id}')">Save link</button></div></div>
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
    <div class="tabs" role="tablist">${tab("teachers","Teachers ("+(A.rows||[]).length+")")}${tab("learners","Students and parents ("+(A.lrows||[]).length+")")}${tab("bookings","Bookings ("+(A.brows||[]).filter(b=>b.status==="booked" && Date.parse(b.starts_at)>Date.now()).length+" upcoming)")}</div>`;
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
    <div class="notice">${A.teacher?`You're signed in with a teacher account. <a href="#/studio">Open the teacher studio</a>`:A.admin?`You're signed in with the admin account. <a href="#/admin">Manage accounts</a>`:"This account has no profile yet."}</div></div>`;
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
  else if(!A.learner) block=`Lessons are booked from a student or parent account. You're signed in with ${A.teacher?"a teacher":"the admin"} account.`;
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

/* ---------- router + start ---------- */
const baseRender = render;
render = function(){
  const r=routeName();
  if(r==="admin" || r==="account"){
    $("#app").innerHTML = r==="admin" ? adminPage() : accountPage();
    document.querySelectorAll("nav.main a").forEach(a=>a.classList.toggle("on",a.dataset.r===r));
  } else baseRender();
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
      if(id && (["","account","studio"].includes(routeName()) || /access_token=/.test(location.hash))) location.hash = A.teacher ? "#/studio" : A.admin ? "#/admin" : "#/account";
    },0);
  });
  refresh();
})();
