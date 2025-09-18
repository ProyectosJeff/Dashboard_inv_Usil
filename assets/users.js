(function(){
  document.addEventListener("DOMContentLoaded", function(){
    const { requireLogin, requireRole, loadUsers, saveUsers } = window.Common;
    requireLogin();
    if (!requireRole("admin")){ alert("Solo admin puede gestionar usuarios."); location.href="dashboard.html"; return; }

    function render(){
      const tbody=document.getElementById("userBody"); const users=loadUsers(); tbody.innerHTML="";
      users.forEach((u,i)=>{
        const tr=document.createElement("tr"); tr.innerHTML=`<td>${u.username}</td>
          <td>${u.role}</td>
          <td>
            <button class="btn ghost" data-act="role" data-i="${i}">Cambiar rol</button>
            <button class="btn ghost" data-act="pass" data-i="${i}">Cambiar clave</button>
            <button class="btn danger" data-act="del" data-i="${i}">Eliminar</button>
          </td>`; tbody.appendChild(tr);
      });
    }

    document.getElementById("addForm").addEventListener("submit", async function(e){
      e.preventDefault();
      const username=e.target.username.value.trim();
      const role=e.target.role.value;
      const p1=e.target.password.value, p2=e.target.confirm.value;
      if(!username||!p1||p1!==p2){ alert("Completa usuario/contraseña y confirma."); return; }
      const enc=new TextEncoder(); const pass = await crypto.subtle.digest("SHA-256", enc.encode(p1)).then(buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join(""));
      const users=loadUsers();
      if(users.find(u=>u.username.toLowerCase()===username.toLowerCase())){ alert("Usuario ya existe."); return; }
      users.push({username, pass, role, createdAt:Date.now()}); saveUsers(users); e.target.reset(); render();
    });

    document.getElementById("userBody").addEventListener("click", async (e)=>{
      const btn=e.target.closest("button"); if(!btn) return;
      const i=parseInt(btn.dataset.i,10); const act=btn.dataset.act; const users=loadUsers();
      if(act==="del"){ if(confirm("¿Eliminar usuario?")){ users.splice(i,1); saveUsers(users); render(); } return; }
      if(act==="role"){ users[i].role = users[i].role==="admin"?"usuario":"admin"; saveUsers(users); render(); return; }
      if(act==="pass"){ const p1=prompt("Nueva contraseña:"); if(!p1) return; const p2=prompt("Confirmar:"); if(p1!==p2){ alert("No coincide."); return; }
        const enc=new TextEncoder(); users[i].pass = await crypto.subtle.digest("SHA-256", enc.encode(p1)).then(buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")); saveUsers(users); alert("Actualizada."); return; }
    });

    render();
  });
})();
