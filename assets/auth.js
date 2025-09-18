// assets/auth.js
(() => {
  "use strict";

  // ====== Claves de almacenamiento ======
  const LS_USERS_LIST   = "dash_users_v3";          // lista de usuarios (persistencia)
  const LS_CURRENT_USER = "dash_current_user_v3";   // sesión activa

  // ====== Limpieza de sesiones heredadas (evita sesiones viejas tipo "Noel") ======
  const LEGACY_SESSION_KEYS = [
    "dash_current_user_v2",
    "dash_current_user",
    "currentUser",
    "loggedUser",
    "user"
  ];
  (function purgeLegacySessions() {
    try { LEGACY_SESSION_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
  })();

  // ====== Usuarios por defecto (sólo si no hay ninguno) ======
  const DEFAULT_ADMIN  = { username: "admin",  password: "Admin123*", role: "admin"   };
  const DEFAULT_VISOR  = { username: "visor1", password: "Visor123*", role: "usuario" };

  // ====== Utilidades ======
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  async function sha256(text) {
    const enc = new TextEncoder().encode(text ?? "");
    const out = await crypto.subtle.digest("SHA-256", enc);
    return toHex(out);
  }

  // Lee lista de usuarios (migrando de claves viejas si existieran)
  function readUsersRaw() {
    const keys = [LS_USERS_LIST, "dash_users_v2", "dash_users"];
    for (const k of keys) {
      try {
        const val = localStorage.getItem(k);
        if (!val) continue;
        const arr = JSON.parse(val);
        if (Array.isArray(arr)) return arr;
      } catch {}
    }
    return [];
  }
  function writeUsersRaw(list) {
    localStorage.setItem(LS_USERS_LIST, JSON.stringify(list || []));
  }

  // Sesión
  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(LS_CURRENT_USER) || "null"); } catch { return null; }
  }
  function setCurrentUser(u) {
    if (!u) localStorage.removeItem(LS_CURRENT_USER);
    else    localStorage.setItem(LS_CURRENT_USER, JSON.stringify(u));
  }

  // Sembrado: garantiza que exista un admin
  async function ensureSeeded() {
    let list = readUsersRaw();
    if (!Array.isArray(list) || list.length === 0) {
      const adminHash = await sha256(DEFAULT_ADMIN.password);
      const visorHash = await sha256(DEFAULT_VISOR.password);
      list = [
        { username: DEFAULT_ADMIN.username, passHash: adminHash, role: DEFAULT_ADMIN.role },
        { username: DEFAULT_VISOR.username, passHash: visorHash, role: DEFAULT_VISOR.role }
      ];
      writeUsersRaw(list);
      return;
    }
    const hasAdmin = list.some(u => (u.role || "").toLowerCase() === "admin");
    const hasAdminName = list.some(u => (u.username || "").toLowerCase() === "admin");
    if (!hasAdmin && !hasAdminName) {
      const adminHash = await sha256(DEFAULT_ADMIN.password);
      list.push({ username: DEFAULT_ADMIN.username, passHash: adminHash, role: "admin" });
      writeUsersRaw(list);
    }
  }

  // Siembra personalizada pedida por ti (solo UNA vez)
  async function seedCustomUsersOnce() {
    const FLAG = "dash_custom_seed_v1";
    if (localStorage.getItem(FLAG)) return; // ya sembrado

    const desired = [
      { username: "Jeffry", pass: "admin2025", role: "admin"   },
      { username: "Daniel", pass: "Daniel123", role: "admin"   },
      { username: "Noel",   pass: "Noel123",   role: "usuario" },
      { username: "Italo",  pass: "Italo123",  role: "usuario" },
      { username: "Cliente",  pass: "Cliente123",  role: "usuario" }
    ];

    let list = readUsersRaw();

    for (const u of desired) {
      const i = list.findIndex(x => (x.username || "").toLowerCase() === u.username.toLowerCase());
      const passHash = await sha256(u.pass);
      if (i >= 0) { list[i].passHash = passHash; list[i].role = u.role; }
      else { list.push({ username: u.username, passHash, role: u.role }); }
    }

    writeUsersRaw(list);
    localStorage.setItem(FLAG, "1"); // no volver a reescribir en futuros loads
  }

  // Ejecutar sembrados en orden
  (async () => {
    await ensureSeeded();
    await seedCustomUsersOnce();
  })();

  // ====== Operaciones de autenticación ======
  async function login(username, password) {
    username = (username || "").trim();
    const list = readUsersRaw();
    const u = list.find(x => (x.username || "").toLowerCase() === username.toLowerCase());
    if (!u) throw new Error("Usuario o contraseña incorrectos");
    const h = await sha256(password || "");
    if (h !== u.passHash) throw new Error("Usuario o contraseña incorrectos");
    setCurrentUser({ username: u.username, role: u.role });
    return { username: u.username, role: u.role };
  }

  function requireLogin() {
    const u = getCurrentUser();
    const path = (location.pathname || "").toLowerCase();
    const onIndex = /(^|\/)index\.html?(\?|#|$)/.test(path) || path === "/" || path === "";
    if (!u && !onIndex) location.href = "index.html";
  }

  function requireRole(role = "admin") {
    requireLogin();
    const u = getCurrentUser();
    if (!u || (u.role || "").toLowerCase() !== role.toLowerCase()) {
      location.href = "dashboard.html";
    }
  }

  function logout() {
    setCurrentUser(null);
    location.href = "index.html";
  }

  // ====== CRUD de usuarios (persistencia en la misma clave v3) ======
  function loadUsers() { return readUsersRaw(); }
  function saveUsers(list) { writeUsersRaw(list); }

  async function createUser({ username, password, role = "usuario" }) {
    username = (username || "").trim();
    if (!username || !password) throw new Error("Completa usuario y contraseña");
    const cur = getCurrentUser();
    const list = readUsersRaw();
    if (list.length > 0 && (!cur || (cur.role || "").toLowerCase() !== "admin"))
      throw new Error("Sólo Admin puede crear usuarios");
    if (list.some(u => (u.username || "").toLowerCase() === username.toLowerCase()))
      throw new Error("El usuario ya existe");
    const passHash = await sha256(password);
    list.push({ username, passHash, role });
    writeUsersRaw(list); // persistir
    return true;
  }

  async function setPassword(username, newPassword) {
    const list = readUsersRaw();
    const i = list.findIndex(u => (u.username || "").toLowerCase() === String(username).toLowerCase());
    if (i < 0) throw new Error("Usuario no encontrado");
    list[i].passHash = await sha256(newPassword);
    writeUsersRaw(list);
  }

  function setRole(username, role) {
    const list = readUsersRaw();
    const i = list.findIndex(u => (u.username || "").toLowerCase() === String(username).toLowerCase());
    if (i < 0) throw new Error("Usuario no encontrado");
    list[i].role = role;
    writeUsersRaw(list);
  }

  function deleteUser(username) {
    const list = readUsersRaw();
    const idx = list.findIndex(u => (u.username || "").toLowerCase() === String(username).toLowerCase());
    if (idx < 0) return;
    const admins = list.filter(u => (u.role || "").toLowerCase() === "admin").length;
    if (admins <= 1 && (list[idx].role || "").toLowerCase() === "admin")
      throw new Error("No puedes eliminar al único admin.");
    list.splice(idx, 1);
    writeUsersRaw(list);
  }

  // ====== Auto-wire en login (sin tocar tu UI) ======
  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    const loginMsg     = document.getElementById("login-msg");
    const registerCard = document.getElementById("register-card");
    const toRegister   = document.getElementById("to-register");

    // Oculta UI de registro si existiera
    if (toRegister)   toRegister.style.display = "none";
    if (registerCard) registerCard.style.display = "none";

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (loginMsg) { loginMsg.textContent = ""; loginMsg.classList.remove("error"); }
      const f = new FormData(loginForm);
      try {
        await login(f.get("username"), f.get("password"));
        if (loginMsg) loginMsg.textContent = "Ingreso correcto…";
        setTimeout(() => location.href = "dashboard.html", 200);
      } catch (err) {
        if (loginMsg) { loginMsg.textContent = err.message || "No se pudo iniciar sesión"; loginMsg.classList.add("error"); }
      }
    });
  });

  // ====== Exportar API ======
  window.Common = window.Common || {};
  Object.assign(window.Common, {
    // sesión
    getCurrentUser, setCurrentUser, requireLogin, requireRole, logout,
    // usuarios
    loadUsers, saveUsers, createUser, setPassword, setRole, deleteUser
  });
})();
