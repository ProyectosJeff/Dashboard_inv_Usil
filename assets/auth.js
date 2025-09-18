(function () {
  function sha256Hex(text) {
    const enc = new TextEncoder();
    return crypto.subtle.digest("SHA-256", enc.encode(text))
      .then(buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""));
  }
  function show(el){ el.style.display = ""; }
  function hide(el){ el.style.display = "none"; }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.Common) { alert("Error cargando common.js. Verifica que esté enlazado ANTES de auth.js en index.html"); return; }
    const { loadUsers, saveUsers, setCurrentUser, resetUsers } = window.Common;

    let users = loadUsers();
    if (users.length && !users.some(u => u.role)) { users[0].role = "admin"; saveUsers(users); }

    const loginCard    = document.getElementById("login-card");
    const registerCard = document.getElementById("register-card");
    if (users.length === 0) { hide(loginCard); show(registerCard); }
    else { show(loginCard); hide(registerCard); }

    document.getElementById("to-register").addEventListener("click", e => { e.preventDefault(); hide(loginCard); show(registerCard); });
    document.getElementById("to-login").addEventListener("click", e => { e.preventDefault(); show(loginCard); hide(registerCard); });

    // Protección: si quitaste el enlace de reset, no se ejecuta nada
    const reset = document.getElementById("resetUsers");
    if (reset){
      reset.addEventListener("click", e => {
        e.preventDefault();
        if (confirm("¿Borrar TODOS los usuarios?")) { resetUsers(); location.reload(); }
      });
    }

    document.getElementById("login-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const username = e.target.username.value.trim();
      const passHash = await sha256Hex(e.target.password.value);
      users = loadUsers();
      const found = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.pass === passHash);
      const msg = document.getElementById("login-msg");
      if (found) {
        setCurrentUser({ username: found.username, role: found.role, createdAt: found.createdAt });
        const rt = sessionStorage.getItem("return_to") || "dashboard.html";
        location.href = rt;
      } else {
        msg.textContent = "Usuario o contraseña incorrectos.";
        msg.className = "status error";
      }
    });

    document.getElementById("register-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const username = e.target.username.value.trim();
      const p1 = e.target.password.value;
      const p2 = e.target.confirm.value;
      const msg = document.getElementById("register-msg");
      if (!username || !p1) { msg.textContent = "Completa usuario y contraseña."; msg.className = "status error"; return; }
      if (p1 !== p2)       { msg.textContent = "Las contraseñas no coinciden.";   msg.className = "status error"; return; }
      users = loadUsers();
      if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) { msg.textContent = "Ese usuario ya existe."; msg.className = "status error"; return; }
      const role = users.length === 0 ? "admin" : "usuario";
      const pass = await sha256Hex(p1);
      users.push({ username, pass, role, createdAt: Date.now() });
      saveUsers(users);
      msg.textContent = role === "admin" ? "Usuario ADMIN creado. Ya puedes iniciar sesión." : "Usuario creado. Ya puedes iniciar sesión.";
      msg.className = "status";
      setTimeout(() => { document.getElementById("to-login").click(); }, 700);
    });
  });
})();
