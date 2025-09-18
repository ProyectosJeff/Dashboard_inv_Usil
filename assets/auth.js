const LEGACY_SESSION_KEYS = [
  'dash_current_user_v2',
  'dash_current_user',
  'currentUser',
  'loggedUser',
  'user'
];
function purgeLegacySessions(){ try{ LEGACY_SESSION_KEYS.forEach(k => localStorage.removeItem(k)); }catch(_){ } }
purgeLegacySessions();

// assets/auth.js
(() => {
  const LS_USERS_LIST   = "dash_users_v3";       // lista de usuarios
  const LS_CURRENT_USER = "dash_current_user_v3"; // sesión

  // Admin por defecto: se crea SOLO si no hay usuarios.
  const DEFAULT_ADMIN = { username: "admin", password: "Admin123*", role: "admin" };
  const FALLBACK_USER = { username: "visor1", password: "Visor123*", role: "usuario" };

  // ===== utilidades =====
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  async function sha256(text){
    const enc = new TextEncoder().encode(text ?? "");
    const out = await crypto.subtle.digest("SHA-256", enc);
    return toHex(out);
  }

  function readUsersRaw() {
    // lee v3, o migra v2/v1 si existieran
    const keys = [LS_USERS_LIST, "dash_users_v2", "dash_users"];
    for (const k of keys){
      try {
        const val = localStorage.getItem(k);
        if (!val) continue;
        const arr = JSON.parse(val);
        if (Array.isArray(arr)) return arr;
      } catch {}
    }
    return [];
  }
  function writeUsersRaw(list){ localStorage.setItem(LS_USERS_LIST, JSON.stringify(list||[])); }

  function getCurrentUser(){ try{ return JSON.parse(localStorage.getItem(LS_CURRENT_USER)||"null"); }catch{ return null; } }
  function setCurrentUser(u){ if(!u) localStorage.removeItem(LS_CURRENT_USER); else localStorage.setItem(LS_CURRENT_USER, JSON.stringify(u)); }

  async function ensureSeeded(){
    let list = readUsersRaw();
    if (!Array.isArray(list) || list.length === 0){
      // primera vez: admin + un visor
      const adminHash = await sha256(DEFAULT_ADMIN.password);
      const visorHash = await sha256(FALLBACK_USER.password);
      list = [
        { username: DEFAULT_ADMIN.username, passHash: adminHash, role: DEFAULT_ADMIN.role },
        { username: FALLBACK_USER.username, passHash: visorHash, role: FALLBACK_USER.role }
      ];
      writeUsersRaw(list);
      return;
    }
    // si no hay ningún admin en la lista, añadimos uno para que puedas entrar
    const hasAdmin = list.some(u => (u.role||"").toLowerCase()==="admin");
    const hasUserAdminName = list.some(u => u.username?.toLowerCase()==="admin");
    if (!hasAdmin && !hasUserAdminName){
      const adminHash = await sha256(DEFAULT_ADMIN.password);
      list.push({ username: DEFAULT_ADMIN.username, passHash: adminHash, role: "admin" });
      writeUsersRaw(list);
    }
  }

  // ===== operaciones de auth =====
  async function login(username, password){
    username = (username||"").trim();
    const list = readUsersRaw();
    const u = list.find(x => x.username?.toLowerCase() === username.toLowerCase());
    if (!u) throw new Error("Usuario o contraseña incorrectos");
    const h = await sha256(password||"");
    if (h !== u.passHash) throw new Error("Usuario o contraseña incorrectos");
    setCurrentUser({ username: u.username, role: u.role });
    return { username: u.username, role: u.role };
  }

  function requireLogin(){
    const u = getCurrentUser();
    const path = (location.pathname||"").toLowerCase();
    const onIndex = /(^|\/)index\.html?(\?|#|$)/.test(path) || path === "/" || path === "";
    if (!u && !onIndex) location.href = "index.html";
  }
  function logout(){ setCurrentUser(null); location.href = "index.html"; }

  function loadUsers(){ return readUsersRaw(); }
  function saveUsers(list){ writeUsersRaw(list); }

  async function createUser({username,password,role="usuario"}){
    username = (username||"").trim();
    if (!username || !password) throw new Error("Completa usuario y contraseña");
    const cur = getCurrentUser();
    const list = readUsersRaw();
    if (list.length>0 && (!cur || (cur.role||"").toLowerCase()!=="admin"))
      throw new Error("Sólo Admin puede crear usuarios");
    if (list.some(u => u.username?.toLowerCase()===username.toLowerCase()))
      throw new Error("El usuario ya existe");
    const passHash = await sha256(password);
    list.push({ username, passHash, role });
    writeUsersRaw(list);
    return true;
  }

  async function setPassword(username, newPassword){
    const list = readUsersRaw();
    const i = list.findIndex(u => u.username?.toLowerCase()===String(username).toLowerCase());
    if (i<0) throw new Error("Usuario no encontrado");
    list[i].passHash = await sha256(newPassword);
    writeUsersRaw(list);
  }
  function setRole(username, role){
    const list = readUsersRaw();
    const i = list.findIndex(u => u.username?.toLowerCase()===String(username).toLowerCase());
    if (i<0) throw new Error("Usuario no encontrado");
    list[i].role = role;
    writeUsersRaw(list);
  }
  function deleteUser(username){
    const list = readUsersRaw();
    const idx = list.findIndex(u => u.username?.toLowerCase()===String(username).toLowerCase());
    if (idx<0) return;
    const admins = list.filter(u => (u.role||"").toLowerCase()==="admin").length;
    if (admins<=1 && (list[idx].role||"").toLowerCase()==="admin")
      throw new Error("No puedes eliminar al único admin.");
    list.splice(idx,1);
    writeUsersRaw(list);
  }

  // ===== auto-wire en el login (sin tocar tu diseño) =====
  document.addEventListener("DOMContentLoaded", async ()=>{
    // Solo si estamos en la página de login (tiene el formulario)
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    await ensureSeeded();

    const loginMsg     = document.getElementById("login-msg");
    const registerCard = document.getElementById("register-card");
    const toRegister   = document.getElementById("to-register");

    // Oculta cualquier UI de registro (como pediste: no debe pedir crear usuario)
    if (toRegister)   toRegister.style.display = "none";
    if (registerCard) registerCard.style.display = "none";

    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      if (loginMsg){ loginMsg.textContent=""; loginMsg.classList.remove("error"); }
      const f = new FormData(loginForm);
      try{
        await login(f.get("username"), f.get("password"));
        if (loginMsg) loginMsg.textContent = "Ingreso correcto…";
        setTimeout(()=> location.href="dashboard.html", 200);
      }catch(err){
        if (loginMsg){ loginMsg.textContent = err.message || "No se pudo iniciar sesión"; loginMsg.classList.add("error"); }
      }
    });
  });

  // Exponer API usada por tus otras páginas
  window.Common = window.Common || {};
  Object.assign(window.Common,{
    // sesión y guardado
    getCurrentUser, setCurrentUser, requireLogin, logout,
    loadUsers, saveUsers, createUser, setPassword, setRole, deleteUser
  });
})();
