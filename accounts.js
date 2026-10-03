/* SeastackSchool accounts: real teacher accounts, their classes, and admin management (Supabase).
   Loaded after the page script in index.html; it replaces the prototype's teacher studio and adds #/admin. */
const SB_URL = "https://xzmamfglxmjjxjsetuaa.supabase.co";
const SB_KEY = "sb_publishable_J6pwCLXOBOp2hXlI183_dw_m06F6Jhh";
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const A = {user:null, teacher:null, admin:false, classes:[], rows:null, mode:"signin", msg:"", err:"", recovery:false, filter:"pending", removing:null};

/* ---------- helpers ---------- */
function ratingLabel(tid){ return reviewsFor(tid).length ? `<span class="stars">★</span> ${rating(tid).toFixed(1)}` : `<span class="muted">New</span>` }
function tzOffset(tz){
  try{ const d=new Date(); return Math.round((new Date(d.toLocaleString("en-US",{timeZone:tz})) - new Date(d.toLocaleString("en-US",{timeZone:"UTC"})))/9e5)/4 }
  catch(e){ return 0 }
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
  const [t,c] = await Promise.all([sb.from("teachers").select("*").eq("status","approved"), sb.from("classes").select("*")]);
  if(t.error || c.error) return;
  for(const arr of [TEACHERS,CLASSES]) for(let i=arr.length-1;i>=0;i--) if(arr[i].real) arr.splice(i,1);
  const ok = new Set();
  t.data.forEach(x=>{ ok.add(x.id); TEACHERS.push({id:x.id,real:true,name:x.full_name||"New teacher",city:x.city,offset:tzOffset(x.timezone),color:"#C9D6F2",
    years:x.years_experience,langs:x.languages||[],subjects:[],rating:0,intro:x.intro,exp:x.experience}) });
  c.data.filter(x=>ok.has(x.teacher_id)).forEach(x=>CLASSES.push(toClass(x)));
}
async function loadMe(){
  const {data:{session}} = await sb.auth.getSession();
  A.user = session?.user || null; A.teacher=null; A.admin=false; A.classes=[]; A.rows=null;
  if(!A.user) return;
  const [t,adm,c] = await Promise.all([
    sb.from("teachers").select("*").eq("id",A.user.id).maybeSingle(),
    sb.rpc("is_admin"),
    sb.from("classes").select("*").eq("teacher_id",A.user.id).order("created_at")]);
  A.teacher = t.data || null; A.admin = adm.data === true; A.classes = c.data || [];
  if(A.admin) await loadAdmin();
}
async function loadAdmin(){ const r = await sb.rpc("admin_list_teachers"); if(r.error) toast(r.error.message); else A.rows = r.data }
async function refresh(){ await loadMe(); await loadPublic(); chrome(); render() }

/* ---------- header ---------- */
function chrome(){
  let a = $("#acct");
  if(!a){ a=document.createElement("a"); a.id="acct"; a.className="btn sm ghost"; $(".top .wrap").appendChild(a) }
  a.href = A.admin && !A.teacher ? "#/admin" : "#/studio";
  a.textContent = !A.user ? "Teacher sign in" : A.admin && !A.teacher ? "Admin" : "My teacher account";
  let n = $("#navadmin");
  if(A.admin && !n){ n=document.createElement("a"); n.id="navadmin"; n.href="#/admin"; n.dataset.r="admin"; n.textContent="Manage teachers"; $("nav.main").appendChild(n) }
  if(!A.admin && n) n.remove();
}

/* ---------- sign in / sign up ---------- */
function authPage(){
  const up=A.mode==="signup", fg=A.mode==="forgot";
  const sw = m => `A.mode='${m}';A.err='';A.msg='';render()`;
  return `<div class="wrap page"><div class="box" style="max-width:460px;margin:0 auto">
    <h2>${up?"Create your teacher account":fg?"Reset your password":"Teacher sign in"}</h2>
    <p class="muted">${up?"Every account is reviewed before the teacher's profile and classes go public.":fg?"Enter your email and we'll send you a link to set a new password.":"Sign in to edit your profile and manage your classes."}</p>
    ${A.msg?`<div class="ok" style="margin-bottom:12px">${esc(A.msg)}</div>`:""}
    <form id="authf" onsubmit="event.preventDefault();authSubmit(this)" style="display:flex;flex-direction:column;gap:10px">
      ${up?`<label class="field">Full name<input name="full_name" id="au-name" required maxlength="120" autocomplete="name"></label>`:""}
      <label class="field">Email<input name="email" id="au-email" type="email" required autocomplete="email"></label>
      ${fg?"":`<label class="field">Password${up?" (at least 8 characters)":""}<input name="password" id="au-pass" type="password" required minlength="${up?8:1}" autocomplete="${up?"new-password":"current-password"}"></label>`}
      <div class="err" id="autherr">${esc(A.err)}</div>
      <button class="btn" id="authbtn" style="align-self:flex-start">${up?"Create account":fg?"Send reset link":"Sign in"}</button>
    </form>
    <p class="small" style="margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap">
      ${up||fg?`<button class="btn ghost sm" onclick="${sw("signin")}">I already have an account</button>`:`<button class="btn ghost sm" onclick="${sw("signup")}">Create a teacher account</button><button class="btn ghost sm" onclick="${sw("forgot")}">Forgot password</button>`}
    </p>
  </div></div>`;
}
async function authSubmit(f){
  const btn=$("#authbtn"), email=f.email.value.trim(), back=location.origin+location.pathname;
  btn.disabled=true; A.err=""; A.msg="";
  let error=null;
  if(A.mode==="signup"){
    const r = await sb.auth.signUp({email,password:f.password.value,options:{data:{full_name:f.full_name.value.trim()},emailRedirectTo:back}});
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
  if(error) A.err = /not confirmed/i.test(error.message) ? "Confirm your email first: open the link we sent you, then sign in." :
                    /invalid login/i.test(error.message) ? "That email and password don't match an account." : error.message;
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
    <div class="notice">${A.admin?`This is an admin account, so it has no teacher profile. <a href="#/admin">Manage teachers</a>`:"This account has no teacher profile."}</div></div>`;
  const tabs=[["profile","My profile"],["list","My classes"],["plan","Weekly planner"],["grades","Students & grades"],["res","Resources"]];
  if(!tabs.some(t=>t[0]===TAB)) TAB="profile";
  const local = `<p class="small muted">This tool is saved in this browser only for now.</p>`;
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">Teacher studio</h2>${who}</div>
    ${statusBanner()}
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${TAB===k}" onclick="TAB='${k}';render()">${l}</button>`).join("")}</div>
    ${TAB==="profile"?profileForm():TAB==="list"?listings():TAB==="plan"?local+planner():TAB==="grades"?local+gradebook():local+resources()}
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
      <div class="small muted">${esc(c.subject)} · taught in ${esc(c.lang)} · ${c.level} · ${ageLabel(c.ages)} · ${money(c.price)} per lesson · ${x.days.map(d=>DAY3[d]).join(", ")} at ${x.start_time.slice(0,5)} (your time) · ${c.mins} min</div></div>
    <button class="btn ghost sm" onclick="removeClass('${x.id}')">${A.removing===x.id?"Confirm remove":"Remove"}</button></div>` }).join("")}</div>`;
}
addListing = async function(f){
  const days=[...f.querySelectorAll("[name=day]:checked")].map(x=>+x.value);
  if(!days.length) return toast("Choose at least one day");
  const type=f.type.value, a0=+f.a0.value, a1=Math.min(99,+f.a1.value||99);
  if(a1<a0) return toast("Oldest age must be the same as or above the youngest age");
  const row={teacher_id:A.user.id,title:f.title.value.trim(),subject:f.subject.value.trim(),language:f.lang.value.trim(),type,price:+f.price.value,
    capacity:type==="private"?1:Math.max(2,+f.cap.value||6),level:f.level.value,age_min:a0,age_max:a1,days,start_time:f.time.value,duration_min:+f.mins.value};
  const r = await sb.from("classes").insert(row);
  if(r.error) return toast(/row-level security/i.test(r.error.message) ? "Your account can't add classes right now" : r.error.message);
  await loadMe(); await loadPublic(); toast("Class saved"); render();
};
async function removeClass(id){
  if(A.removing!==id){ A.removing=id; render(); return }
  A.removing=null;
  const r = await sb.from("classes").delete().eq("id",id);
  if(r.error) return toast(r.error.message);
  await loadMe(); await loadPublic(); toast("Class removed"); render();
}
startTeaching = function(){ TAB = A.teacher && A.teacher.full_name.trim() ? "list" : "profile" };

/* ---------- admin: manage teachers ---------- */
function adminPage(){
  if(!A.admin) return `<div class="wrap page"><h2>Manage teachers</h2><div class="notice">This page is for SeastackSchool admins. ${A.user?"You're signed in as "+esc(A.user.email)+".":`<a href="#/studio">Sign in</a>`}</div></div>`;
  const rows=A.rows||[], n=s=>rows.filter(r=>r.status===s).length;
  const list=A.filter==="all"?rows:rows.filter(r=>r.status===A.filter);
  const chip=(k,l)=>`<button class="chip" aria-pressed="${A.filter===k}" onclick="A.filter='${k}';render()">${l}</button>`;
  const pill=s=>`<span class="tag ${s==="approved"?"ok":s==="suspended"?"bad":"group"}">${s[0].toUpperCase()+s.slice(1)}</span>`;
  const act=(id,s,l,ghost)=>`<button class="btn sm ${ghost?"ghost":""}" onclick="setStatus('${id}','${s}')">${l}</button>`;
  return `<div class="wrap page">
    <div class="results-head"><h2 style="margin:0">Manage teachers</h2>
      <span class="small muted" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${esc(A.user.email)} <button class="btn ghost sm" onclick="signOut()">Sign out</button></span></div>
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

/* ---------- booking: real classes can't be booked yet ---------- */
const baseOpenBooking = openBooking;
openBooking = function(cid,key){
  const c=cls(cid);
  if(!c || !c.real) return baseOpenBooking(cid,key);
  const t=teacher(c.t);
  $("#dlgBody").innerHTML = `<div class="dlg-head"><div><span class="tag ${c.type}">${typeLabel(c)}</span><h3 style="margin-top:6px">${esc(c.title)}</h3>
    <div class="small">with <a href="#/teacher/${t.id}" onclick="$('#dlg').close()">${esc(t.name)}</a> · ${c.mins} min · ${money(c.price)} · ${ageLabel(c.ages)}</div></div>
    <button class="x" onclick="$('#dlg').close()" aria-label="Close">×</button></div>
    <div class="notice">Booking and payment are not open yet. This class is listed by a real teacher, and you'll be able to book it here soon.</div>`;
  BK={}; $("#dlg").showModal();
};

/* ---------- router + start ---------- */
const baseRender = render;
render = function(){
  if(routeName()==="admin"){
    $("#app").innerHTML = adminPage();
    document.querySelectorAll("nav.main a").forEach(a=>a.classList.toggle("on",a.dataset.r==="admin"));
  } else baseRender();
};
(function start(){
  S.myClasses=[]; if(S.role==="teacher"){ S.role="learner"; $("#role").value="learner" } save();
  TAB="profile";
  const h=location.hash;
  if(/error_description=/.test(h)){
    A.err = decodeURIComponent((h.match(/error_description=([^&]*)/)||[])[1]||"").replace(/\+/g," ") + ". Ask for a new link and try again.";
    location.hash="#/studio";
  }
  chrome(); render();
  if(!sb) return;
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){ A.recovery=true; location.hash="#/studio" }
    const id=session?.user?.id||null;
    if(id!==(A.user?.id||null) || event==="PASSWORD_RECOVERY") setTimeout(async()=>{
      await refresh();
      if(id && (routeName()==="" || /access_token=/.test(location.hash))) location.hash = A.admin && !A.teacher ? "#/admin" : "#/studio";
    },0);
  });
  refresh();
})();
