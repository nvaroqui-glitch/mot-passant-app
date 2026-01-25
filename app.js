import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";
console.log("app.js chargé");
/** ================================
 *  CONFIG (à remplacer)
 *  ================================ */
const SUPABASE_URL = "https://xpvjiyvdvppnfqtbiqop.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdmppeXZkdnBwbmZxdGJpcW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDIzMDcsImV4cCI6MjA4MzUxODMwN30.Z3UtX7fqGmgTVeusZMwBa345S5WZKqzXBPSAZIp4v8A";

/** ================================
 *  SUPABASE CLIENT
 *  ================================ */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
async function handleMagicLink() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.error("[exchangeCodeForSession]", error);

      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    }
  } catch (e) {
    console.error("[handleMagicLink]", e);
  }
}

// lance le traitement du lien magique dès le chargement
(async () => { await handleMagicLink(); })();
/** ================================
 *  DOM HELPERS (défensifs)
 *  ================================ */
const $ = (id) => document.getElementById(id);

function show(el){ el.classList.remove("hide"); }
function hide(el){ el.classList.add("hide"); }

function setStatus(el, message, ok=true){
  el.textContent = message || "";
  el.classList.toggle("ok", !!message && ok);
  el.classList.toggle("bad", !!message && !ok);
}

function clearNode(node){
  while(node.firstChild) node.removeChild(node.firstChild);
}

function fmtDate(iso){
  try { return new Date(iso).toLocaleString("fr-FR"); }
  catch { return ""; }
}

function safeText(v, fallback=""){
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function clampLen(str, max){
  const s = safeText(str);
  return s.length > max ? (s.slice(0, max) + "…") : s;
}

/** ================================
 *  VALIDATION / DEFENSE
 *  ================================ */
const LIMITS = {
  addressMax: 240,
  contextMax: 2000,
  remarkMax: 2000
};

function isValidEmail(email){
  // Simple & safe (pas parfait, mais suffisant)
  const e = safeText(email).trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function nowMs(){ return Date.now(); }

// Mini anti-spam client (ne remplace PAS RLS)
const cooldown = {
  magic: 0,
  submit: 0,
  remark: 0,
  refresh: 0
};
function canRun(key, waitMs){
  const t = nowMs();
  if (t < (cooldown[key] || 0)) return false;
  cooldown[key] = t + waitMs;
  return true;
}

/** ================================
 *  STATE
 *  ================================ */
let currentUser = null;
let currentSignalId = null;
let signalsCache = [];

/** ================================
 *  UI INIT
 *  ================================ */
function resetMessages(){
  setStatus($("authMsg"), "");
  setStatus($("submitMsg"), "");
  setStatus($("remarkMsg"), "");
}

function onLogoutUI(){
  currentUser = null;
  currentSignalId = null;
  signalsCache = [];

  show($("authCard"));
  hide($("appCard"));
  hide($("newCard"));
  hide($("listCard"));
  hide($("convCard"));

  $("who").textContent = "";
  $("netState").textContent = "";
  $("signalsList").textContent = "";
  $("events").textContent = "";
  $("convTitle").textContent = "";
  $("email").value = "";
  $("address").value = "";
  $("context").value = "";
  $("newRemark").value = "";

  updateCounters();
  resetMessages();
}

function onLoginUI(user){
  currentUser = user;

  hide($("authCard"));
  show($("appCard"));
  show($("newCard"));
  show($("listCard"));

  $("who").textContent = safeText(user?.email, "");
  updateNetState();

  hide($("convCard"));
  currentSignalId = null;

  updateCounters();
}

/** ================================
 *  NETWORK STATE
 *  ================================ */
function updateNetState(){
  const el = $("netState");
  if (!currentUser) { el.textContent = ""; return; }

  if (navigator.onLine) {
    el.textContent = "Réseau : en ligne";
    el.classList.remove("bad");
    el.classList.add("muted");
  } else {
    el.textContent = "Réseau : hors ligne (certaines actions peuvent échouer)";
    el.classList.add("bad");
  }
}

window.addEventListener("online", updateNetState);
window.addEventListener("offline", updateNetState);

/** ================================
 *  COUNTERS (UX + limites)
 *  ================================ */
function updateCounters(){
  const ctx = $("context");
  const ctxCount = $("contextCount");
  const rmk = $("newRemark");
  const rmkCount = $("remarkCount");

  if (ctx && ctxCount) {
    const n = safeText(ctx.value).length;
    ctxCount.textContent = `${n}/${LIMITS.contextMax}`;
  }
  if (rmk && rmkCount) {
    const n = safeText(rmk.value).length;
    rmkCount.textContent = `${n}/${LIMITS.remarkMax}`;
  }
}

$("context").addEventListener("input", () => {
  if ($("context").value.length > LIMITS.contextMax) {
    $("context").value = $("context").value.slice(0, LIMITS.contextMax);
  }
  updateCounters();
});

$("newRemark").addEventListener("input", () => {
  if ($("newRemark").value.length > LIMITS.remarkMax) {
    $("newRemark").value = $("newRemark").value.slice(0, LIMITS.remarkMax);
  }
  updateCounters();
});

/** ================================
 *  BOOT
 *  ================================ */
async function boot(){
  resetMessages();
  updateNetState();
  updateCounters();

  // 1) Lire session existante
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("[auth.getSession]", error);

    if (data?.session?.user) {
      onLoginUI(data.session.user);
      await loadSignals({ reason: "boot" });
    } else {
      onLogoutUI();
    }
  } catch (e) {
    console.error("[boot]", e);
    onLogoutUI();
  }

  // 2) Écouter changements auth
  supabase.auth.onAuthStateChange(async (_event, session) => {
    // Défensif : protège des états intermédiaires
    const user = session?.user || null;

    if (user) {
      onLoginUI(user);
      await loadSignals({ reason: "authChange" });
    } else {
      onLogoutUI();
    }
  });
}

/** ================================
 *  AUTH HANDLERS
 *  ================================ */
$("btnMagic").addEventListener("click", async () => {
  resetMessages();

  if (!canRun("magic", 2500)) {
    return setStatus($("authMsg"), "Patiente une seconde avant de renvoyer le lien.", false);
  }

  const email = safeText($("email").value).trim();
  if (!isValidEmail(email)) {
    return setStatus($("authMsg"), "Email invalide.", false);
  }

  $("btnMagic").disabled = true;
  setStatus($("authMsg"), "Envoi du lien…");

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      console.error("[signInWithOtp]", error);
      setStatus($("authMsg"), error.message, false);
    } else {
      setStatus($("authMsg"), "Lien envoyé. Vérifie ta boîte mail.", true);
    }
  } catch (e) {
    console.error("[signInWithOtp catch]", e);
    setStatus($("authMsg"), "Erreur réseau. Réessaie.", false);
  } finally {
    $("btnMagic").disabled = false;
  }
});

$("btnLogout").addEventListener("click", async () => {
  $("btnLogout").disabled = true;
  try {
    await supabase.auth.signOut();
    // UI via onAuthStateChange
  } catch (e) {
    console.error("[signOut]", e);
  } finally {
    $("btnLogout").disabled = false;
  }
});

/** ================================
 *  SIGNALS: CREATE
 *  ================================ */
$("btnSubmit").addEventListener("click", async () => {
  resetMessages();

  if (!currentUser) return setStatus($("submitMsg"), "Non connecté.", false);
  if (!navigator.onLine) return setStatus($("submitMsg"), "Hors ligne : impossible d’envoyer.", false);

  if (!canRun("submit", 1200)) {
    return setStatus($("submitMsg"), "Trop rapide — réessaie dans une seconde.", false);
  }

  const address = safeText($("address").value).trim();
  const context = safeText($("context").value).trim();

  if (!address) return setStatus($("submitMsg"), "Adresse obligatoire.", false);
  if (address.length > LIMITS.addressMax) return setStatus($("submitMsg"), `Adresse trop longue (max ${LIMITS.addressMax}).`, false);
  if (context.length > LIMITS.contextMax) return setStatus($("submitMsg"), `Contexte trop long (max ${LIMITS.contextMax}).`, false);

  $("btnSubmit").disabled = true;
  setStatus($("submitMsg"), "Envoi…");

  try {
    // Si ta table signals a created_by DEFAULT auth.uid(), ne pas envoyer created_by depuis le front.
    const { error } = await supabase
      .from("signals")
      .insert([{ address, context }]);

    if (error) {
      console.error("[signals.insert]", error);
      return setStatus($("submitMsg"), error.message, false);
    }

    $("address").value = "";
    $("context").value = "";
    updateCounters();

    setStatus($("submitMsg"), "Signalement envoyé.", true);
    await loadSignals({ reason: "afterInsert" });

  } catch (e) {
    console.error("[signals.insert catch]", e);
    setStatus($("submitMsg"), "Erreur réseau. Réessaie.", false);
  } finally {
    $("btnSubmit").disabled = false;
  }
});

/** ================================
 *  SIGNALS: LIST / RENDER
 *  ================================ */
$("btnRefresh").addEventListener("click", async () => {
  if (!currentUser) return;
  if (!canRun("refresh", 700)) return;
  await loadSignals({ reason: "manualRefresh" });
});

async function loadSignals({ reason } = { reason: "unknown" }){
  const host = $("signalsList");
  host.textContent = "Chargement…";

  if (!currentUser) {
    host.textContent = "Non connecté.";
    return;
  }

  try {
    // IMPORTANT :
    // - On ne filtre pas forcément ici si la RLS est bien en place :
    //   la base ne renverra QUE tes lignes.
    // - Tu peux ajouter .eq("created_by", currentUser.id) si tu veux, mais pas obligatoire.
    const { data, error } = await supabase
      .from("signals")
      .select("id,address,context,status,created_at")

      .order("created_at", { ascending: false });

    if (error) {
  console.error(
    "[signals.select]",
    reason || "unknown",

    "message:", error.message,
    "details:", error.details,
    "hint:", error.hint,
    "code:", error.code,
    error
  );
  host.textContent = "Erreur de chargement.";
  return;
}


    signalsCache = Array.isArray(data) ? data : [];

    if (signalsCache.length === 0) {
      host.textContent = "Aucun signalement pour le moment.";
      return;
    }

    renderSignals(signalsCache);

  } catch (e) {
    console.error("[signals.select catch]", { reason, e });
    host.textContent = "Erreur réseau.";
  }
}

function renderSignals(list){
  const host = $("signalsList");
  clearNode(host);

  list.forEach((s) => {
    const sig = document.createElement("div");
    sig.className = "sig";

    const top = document.createElement("div");
    top.className = "row";

    const strong = document.createElement("strong");
    strong.textContent = clampLen(s.address, 500);

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = safeText(s.status || "new");

    top.appendChild(strong);
    top.appendChild(pill);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.marginTop = "6px";
    meta.textContent = fmtDate(s.created_at);

    const btn = document.createElement("button");
    btn.className = "btnSmall";
    btn.textContent = "Ouvrir";
    btn.addEventListener("click", () => openConversation(s.id, s.address));

    sig.appendChild(top);
    sig.appendChild(meta);
    sig.appendChild(btn);

    host.appendChild(sig);
  });
}

/** ================================
 *  CONVERSATION
 *  ================================ */
$("closeConv").addEventListener("click", () => {
  hide($("convCard"));
  currentSignalId = null;
  $("convTitle").textContent = "";
  $("events").textContent = "";
  $("newRemark").value = "";
  updateCounters();
  resetMessages();
});

function openConversation(signalId, address){
  if (!signalId) return;
  currentSignalId = String(signalId);

  $("convTitle").textContent = safeText(address);
  show($("convCard"));

  $("events").textContent = "Chargement…";
  $("newRemark").value = "";
  updateCounters();
  resetMessages();

  loadEvents({ reason: "openConversation" });
}

/** ================================
 *  EVENTS: LIST / RENDER
 *  ================================ */
async function loadEvents({ reason } = { reason: "unknown" }){
  const host = $("events");
  host.textContent = "Chargement…";

  if (!currentUser || !currentSignalId) {
    host.textContent = "Aucun signalement sélectionné.";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("signal_events")
      .select("label,internal_note,created_at")
      .eq("signal_id", currentSignalId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[signal_events.select]", { reason, error });
      host.textContent = "Erreur de chargement.";
      return;
    }

    const events = Array.isArray(data) ? data : [];
    if (events.length === 0) {
      host.textContent = "Aucun message pour ce signalement.";
      return;
    }

    renderEvents(events);

  } catch (e) {
    console.error("[signal_events.select catch]", { reason, e });
    host.textContent = "Erreur réseau.";
  }
}

function renderEvents(events){
  const host = $("events");
  clearNode(host);

  events.forEach((e) => {
    const msg = document.createElement("div");
    msg.className = "msg";

    const head = document.createElement("div");
    head.className = "msg-head";

    const left = document.createElement("span");
    left.textContent = safeText(e.label);

    const right = document.createElement("span");
    right.textContent = fmtDate(e.created_at);

    head.appendChild(left);
    head.appendChild(right);

    const body = document.createElement("div");
    body.textContent = safeText(e.internal_note);

    msg.appendChild(head);
    msg.appendChild(body);
    host.appendChild(msg);
  });
}

/** ================================
 *  EVENTS: INSERT (user remark)
 *  ================================ */
$("sendRemark").addEventListener("click", async () => {
  resetMessages();

  if (!currentUser) return setStatus($("remarkMsg"), "Non connecté.", false);
  if (!currentSignalId) return setStatus($("remarkMsg"), "Aucun signalement sélectionné.", false);
  if (!navigator.onLine) return setStatus($("remarkMsg"), "Hors ligne : impossible d’envoyer.", false);

  if (!canRun("remark", 900)) {
    return setStatus($("remarkMsg"), "Trop rapide — réessaie dans une seconde.", false);
  }

  const text = safeText($("newRemark").value).trim();
  if (!text) return setStatus($("remarkMsg"), "Texte requis.", false);
  if (text.length > LIMITS.remarkMax) return setStatus($("remarkMsg"), `Texte trop long (max ${LIMITS.remarkMax}).`, false);

  $("sendRemark").disabled = true;
  setStatus($("remarkMsg"), "Envoi…");

  try {
    const { error } = await supabase
      .from("signal_events")
      .insert([{
        signal_id: currentSignalId,
        label: "user_remark",
        internal_note: text
      }]);

    if (error) {
      console.error("[signal_events.insert]", error);
      return setStatus($("remarkMsg"), error.message, false);
    }

    $("newRemark").value = "";
    updateCounters();
    setStatus($("remarkMsg"), "Remarque envoyée.", true);
    await loadEvents({ reason: "afterRemark" });

  } catch (e) {
    console.error("[signal_events.insert catch]", e);
    setStatus($("remarkMsg"), "Erreur réseau. Réessaie.", false);
  } finally {
    $("sendRemark").disabled = false;
  }
});

/** ================================
 *  DEFENSIVE: harden against weird states
 *  ================================ */
window.addEventListener("error", (ev) => {
  // N'affiche pas trop de détails à l'utilisateur, mais log pour debug.
  console.error("[window.error]", ev?.error || ev?.message || ev);
});

window.addEventListener("unhandledrejection", (ev) => {
  console.error("[unhandledrejection]", ev?.reason || ev);
});

/** ================================
 *  GO
 *  ================================ */
boot();
