// assets/users.js
(() => {
  // Tomamos API del módulo de auth
  const {
    requireLogin, getCurrentUser,
    loadUsers, saveUsers,
    createUser, deleteUser, setRole, setPassword,
    logout
  } = window.Common || {};

  // Helpers de selección tolerantes a IDs distintos
  const pick = (...ids) => ids.map(id => document.getElementById(id)).find(Boolean);

  function assertAdminOrKick() {
    requireLogin && requireLogin();
    const u = getCurrentUser ? getCurrentUser() : null;
    if (!u || (u.role || '').toLowerCase() !== 'admin') {
      // Si no es admin, llévalo al dashboard
      location.href = 'dashboard.html';
    }
    return u;
  }

  // Render tabla de usuarios
  function renderList() {
    const list = loadUsers ? loadUsers() : [];
    const tBody = pick('tbUsers', 'tblUsers', 'usersTbody', 'tbodyUsers');
    if (!tBody) return;

    const rows = list.map(u => {
      const isAdmin = (u.role || '').toLowerCase() === 'admin';
      return `
        <tr>
          <td>${u.username}</td>
          <td>
            <select data-username="${u.username}" class="roleSelect">
              <option value="usuario" ${!isAdmin ? 'selected' : ''}>usuario</option>
              <option value="admin"   ${isAdmin ? 'selected' : ''}>admin</option>
            </select>
          </td>
          <td class="actions">
            <button class="btn-sm btn-pass" data-username="${u.username}">Reset pass</button>
            <button class="btn-sm btn-del"  data-username="${u.username}">Eliminar</button>
          </td>
        </tr>`;
    }).join('');

    tBody.innerHTML = rows || '<tr><td colspan="3">Sin usuarios.</td></tr>';

    // Listeners en la tabla
    tBody.querySelectorAll('.roleSelect').forEach(sel => {
      sel.addEventListener('change', () => {
        try {
          setRole(sel.dataset.username, sel.value);
        } catch (e) {
          alert(e.message || 'No se pudo cambiar el rol');
          // revertir UI si falla
          renderList();
        }
      });
    });

    tBody.querySelectorAll('.btn-pass').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nu = prompt('Nueva contraseña para ' + btn.dataset.username);
        if (!nu) return;
        try {
          await setPassword(btn.dataset.username, nu);
          alert('Contraseña actualizada');
        } catch (e) {
          alert(e.message || 'No se pudo actualizar la contraseña');
        }
      });
    });

    tBody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('¿Eliminar usuario ' + btn.dataset.username + '?')) return;
        try {
          deleteUser(btn.dataset.username);
          renderList();
        } catch (e) {
          alert(e.message || 'No se pudo eliminar el usuario');
        }
      });
    });
  }

  // Crear usuario
  async function bindCreateForm() {
    const form = pick('userForm', 'formUser', 'formCrear', 'formAddUser');
    if (!form) return;

    const inUser = pick('uName', 'username', 'usuario', 'user');
    const inPass = pick('uPass', 'password', 'contraseña', 'pass');
    const inConf = pick('uConfirm', 'confirm', 'confirmar', 'conf');
    const inRole = pick('uRole', 'role', 'rol');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (inUser?.value || '').trim();
      const password = (inPass?.value || '').trim();
      const confirm  = (inConf?.value || '').trim();
      const role     = (inRole?.value || 'usuario').trim();

      if (!username || !password) {
        alert('Completa usuario y contraseña');
        return;
      }
      if (password !== confirm) {
        alert('La confirmación no coincide');
        return;
      }

      try {
        await createUser({ username, password, role });
        // Limpiar
        if (inUser) inUser.value = '';
        if (inPass) inPass.value = '';
        if (inConf) inConf.value = '';
        if (inRole) inRole.value = 'usuario';
        renderList();
      } catch (e) {
        alert(e.message || 'No se pudo crear el usuario');
      }
    });
  }

  // Nav y logout si los tienes
  function bindNav() {
    const btnDash = pick('btnDash');
    const btnLogout = pick('btnLogout');
    if (btnDash) btnDash.addEventListener('click', () => location.href = 'dashboard.html');
    if (btnLogout) btnLogout.addEventListener('click', () => logout && logout());
  }

  document.addEventListener('DOMContentLoaded', () => {
    assertAdminOrKick();
    bindCreateForm();
    bindNav();
    renderList();
  });
})();

