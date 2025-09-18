(function () {
  // ================== Claves de almacenamiento ==================
  const STORAGE_KEY = "dash_rows_v18";
  const PREFS_KEY   = "dash_prefs_v18";
  const USER_KEY    = "dash_current_user_v18";
  const USERS_KEY   = "dash_users_v18";

  // ================== IndexedDB KV (para datos grandes) ==================
  const DB_NAME = "dash_db_v18";
  const STORE   = "kvs";
  let dbp = null;

  function idbOpen() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    return dbp;
  }
  async function idbSet(key, value) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, value });
      tx.oncomplete = () => res(true);
      tx.onerror    = () => rej(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result ? rq.result.value : undefined);
      rq.onerror   = () => rej(rq.error);
    });
  }
  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror    = () => rej(tx.error);
    });
  }

  // ================== UI / Export ==================
  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? "status error" : "status";
  }
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  // CSV robusto y simple (escapa comillas siempre)
  function exportCSV(rows, filename) {
    filename = filename || "export.csv";
    if (!rows || !rows.length) {
      download(filename, "", "text/csv;charset=utf-8;");
      return;
    }
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const headerLine = headers.map(esc).join(",");
    const body = rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
    const csv = headerLine + "\n" + body;
    download(filename, csv, "text/csv;charset=utf-8;");
  }

  // ================== Persistencia de filas / prefs ==================
  async function saveRows(rows) {
    try { await idbSet(STORAGE_KEY, rows || []); }
    catch (e) { console.error(e); alert("No se pudieron guardar los datos localmente (cuota o permisos). Seguirán en memoria hasta cerrar la pestaña."); }
  }
  async function loadRows() { try { const r = await idbGet(STORAGE_KEY); return Array.isArray(r) ? r : []; } catch { return []; } }
  async function clearRows() { try { await idbDel(STORAGE_KEY); } catch {} }

  function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p || {})); } catch {} }
  function loadPrefs()  { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; } }

  // ================== Parser de archivos (XLSX/CSV) ==================
  async function parseFile(file) {
    const name = (file && file.name ? file.name : "").toLowerCase();

    // Excel
    if (/\.(xlsx|xls|xlsm|xlsb)$/.test(name)) {
      try {
        if (typeof XLSX === "undefined") {
          alert("No se pudo cargar XLSX. Revisa conexión o usa un servidor local. Alternativa: exporta a CSV.");
          throw new Error("XLSX no disponible");
        }
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: "array" });
        const sh  = wb.Sheets[wb.SheetNames[0]];
        if (!sh) throw new Error("No se encontró ninguna hoja en el Excel");

        // AoA → encabezados robustos (mantiene nombres; evita duplicados vacíos)
        const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" });
        if (Array.isArray(aoa) && aoa.length) {
          let headers = (aoa[0] || []).map((h, i) => String(h || "").trim() || `COL_${i + 1}`);
          const seen = new Map();
          headers = headers.map(h => {
            const base = h || "COL";
            const n = (seen.get(base) || 0) + 1;
            seen.set(base, n);
            return n > 1 ? `${base}_${n}` : base;
          });
          const data = [];
          for (let i = 1; i < aoa.length; i++) {
            const row = aoa[i] || [];
            const obj = {};
            for (let j = 0; j < headers.length; j++) obj[headers[j]] = row[j] === undefined ? "" : row[j];
            if (Object.values(obj).some(v => String(v).trim() !== "")) data.push(obj);
          }
          if (data.length) return data;
        }
        // Fallback
        return XLSX.utils.sheet_to_json(sh, { raw: false, defval: "" });
      } catch (err) {
        console.error("parseFile(xlsx) error:", err);
        alert("No se pudo leer el Excel: " + (err && err.message ? err.message : err));
        throw err;
      }
    }

    // CSV
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true, worker: true, dynamicTyping: false,
        complete: (res) => resolve(res.data),
        error: (e) => { alert("Error leyendo CSV: " + e); reject(e); }
      });
    });
  }

  // ================== Helpers de datos ==================
  function uniqueVals(rows, col) {
    const s = new Set();
    rows.forEach(r => {
      const v = r[col];
      if (v == null) return;
      const t = String(v).trim();
      if (t) s.add(t);
    });
    return Array.from(s);
  }

  function detectCol(headers, regs) {
    return headers.find(h => regs.some(rx => rx.test(h))) || null;
  }

  // >>> toDate ROBUSTA (corrige seriales Excel, ISO, DD/MM/YYYY, etc.) <<<
  function toDate(val) {
    if (val == null || val === "") return null;

    // Ya es Date válido
    if (val instanceof Date && !isNaN(val)) return val;

    // NÚMEROS (serial Excel, timestamps)
    if (typeof val === "number") {
      // Serial Excel (sistema 1900): días desde 1899-12-30
      // Rango típico 20000..60000 ≈ años 1954..2064
      if (val > 20000 && val < 60000) {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
      }
      // Epoch (ms)
      if (val > 1e12) return new Date(val);
      // Epoch (s)
      if (val > 1e9) return new Date(val * 1000);
    }

    // CADENAS
    if (typeof val === "string") {
      const s = val.trim();
      if (!s) return null;

      // Serial Excel como string (4-5 dígitos)
      if (/^\d{4,5}$/.test(s)) {
        const n = parseInt(s, 10);
        if (n > 20000 && n < 60000) {
          return new Date(Math.round((n - 25569) * 86400 * 1000));
        }
      }

      // Intento directo (ISO u otros)
      let d = dayjs(s);
      if (d.isValid()) return d.toDate();

      // Formatos estrictos más comunes
      const fmts = [
        "DD/MM/YYYY", "D/M/YYYY",
        "YYYY-MM-DD",
        "MM/DD/YYYY", "M/D/YYYY",
        "YYYY/MM/DD",
        "DD-MM-YYYY", "D-M-YYYY",
        "DD.MM.YYYY", "D.M.YYYY",
        "DD/MM/YY", "D/M/YY", "DD-MM-YY", "D-M-YY"
      ];
      for (const f of fmts) {
        d = dayjs(s, f, true);
        if (d.isValid()) return d.toDate();
      }
    }

    return null;
  }

  function isValidated(v) {
    if (typeof v === "boolean") return v === true;
    if (typeof v === "number")  return v === 1;
    const s = String(v == null ? "" : v).trim().toLowerCase();
    if (["true","1","si","sí","y","yes","validado","conforme","verdadero"].includes(s)) return true;
    if (["false","0","no","n","pendiente","rechazado","falso"].includes(s)) return false;
    const prefs = loadPrefs() || {};
    const cfg   = (prefs.estatusValidado || "").toString().trim().toLowerCase();
    return cfg ? (s === cfg) : false;
  }

  // ================== Autenticación básica (localStorage) ==================
  function getCurrentUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
  function setCurrentUser(u) { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {} }
  function clearCurrentUser(){ try { localStorage.removeItem(USER_KEY); } catch {} }
  function loadUsers()      { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch { return []; } }
  function saveUsers(users) { try { localStorage.setItem(USERS_KEY, JSON.stringify(users || [])); } catch {} }
  function resetUsers()     { try { localStorage.removeItem(USERS_KEY); localStorage.removeItem(USER_KEY); } catch {} }
  function requireLogin()   {
    const u = getCurrentUser();
    if (!u) {
      try { sessionStorage.setItem("return_to", location.pathname + location.search); } catch {}
      location.href = "index.html";
    }
  }
  function requireRole(role){
    const u = getCurrentUser();
    return !!(u && u.role === role);
  }

  // ================== Exponer API global ==================
  window.Common = {
    setStatus, exportCSV,
    saveRows, loadRows, clearRows,
    savePrefs, loadPrefs, parseFile,
    uniqueVals, detectCol, toDate, isValidated,
    getCurrentUser, setCurrentUser, clearCurrentUser,
    loadUsers, saveUsers, resetUsers, requireLogin, requireRole
  };
})();
