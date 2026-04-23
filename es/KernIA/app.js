// ─── SUPABASE ─────
const SUPABASE_URL  = "https://cnrwvbbfftpfujguitvc.supabase.co";
const SUPABASE_ANON = "sb_publishable_kyblMJaYXRIhB3DF3rHw8A_Rm3Rl5aH";

// ─── HASH DEL CÓDIGO OWNER (solo este queda aquí, los beta están en Supabase) ──
// Genera tu hash en consola: await sha256("mob4pqfz6v6o")
const OWNER_HASH = "";

// ─── DATOS ─────────
const MODULOS = {
  SMR:     ["Montaje y mantenimiento","Sistemas operativos","Redes locales","Aplicaciones web","Seguridad básica","Servicios en red"],
  ASIR:    ["Implantación de S.O.","Planificación de redes","Gestión de BD","Servicios de red","Seguridad y alta disp.","Scripting"],
  DAW:     ["Diseño de interfaces","Entorno cliente (JS)","Entorno servidor (PHP)","Despliegue web","Bases de datos"],
  DAM:     ["Programación Java","Sistemas informáticos","Bases de datos","Acceso a datos","Interfaces (JavaFX)","Android"],
  General: [],
};
const QUICK = {
  SMR:     ["¿Cómo configuro una IP estática en Windows?","¿Qué es DHCP?","Diferencia HDD vs SSD","Switch vs router"],
  ASIR:    ["¿Cómo creo un usuario en Linux?","RAID 0, 1 y 5","¿Qué es Active Directory?","Script bash básico"],
  DAW:     ["GET vs POST","Sesiones en PHP","Modelo de cajas CSS","¿Qué es REST?"],
  DAM:     ["Herencia en Java","JDBC con MySQL","¿Qué es ArrayList?","Ciclo de vida Android"],
  General: ["¿Qué es la inteligencia artificial?","Explícame la relatividad","¿Cómo funciona internet?","Cuéntame algo curioso"],
};
const PROV_HINTS = {
  groq:   'gratis en <a href="https://console.groq.com" target="_blank">console.groq.com</a> → api keys',
  claude: 'en <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> → api keys',
  openai: 'en <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a> → api keys',
};
const PROVIDERS = {
  groq:   { url:"https://api.groq.com/openai/v1/chat/completions", model:"llama-3.3-70b-versatile" },
  claude: { url:"https://api.anthropic.com/v1/messages",           model:"claude-haiku-4-5-20251001" },
  openai: { url:"https://api.openai.com/v1/chat/completions",      model:"gpt-4o-mini" },
};
const MOOD_PROMPTS = {
  normal:  `responde en español claro y amigable, como un compañero que ya estudió el ciclo. usa ejemplos cuando ayude. completo pero sin relleno.`,
  directo: `responde en español de forma MUY directa y concisa. solo lo esencial, sin rodeos, sin introducciones, sin despedidas. si algo tiene 3 pasos, da 3 pasos. nada más.`,
  extremo: `responde en español con tono gruñón, impaciente y sarcástico, como si lo explicaras por milésima vez a un completo inútil. puedes insultar levemente de forma cómica (ej: "pedazo de alcornoque", "criatura", "dios mío qué nivel") pero siempre dando la respuesta correcta. el insulto es condimento, la respuesta es lo importante. eres brusco pero no cruel.`,
};

// ─── ESTADO ──────────────────
let ciclo         = null;
let loading       = false;
let provider      = "groq";
let apiKey        = "";
let currentConvId = null;
let userId        = null;
let currentMood   = "normal";
let realtimeCh    = null;

// ─── LOCAL STORAGE ──────────
const LS = {
  get:    k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set:    (k,v) => localStorage.setItem(k, JSON.stringify(v)),
  remove: k => localStorage.removeItem(k),
};

// ─── SHA-256 ───────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ─── SUPABASE FETCH ───────────
async function sbFetch(path, opts={}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers:{
        "Content-Type":"application/json",
        "apikey":SUPABASE_ANON,
        "Authorization":`Bearer ${SUPABASE_ANON}`,
        "Prefer":"return=representation",
        ...(opts.headers||{}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── SYNC PERFIL COMPLETO A SUPABASE ────────

async function syncPushProfile(p) {
  if (!userId) return;
  const avatar = LS.get("kernia_avatar"); // base64 (puede ser null)
  await sbFetch("kernia_users", {
    method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify({
      id:       userId,
      name:     p.name,
      birthday: p.birthday||null,
      email:    p.email||null,
      avatar_b64: avatar||null,
      is_owner: p.isOwner||false,
      is_beta:  p.isBeta||false,
      provider: provider,         // ← proveedor guardado
      updated_at: new Date().toISOString(),
    }),
  });
}

async function syncPullProfile() {
  if (!userId) return null;
  const data = await sbFetch(`kernia_users?id=eq.${userId}`);
  return data?.[0]||null;
}

// ─── SYNC CONVERSACIONES ───────
async function syncPushConv(conv) {
  if (!userId) return;
  await sbFetch("kernia_convs", {
    method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify({...conv, user_id:userId, updated_at:new Date().toISOString()}),
  });
}
async function syncDeleteConv(id) {
  if (userId) await sbFetch(`kernia_convs?id=eq.${id}`, {method:"DELETE"});
}
async function syncPullConvs() {
  if (!userId) return;
  const data = await sbFetch(`kernia_convs?user_id=eq.${userId}&order=updated_at.desc`);
  if (data) { LS.set("kernia_convs", data); renderHist(); }
}

// ─── REALTIME ────────
function setupVisibilitySync() {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      await syncPullConvs();
      // Si había una conv activa, recargar sus mensajes
      if (currentConvId) {
        const conv = getConv(currentConvId);
        if (conv) {
          const msgs = document.getElementById("msgs");
          const w    = document.getElementById("welcome");
          if (!w) {
            msgs.innerHTML = "";
            (conv.messages||[]).forEach(m=>addMsgDOM(m.role,m.content));
            msgs.scrollTop = msgs.scrollHeight;
          }
        }
      }
    }
  });
}

// ─── CONVERSACIONES ───────
function getConvs()   { return LS.get("kernia_convs")||[]; }
function saveConvs(c) { LS.set("kernia_convs",c); }
function getConv(id)  { return getConvs().find(c=>c.id===id)||null; }
function genId()      { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

async function upsertConv(conv) {
  const convs=getConvs(); const idx=convs.findIndex(c=>c.id===conv.id);
  if(idx>=0) convs[idx]=conv; else convs.unshift(conv);
  saveConvs(convs); await syncPushConv(conv);
}
async function deleteConv(id) { saveConvs(getConvs().filter(c=>c.id!==id)); await syncDeleteConv(id); }

// ─── PERFIL ─────
function getProfile()   { return LS.get("kernia_profile")||{}; }
function saveProfile(p) { LS.set("kernia_profile",p); }
function isBirthday(p)  {
  if(!p.birthday)return false;
  const h=new Date(); const[,mm,dd]=p.birthday.split("-");
  return parseInt(mm)===h.getMonth()+1&&parseInt(dd)===h.getDate();
}

// ─── AVATAR / FOTO ────────────
function handleAvatarUpload(input) {
  const file=input.files[0]; if(!file)return;
  // Limitar tamaño (~400KB)
  if (file.size > 400*1024) { alert("La imagen es muy grande. Usa una de menos de 400KB."); return; }
  const reader=new FileReader();
  reader.onload = async e => {
    const base64=e.target.result;
    LS.set("kernia_avatar",base64);
    // Actualizar preview en setup
    const prev=document.getElementById("setup-avatar-preview");
    if(prev) prev.innerHTML=`<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:2px">`;
    // Sincronizar con Supabase inmediatamente
    if (userId) { const p=getProfile(); p.avatar_b64=base64; await syncPushProfile(p); }
    applyAvatar();
  };
  reader.readAsDataURL(file);
}

function getGravatarURL(email) {
  if (!email||typeof md5==="undefined") return null;
  return `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?s=100&d=404`;
}

function applyAvatar() {
  const p        = getProfile();
  const base64   = LS.get("kernia_avatar");
  const gravURL  = getGravatarURL(p.email);
  const initials = (p.name||"??").slice(0,2).toUpperCase();

  const hav     = document.getElementById("header-avatar");
  const havText = document.getElementById("header-avatar-text");
  const pImg    = document.getElementById("profile-img");
  const pInit   = document.getElementById("profile-initials");

  if (havText) havText.textContent=initials;
  if (pInit)   pInit.textContent=initials;
  if (pImg)    pImg.style.display="none";

  const imgSrc = base64 || null;

  if (imgSrc) {
    if (hav)  hav.innerHTML=`<img src="${imgSrc}" alt="">`;
    if (pImg) { pImg.src=imgSrc; pImg.style.display="block"; if(pInit)pInit.style.display="none"; }
    return;
  }
  if (gravURL) {
    const test=new Image();
    test.onload=()=>{
      if(hav)  hav.innerHTML=`<img src="${gravURL}" alt="">`;
      if(pImg) { pImg.src=gravURL; pImg.style.display="block"; if(pInit)pInit.style.display="none"; }
    };
    test.src=gravURL;
  }
}

// ─── BADGES ────────────────────
function getBadgesHTML() {
  const p=getProfile(); const badges=[];
  if(p.isOwner)       badges.push(`<span class="badge-owner">★ owner</span>`);
  if(p.isBeta)        badges.push(`<span class="badge-beta">β beta</span>`);
  if(isBirthday(p))   badges.push(`<span class="badge-bday">🎂 cumple</span>`);
  return badges.join("");
}
function updateBadges() {
  const html=getBadgesHTML();
  ["user-badges","profile-badges-big"].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=html;});
  // Mostrar panel owner solo si es owner
  const ownerBtn=document.getElementById("btn-owner-panel");
  if (ownerBtn) ownerBtn.style.display=getProfile().isOwner?"block":"none";
}

// ─── UNLOCK (owner por hash local; beta por Supabase con límite de usos) ──────
function openUnlockModal() {
  document.getElementById("unlock-input").value="";
  document.getElementById("unlock-msg").textContent="";
  document.getElementById("modal-unlock").style.display="flex";
  setTimeout(()=>document.getElementById("unlock-input").focus(),100);
}
function closeUnlockModal() { document.getElementById("modal-unlock").style.display="none"; }

async function tryUnlock() {
  const code = document.getElementById("unlock-input").value.trim();
  if (!code) return;
  const hash = await sha256(code);
  const msg  = document.getElementById("unlock-msg");
  const p    = getProfile();


  if (hash === OWNER_HASH) {
    p.isOwner=true; p.isBeta=true; saveProfile(p);
    await syncPushProfile(p); // guardar en Supabase
    msg.style.color="var(--green)"; msg.textContent="✓ modo owner activado";
    updateBadges(); setTimeout(closeUnlockModal,1200); return;
  }


  msg.style.color="var(--muted)"; msg.textContent="verificando...";
  const rows = await sbFetch(`kernia_beta_codes?code_hash=eq.${hash}`);

  if (!rows?.length) {
    msg.style.color="var(--red)"; msg.textContent="código incorrecto."; return;
  }
  const row = rows[0];
  if (row.use_count >= row.max_uses) {
    msg.style.color="var(--red)"; msg.textContent="este código ya fue usado."; return;
  }
  if (p.isBeta) {
    msg.style.color="var(--purple)"; msg.textContent="ya tienes acceso beta."; return;
  }

  // Marcar como usado en Supabase
  await sbFetch(`kernia_beta_codes?id=eq.${row.id}`, {
    method:"PATCH",
    body:JSON.stringify({use_count:row.use_count+1, used_by:userId, used_at:new Date().toISOString()}),
  });

  p.isBeta=true; saveProfile(p);
  await syncPushProfile(p); // guardar badge en Supabase
  msg.style.color="var(--purple)"; msg.textContent="✓ acceso beta activado";
  updateBadges(); setTimeout(closeUnlockModal,1200);
}

// ─── PANEL OWNER ────────────────
async function openOwnerModal() {
  document.getElementById("owner-code-msg").textContent = "";
  document.getElementById("owner-code-label").value = "";
  document.getElementById("owner-code-pass").value  = "";
  document.getElementById("modal-owner").style.display = "flex";
  await renderBetaCodes();
}
function closeOwnerModal() { document.getElementById("modal-owner").style.display="none"; }

async function renderBetaCodes() {
  const list = document.getElementById("owner-codes-list");
  list.innerHTML = `<div style="font-size:10px;color:var(--muted)">cargando...</div>`;
  const rows = await sbFetch("kernia_beta_codes?order=id.asc");
  if (!rows?.length) { list.innerHTML=`<div style="font-size:10px;color:var(--dim)">no hay códigos todavía.</div>`; return; }
  list.innerHTML = rows.map(r => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 7px;background:var(--surf2);border:1px solid var(--border);border-radius:2px">
      <span style="font-size:11px;color:var(--text);flex:1">${escHtml(r.label||"sin nombre")}</span>
      <span style="font-size:9px;padding:1px 6px;border-radius:2px;${r.use_count>=r.max_uses
        ? "background:rgba(224,85,85,.1);color:var(--red);border:1px solid rgba(224,85,85,.3)"
        : "background:rgba(57,211,83,.08);color:var(--green);border:1px solid rgba(57,211,83,.25)"
      }">${r.use_count>=r.max_uses ? "usado" : "disponible"}</span>
      ${r.used_by ? `<span style="font-size:9px;color:var(--muted)">→ ${r.used_by.slice(0,8)}…</span>` : ""}
      <button onclick="deleteBetaCode(${r.id})" style="font-family:var(--font);font-size:9px;background:none;border:none;color:var(--muted);cursor:pointer;padding:0 3px" title="borrar">✕</button>
    </div>`).join("");
}

async function createBetaCode() {
  const label = document.getElementById("owner-code-label").value.trim();
  const pass  = document.getElementById("owner-code-pass").value.trim();
  const msg   = document.getElementById("owner-code-msg");

  if (!label || !pass) { msg.style.color="var(--red)"; msg.textContent="rellena los dos campos."; return; }
  if (pass.length < 6) { msg.style.color="var(--red)"; msg.textContent="la contraseña debe tener al menos 6 caracteres."; return; }

  msg.style.color="var(--muted)"; msg.textContent="creando...";

  const hash = await sha256(pass);

  const result = await sbFetch("kernia_beta_codes", {
    method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify({ code_hash:hash, label, max_uses:1, use_count:0 }),
  });

  if (result) {
    msg.style.color="var(--green)";
    msg.textContent=`✓ código "${label}" creado. dale la contraseña a tu amigo.`;
    document.getElementById("owner-code-label").value="";
    document.getElementById("owner-code-pass").value="";
    await renderBetaCodes();
  } else {
    msg.style.color="var(--red)";
    msg.textContent="error al crear el código. puede que ya exista esa contraseña.";
  }
}

async function deleteBetaCode(id) {
  if (!confirm("¿Borrar este código?")) return;
  await sbFetch(`kernia_beta_codes?id=eq.${id}`, {method:"DELETE"});
  await renderBetaCodes();
}

// ─── CUMPLEAÑOS ──────────────
function showBdayBanner(name) { document.getElementById("bday-banner-name").textContent=name; document.getElementById("bday-banner").style.display="block"; }
function showBdayModal(name)  { document.getElementById("bday-name-txt").textContent=name; document.getElementById("modal-bday").style.display="flex"; }
function closeBdayModal()     { document.getElementById("modal-bday").style.display="none"; }

// ─── MODO EXTREMO ────────────────
function requestExtremo() { if(currentMood==="extremo"){setMood("normal");return;} document.getElementById("modal-extremo").style.display="flex"; }
function cancelExtremo()  { document.getElementById("modal-extremo").style.display="none"; }
function confirmExtremo() { document.getElementById("modal-extremo").style.display="none"; setMood("extremo"); }

function setMood(mood) {
  currentMood=mood; LS.set("kernia_mood",mood);
  document.querySelectorAll(".mood-btn").forEach(b=>b.classList.toggle("active",b.dataset.mood===mood));
  const badge=document.getElementById("mood-badge"); badge.textContent=mood; badge.className=`badge b-mood-${mood}`;
  const sym=document.getElementById("prompt-sym"); const irow=document.getElementById("irow");
  if(mood==="extremo"){sym.className="prompt-sym angry";sym.textContent="!";irow.className="irow mood-extremo";}
  else{sym.className="prompt-sym";sym.textContent="$";irow.className="irow";}
}

// ─── PANEL PERFIL  ───────────────────────────
function openProfile() {
  const p=getProfile(); const convs=getConvs();
  const cicloCount={};convs.forEach(c=>{cicloCount[c.ciclo]=(cicloCount[c.ciclo]||0)+1;});
  const topCiclo=Object.entries(cicloCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";

  document.getElementById("profile-name-big").textContent=p.name||"—";
  document.getElementById("pf-name").textContent  = p.name    ||"—";
  document.getElementById("pf-bday").textContent  = p.birthday?formatBday(p.birthday):"no especificado";
  document.getElementById("pf-ciclo").textContent = topCiclo;
  document.getElementById("pf-convs").textContent = convs.length;
  document.getElementById("pf-prov").textContent  = provider||"groq";
  document.getElementById("pf-mood").textContent  = currentMood;
  document.getElementById("pf-uid").textContent   = userId||"—";
  const init=document.getElementById("profile-initials"); if(init)init.textContent=(p.name||"??").slice(0,2).toUpperCase();

  updateBadges(); applyAvatar();
  document.getElementById("view-chat").style.display="none";
  document.getElementById("view-profile").style.display="flex";
}
function closeProfile() {
  document.getElementById("view-profile").style.display="none";
  document.getElementById("view-chat").style.display="flex";
}
function editProfile() {
  const p=getProfile();
  document.getElementById("setup-name").value  =p.name    ||"";
  document.getElementById("setup-email").value =p.email   ||"";
  document.getElementById("setup-bday").value  =p.birthday||"";
  document.getElementById("setup-key").value   ="";
  closeProfile(); document.getElementById("modal-setup").style.display="flex";
}
function confirmReset() {
  if(!confirm("¿Seguro? Se borrarán todos tus datos locales."))return;
  ["kernia_profile","kernia_convs","kernia_uid","kernia_key","kernia_provider","kernia_mood","kernia_bday_shown","kernia_avatar"].forEach(k=>LS.remove(k));
  location.reload();
}
function copyUID() {
  const uid=userId||LS.get("kernia_uid"); if(!uid)return;
  navigator.clipboard.writeText(uid).then(()=>{
    const btn=document.getElementById("pf-copy-btn"); btn.textContent="✓ copiado";
    setTimeout(()=>{btn.textContent="copiar código";},2000);
  });
}

// ─── SETUP ───────────────
function openSetupModal() { selProv("groq"); document.getElementById("modal-setup").style.display="flex"; setTimeout(()=>document.getElementById("setup-name").focus(),100); }
function switchToImport() { document.getElementById("modal-setup").style.display="none"; document.getElementById("import-uid").value=""; document.getElementById("import-err").textContent=""; document.getElementById("modal-import").style.display="flex"; setTimeout(()=>document.getElementById("import-uid").focus(),100); }
function switchToSetup()  { document.getElementById("modal-import").style.display="none"; document.getElementById("modal-setup").style.display="flex"; }

async function saveSetup() {
  const name =document.getElementById("setup-name").value.trim();
  const email=document.getElementById("setup-email").value.trim();
  const bday =document.getElementById("setup-bday").value;
  const key  =document.getElementById("setup-key").value.trim();
  if(!name){document.getElementById("setup-name").focus();return;}

  userId=LS.get("kernia_uid")||genId(); LS.set("kernia_uid",userId);
  const oldP=getProfile();
  const profile={...oldP, name,email:email||null,birthday:bday||null,setupDone:true};
  saveProfile(profile);

  if(key){ apiKey=key; LS.set("kernia_key",key); LS.set("kernia_provider",provider); updateKeyBtn(true); }

  document.getElementById("modal-setup").style.display="none";
  applyProfile(profile);
  await syncPushProfile(profile); // ← guarda TODO en Supabase
  if(isBirthday(profile)){showBdayBanner(profile.name);setTimeout(()=>showBdayModal(profile.name),400);}
}

async function importAccount() {
  const uid=document.getElementById("import-uid").value.trim(); if(!uid)return;
  document.getElementById("import-err").textContent="buscando...";
  const data=await sbFetch(`kernia_users?id=eq.${uid}`);
  if(!data?.length){document.getElementById("import-err").textContent="código no encontrado.";return;}

  userId=uid; LS.set("kernia_uid",uid);
  const remote=data[0];

  // Restaurar TODO desde Supabase: nombre, email, avatar, badges, proveedor
  const p={
    name:      remote.name,
    email:     remote.email||null,
    birthday:  remote.birthday||null,
    isOwner:   remote.is_owner||false,
    isBeta:    remote.is_beta||false,
    setupDone: true,
  };
  saveProfile(p);

  // Restaurar avatar si hay en Supabase
  if (remote.avatar_b64) { LS.set("kernia_avatar", remote.avatar_b64); }

  // Restaurar proveedor preferido
  if (remote.provider) {
    provider=remote.provider; LS.set("kernia_provider",provider); selProv(provider);
  }

  applyProfile(p);
  document.getElementById("modal-import").style.display="none";
  await syncPullConvs();
  const convs=getConvs(); if(convs.length)loadConv(convs[0].id);
  if(isBirthday(p)){showBdayBanner(p.name);setTimeout(()=>showBdayModal(p.name),400);}
}

// ─── API KEY ────────────────
function openKeyModal()  { selProv(provider); document.getElementById("key-input").value=apiKey; document.getElementById("modal-key").style.display="flex"; }
function closeKeyModal() { document.getElementById("modal-key").style.display="none"; }
function saveKey() {
  const k=document.getElementById("key-input").value.trim(); if(!k)return;
  apiKey=k; LS.set("kernia_key",k); LS.set("kernia_provider",provider);
  updateKeyBtn(true); closeKeyModal();
  // Guardar proveedor en Supabase también
  const p=getProfile(); syncPushProfile(p);
}
function updateKeyBtn(has) { const btn=document.getElementById("key-btn"); btn.textContent=has?"✓ key configurada":"⚙ api key"; btn.classList.toggle("set",has); }
function selProv(p) {
  provider=p;
  document.querySelectorAll(".prov").forEach(b=>b.classList.toggle("on",b.dataset.p===p));
  const hint=PROV_HINTS[p];
  ["setup-prov-hint","key-prov-hint"].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=hint;});
}
function applyProfile(p) { document.getElementById("header-name").textContent=p.name||"—"; updateBadges(); applyAvatar(); }

// ─── HISTORIAL ─────────────
function renderHist() {
  const convs=getConvs(); const list=document.getElementById("hist-list");
  if(!convs.length){list.innerHTML=`<div class="hist-empty">aquí aparecerán<br>tus conversaciones</div>`;return;}
  list.innerHTML=convs.map(c=>`
    <div class="hist-item ${c.id===currentConvId?"active":""}" onclick="loadConv('${c.id}')">
      <div class="hist-item-title">${escHtml(c.title||"sin título")}</div>
      <div class="hist-item-meta">
        <span class="hist-item-ciclo ${c.ciclo}">${c.ciclo}</span>
        <span class="hist-item-date">${formatDate(c.updated_at||c.date)}</span>
        <button class="hist-del" onclick="event.stopPropagation();removeConv('${c.id}')">✕</button>
      </div>
    </div>`).join("");
}
function loadConv(id) {
  const conv=getConv(id); if(!conv)return;
  currentConvId=id; ciclo=conv.ciclo;
  document.querySelectorAll(".cbtn").forEach(b=>b.classList.toggle("on",b.dataset.c===ciclo));
  const badge=document.getElementById("ciclo-badge"); badge.textContent=ciclo; badge.className=`badge b-${ciclo}`;
  updateSidebar(ciclo);
  const msgs=document.getElementById("msgs"); const w=document.getElementById("welcome"); if(w)w.remove();
  msgs.innerHTML="";
  (conv.messages||[]).forEach(m=>addMsgDOM(m.role,m.content));
  msgs.scrollTop=msgs.scrollHeight; renderHist();
}
async function removeConv(id) { await deleteConv(id); if(currentConvId===id)newChat(); else renderHist(); }
function newChat() {
  currentConvId=null; ciclo=null;
  document.querySelectorAll(".cbtn").forEach(b=>b.classList.remove("on"));
  const badge=document.getElementById("ciclo-badge"); badge.textContent="ninguno"; badge.className="badge b-none";
  document.getElementById("msgs").innerHTML=welcomeHTML(); renderHist();
}
function welcomeHTML() {
  return `<div class="welcome" id="welcome">
    <div class="w-ascii">┌──────────────────────────┐\n│     KERNIA · FP · IA     │\n│  SMR · ASIR · DAW · DAM  │\n└──────────────────────────┘</div>
    <div class="wlogo">Kern<span>IA</span></div>
    <div class="wsub">selecciona tu ciclo para empezar.</div>
    <div class="wciclos">
      <button class="wc" data-c="SMR"     onclick="selCiclo('SMR')">SMR</button>
      <button class="wc" data-c="ASIR"    onclick="selCiclo('ASIR')">ASIR</button>
      <button class="wc" data-c="DAW"     onclick="selCiclo('DAW')">DAW</button>
      <button class="wc" data-c="DAM"     onclick="selCiclo('DAM')">DAM</button>
      <button class="wc" data-c="General" onclick="selCiclo('General')" style="border-color:var(--muted);color:var(--muted)">General</button>
    </div>
  </div>`;
}

// ─── CICLO ─────────────────────
function selCiclo(c) {
  ciclo=c; closeProfile();
  document.querySelectorAll(".cbtn").forEach(b=>b.classList.toggle("on",b.dataset.c===c));
  const badge=document.getElementById("ciclo-badge"); badge.textContent=c; badge.className=`badge b-${c}`;
  updateSidebar(c);
  const welcome=document.getElementById("welcome");
  if(welcome){
    welcome.remove(); const p=getProfile(); currentConvId=genId();
    const conv={id:currentConvId,ciclo:c,title:`${c} · nueva`,messages:[],updated_at:new Date().toISOString()};
    upsertConv(conv); renderHist();
    const greeting=c==="General"
      ?`modo general activado\n\n${p.name?`hola ${p.name}, `:""}pregúntame lo que quieras.`
      :`sistema iniciado · ciclo ${c}\n\n${p.name?`hola ${p.name}, `:""}pregunta lo que quieras. respuestas basadas en el temario oficial del BOE.`;
    addMsgDOM("assistant",greeting); saveMessageToConv("assistant",greeting);
  }
}
function updateSidebar(c) {
  document.getElementById("mod-list").innerHTML=c==="General"
    ?`<div class="mod" style="color:var(--muted);font-size:10px">modo sin restricciones<br>pregunta cualquier cosa</div>`
    :(MODULOS[c]||[]).map(m=>`<div class="mod" onclick="qa('explícame el módulo de ${m} en ${c}')">${m}</div>`).join("");
  document.getElementById("quick-list").innerHTML=(QUICK[c]||[]).map(q=>`<button class="qbtn" onclick="qa('${q}')">${q}</button>`).join("");
}

// ─── RAG ───────────────────────────
async function buscarContexto(pregunta) {
  if(ciclo==="General")return[];
  try {
    const res=await fetch("https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inputs:pregunta})});
    const vector=(await res.json())[0]; if(!vector)return[];
    const res2=await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_temario`,{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${SUPABASE_ANON}`},
      body:JSON.stringify({query_embedding:vector,ciclo_filtro:ciclo,num_resultados:3}),
    });
    const data=await res2.json();
    return Array.isArray(data)?data.filter(f=>(f.similitud||0)>0.35):[];
  } catch{return[];}
}

// ─── LLM ─────────────────────
async function llamarLLM(pregunta,fragmentos) {
  const prov=PROVIDERS[provider]; const p=getProfile();
  const isGeneral=ciclo==="General";
  const base=isGeneral
    ?`eres KernIA, un asistente de propósito general.${p.name?` usuario: ${p.name}.`:""}`
    :`eres KernIA, asistente de fp informática en españa. ciclo: ${ciclo}.${p.name?` usuario: ${p.name}.`:""}`;
  const system=`${base}\n${MOOD_PROMPTS[currentMood]}${fragmentos.length?"\ncita el módulo entre paréntesis si usas el temario.":""}`;

  const conv=getConv(currentConvId);
  const history=(conv?.messages||[]).slice(-6)
    .map(m=>({role:m.role==="ai"?"assistant":m.role,content:m.content}))
    .filter(m=>m.role==="user"||m.role==="assistant");

  const ctx=fragmentos.length?"contexto del temario:\n"+fragmentos.map((f,i)=>`[${i+1}](${f.modulo}): ${f.contenido.slice(0,280)}`).join("\n")+"\n\n":"";
  const msgs=[...history,{role:"user",content:ctx+pregunta}];

  if(provider==="claude"){
    const res=await fetch(prov.url,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:prov.model,max_tokens:900,system,messages:msgs})});
    const d=await res.json(); if(d.error)throw new Error(d.error.message); return d.content?.[0]?.text;
  }
  const res=await fetch(prov.url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},body:JSON.stringify({model:prov.model,max_tokens:900,temperature:0.7,messages:[{role:"system",content:system},...msgs]})});
  const d=await res.json(); if(d.error)throw new Error(d.error.message); return d.choices?.[0]?.message?.content;
}

// ─── MENSAJES ────────────────────
async function saveMessageToConv(role,content) {
  if(!currentConvId)return; const conv=getConv(currentConvId); if(!conv)return;
  const safeRole=role==="ai"?"assistant":role;
  conv.messages.push({role:safeRole,content});
  if(safeRole==="user"&&conv.messages.filter(m=>m.role==="user").length===1)
    conv.title=content.slice(0,45)+(content.length>45?"…":"");
  conv.updated_at=new Date().toISOString();
  await upsertConv(conv); renderHist();
}

function fmt(t){return t.replace(/```([\s\S]*?)```/g,"<pre>$1</pre>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>");}

function addMsgDOM(role,text,sources=[]) {
  const isUser=role==="user"; const msgs=document.getElementById("msgs");
  const d=document.createElement("div"); const p=getProfile();
  d.className=`msg ${isUser?"user":"ai"}${!isUser&&currentMood==="extremo"?" mood-extremo":""}`;
  const srcs=sources.length?`<div class="sources">${sources.map(s=>`<span class="src">${s.ciclo}·${s.modulo}</span>`).join("")}</div>`:"";
  const nameHtml=isUser?`<span class="mprompt">~$</span> ${p.name||"tú"}`:`<span class="mprompt">${currentMood==="extremo"?"!":">"}</span> kernia · ${ciclo??""}`;
  d.innerHTML=`<div class="av">${isUser?"YOU":" AI"}</div><div class="mbody"><div class="mname">${nameHtml}</div><div class="mtext">${fmt(text)}</div>${srcs}</div>`;
  msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; return d;
}

function addTyping() {
  const msgs=document.getElementById("msgs"); const d=document.createElement("div");
  d.id="typing"; d.className=`msg ai${currentMood==="extremo"?" mood-extremo":""}`;
  d.innerHTML=`<div class="av"> AI</div><div class="mbody"><div class="mname"><span class="mprompt">${currentMood==="extremo"?"!":">"}</span> ${currentMood==="extremo"?"procesando (qué pereza)...":"buscando en temario..."}</div><div class="mtext tdot"><span>·</span><span>·</span><span>·</span></div></div>`;
  msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; return d;
}

// ─── ENVIAR ───────────────────────
async function send() {
  if(loading)return;
  const inp=document.getElementById("inp"); const text=inp.value.trim();
  if(!text)return;
  if(!ciclo) {addMsgDOM("assistant","selecciona tu ciclo primero.");return;}
  if(!apiKey){openKeyModal();return;}
  inp.value=""; inp.style.height="auto";
  addMsgDOM("user",text); await saveMessageToConv("user",text);
  loading=true; document.getElementById("sbtn").disabled=true;
  const typing=addTyping();
  try {
    const fragmentos=await buscarContexto(text);
    const respuesta=await llamarLLM(text,fragmentos);
    typing.remove(); addMsgDOM("assistant",respuesta,fragmentos); await saveMessageToConv("assistant",respuesta);
  } catch(e){typing.remove();addMsgDOM("assistant",`error: ${e.message}\n\nrevisa tu api key.`);}
  loading=false; document.getElementById("sbtn").disabled=false; inp.focus();
}
function qa(q){document.getElementById("inp").value=q;send();}

// ─── UTILS ───────────────────
function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(iso){if(!iso)return"";const d=new Date(iso);return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(-2)}`;}
function formatBday(iso){const[,mm,dd]=iso.split("-");const m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];return `${parseInt(dd)} ${m[parseInt(mm)-1]}`;}

// ─── INIT ────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const inp=document.getElementById("inp");
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
  inp.addEventListener("input",()=>{inp.style.height="auto";inp.style.height=Math.min(inp.scrollHeight,100)+"px";});

  provider=LS.get("kernia_provider")||"groq";
  apiKey  =LS.get("kernia_key")||"";
  userId  =LS.get("kernia_uid")||null;
  selProv(provider);
  if(apiKey)updateKeyBtn(true);
  setMood(LS.get("kernia_mood")||"normal");

  // Activar sync entre tabs/dispositivos al volver a la página
  setupVisibilitySync();

  const profile=getProfile();
  if(!profile.setupDone){
    openSetupModal();
  } else {
    applyProfile(profile);
    await syncPullConvs();

    if(isBirthday(profile)){
      showBdayBanner(profile.name);
      const lastShown=LS.get("kernia_bday_shown"); const today=new Date().toDateString();
      if(lastShown!==today){LS.set("kernia_bday_shown",today);setTimeout(()=>showBdayModal(profile.name),600);}
    }
    const convs=getConvs(); if(convs.length)loadConv(convs[0].id);
  }
});
