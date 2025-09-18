// assets/auth.js
(() => {
  // ====== Config ======
  const LS_USERS   = "dash_users_v2";
  const LS_CURRENT = "dash_current_user_v2";

  // Cambia esta lista a tus usuarios iniciales (se crean la PRIMERA vez en cada dominio)
  const DEFAULT_USERS = [
    { username: "admin",   password: "Admin123*",   role: "admin"   },
    { username: "visor1",  password: "Visor123*",   role: "usuario" },
    // { username: "juan", password: "TuClave!", role: "usuario" },
  ];

  // ====== Utils ======
  const toHex = (buf) => Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", enc);
    return toHex(hash);
  }

  function getUsersRaw() {
    try { return JSON.parse(localStorage.getItem(LS_USERS) || "[]"); }
    catch { return []; }
  }
  function saveUsersRaw(users) {
    localStorage.setItem(LS_USERS, JSON.stringify(users || []));
  }

  async function ensureSeeded() {
    let users = getUsersRaw();
    if (Array.isArray(users) && users.length > 0) return; // ya hay usuarios

    // Sembrar por primera vez
    const seeded = [];
    for (const u of DEFAULT_USERS) {
      const passHash = await sha256(u.password);
      seeded.push({ username: u.username, passHash, role: u.role || "usuario" });
    }
    saveUsersRaw(seeded);
  }

  function loadUsers() { return getUsersRaw(); }
  function saveUsers(users) { saveUsersRaw(users); }

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(LS_CURRENT) || "null"); }
    catch { return null; }
  }
  function setCurrentUser(u) {
    if (!u) localStorage.removeItem(LS_CURRENT);
    else localStorage.setItem(LS_CURRENT, JSON.stringify({ username:u.username, role:u.role }));
  }

  function requireLogin() {
    const u = getCurrentUser();
    // Permitir index.html sin login
    const onIndex = /(^|\/)index\.html?(\?|#|$)/i.test(location.pathname) || location.pathname === "/" || location.pathname === "";
    if (!u && !onIndex) location.href = "index.html";
  }

  function logout() { setCurrentUser(null); location.href = "index.html"; }

  // ====== Operaciones auth ======
  async function login(username, password) {
    username = (username || "").trim();
    const users = loadUsers();
    const u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) throw new Error("Usuario o contraseña incorrectos");
    const passHash = await sha256(password || "");
    if (passHash !== u.passHash) throw new Error("Usuario o contraseña incorrectos");
    setCurrentUser({ username: u.username, role: u.role });
    return { username: u.username, role: u.role };
  }

  async function createUser({ username, password, role = "usuario" }) {
    username = (username || "").trim();
    if (!username || !password) throw new Error("Completa usuario y contraseña");
    const current = getCurrentUser();
    const existing = loadUsers();

    // Si ya hay usuarios, sólo Admin puede crear nuevos
    if (existing.length > 0 && (!current || current.role !== "admin")) {
      throw new Error("Sólo Admin puede crear usuarios");
    }
    if (existing.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("El usuario ya existe");
    }
    const passHash = await sha256(password);
    existing.push({ username, passHash, role });
    saveUsers(existing);
    return true;
  }

  function deleteUser(username) {
    const current = getCurrentUser();
    if (!current || current.role !== "admin") throw new Error("Sólo Admin puede eliminar usuarios");
    const list = loadUsers().filter(u => u.username.toLowerCase() !== username.toLowerCase());
    saveUsers(list);
  }

  // ====== UI (index.html) ======
  async function wireIndexUI() {
    // Si no estamos en index.html, no hacemos nada
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    await ensureSeeded(); // importante: crear semilla si no existe

    const registerForm = document.getElementById("register-form");
    const toRegister   = document.getElementById("to-register");
    const toLogin      = document.getElementById("to-login");
    const loginCard    = document.getElementById("login-card");
    const registerCard = document.getElementById("register-card");
    const resetUsers   = document.getElementById("resetUsers");
    const loginMsg     = document.getElementById("login-msg");
    const registerMsg  = document.getElementById("register-msg");

    const usersExist = loadUsers().length > 0;

    // Ocultar "Crear usuario" si ya hay usuarios sembrados
    if (toRegister && usersExist) toRegister.style.display = "none";
    if (registerCard && usersExist) registerCard.style.display = "none";
    if (resetUsers) resetUsers.style.display = "none"; // no exponer reset en público

    // Toggle (por si no hay usuarios y quieres crear el primero)
    if (toRegister) toRegister.addEventListener("click", (e)=>{ e.preventDefault(); loginCard.style.display="none"; registerCard.style.display="block"; });
    if (toLogin)    toLogin.addEventListener("click",    (e)=>{ e.preventDefault(); registerCard.style.display="none"; loginCard.style.display="block"; });

    // Login
    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      loginMsg.textContent = "";
      const data = new FormData(loginForm);
      const username = data.get("username");
      const password = data.get("password");
      try{
        const u = await login(username, password);
        loginMsg.textContent = "Ingreso correcto…";
        setTimeout(()=> location.href = "dashboard.html", 250);
      }catch(err){
        loginMsg.textContent = err.message || "No se pudo iniciar sesión";
        loginMsg.classList.add("error");
      }
    });

    // Crear usuario (solo si NO hay usuarios; de lo contrario, sólo Admin desde users.html)
    if (registerForm){
      registerForm.addEventListener("submit", async (e)=>{
        e.preventDefault();
        registerMsg.textContent = "";
        const data = new FormData(registerForm);
        const username = data.get("username");
        const password = data.get("password");
        const confirm  = data.get("confirm");
        if (password !== confirm){
          registerMsg.textContent = "Las contraseñas no coinciden";
          registerMsg.classList.add("error"); return;
        }
        try{
          await createUser({ username, password, role: (loadUsers().length===0 ? "admin" : "usuario") });
          registerMsg.textContent = "Usuario creado. Ahora ingresa.";
          loginCard.style.display="block"; registerCard.style.display="none";
        }catch(err){
          registerMsg.textContent = err.message || "No se pudo crear el usuario";
          registerMsg.classList.add("error");
        }
      });
    }
  }

  // ====== Exponer API a otros módulos ======
  window.Common = window.Common || {};
  Object.assign(window.Common, {
    loadUsers, saveUsers, createUser, deleteUser,
    getCurrentUser, setCurrentUser, requireLogin, logout
  });

  // Auto-wire en cualquier página
  document.addEventListener("DOMContentLoaded", wireIndexUI);
})();
