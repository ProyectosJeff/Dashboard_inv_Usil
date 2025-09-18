// assets/dashboard.js
(function () {
  // ========= Helpers de common.js =========
  const C = window.Common || {};
  const {
    parseFile, setStatus, saveRows, loadRows, clearRows,
    savePrefs, loadPrefs, exportCSV,
    uniqueVals, detectCol, toDate, isValidated,
    requireLogin, getCurrentUser
  } = C;

  // ====== RUTA DEL ARCHIVO CENTRAL (ajústala a donde lo subas en tu repo) ======
  //   const CENTRAL_DATA_URL = "./DATA_GENERAL_1.csv";
  //   const CENTRAL_DATA_URL = "./data/DATA_GENERAL_1.csv";
  const CENTRAL_DATA_URL = "./DATA_GENERAL_1.xlsx";

  try { if (window.ChartDataLabels) { Chart.register(window.ChartDataLabels); } } catch (e) {}

  const state = {
    rows: [],
    headers: [],
    charts: {},
    map: { sede: null, estatus: null, fecha: null, ultimo: null, activo: null, estatusValidado: "Validado" },
    role: "usuario",
  };

  // ========= Utilidades =========
  function destroyChart(key){
    if(state.charts[key]){
      try{ state.charts[key].destroy(); }catch(_){}
      delete state.charts[key];
    }
  }
  function destroyCharts(){ Object.keys(state.charts).forEach(destroyChart); }

  function inRange(dateObj, fromISO, toISO){
    if (!dateObj) return false;
    let ok = true;
    const d = dayjs(dateObj);
    if (fromISO){ ok = ok && (d.isSame(fromISO) || d.isAfter(fromISO)); }
    if (toISO){ ok = ok && (d.isSame(toISO) || d.isBefore(toISO)); }
    return ok;
  }
  function bucketKey(dateObj, agg){
    const d = dayjs(dateObj);
    if (agg === "month") return d.format("YYYY-MM");
    if (agg === "week")  return d.format("GGGG-[W]WW");
    return d.format("YYYY-MM-DD");
  }

  function applyBaseFilters(rows){
    const sedeFilter   = (document.getElementById("filter_sede")||{}).value || "";
    const ultimoFilter = (document.getElementById("filter_ultimo")||{}).value || "";
    const sedeCol = state.map.sede, ultimoCol = state.map.ultimo;
    const dyn = getDynamicFilters();
    return rows.filter(r => {
      const okSede = !sedeFilter || ((r[sedeCol] ?? '').toString().trim() === sedeFilter);
      const okUlt  = !ultimoFilter || ((r[ultimoCol] ?? '').toString().trim() === ultimoFilter);
      const okDyn  = dyn.every(f => ((r[f.col] ?? '').toString().trim() === f.val));
      return okSede && okUlt && okDyn;
    });
  }

  // ========= KPIs =========
  function updateKPIs(){
    const total = state.rows.length;
    const sedeCol = state.map.sede;
    const ultimoCol = state.map.ultimo;
    const dateCol = state.map.fecha;

    const elTotal = document.getElementById("kpiTotal");
    const elSedes = document.getElementById("kpiSedes");
    const elUsers = document.getElementById("kpiUsers");
    const elRange = document.getElementById("kpiRange");

    if (elTotal) elTotal.textContent = total;
    if (elSedes) elSedes.textContent = sedeCol ? new Set(state.rows.map(r => (r[sedeCol] ?? "").toString().trim()).filter(Boolean)).size : "—";
    if (elUsers) elUsers.textContent = ultimoCol ? new Set(state.rows.map(r => (r[ultimoCol] ?? "").toString().trim()).filter(Boolean)).size : "—";

    if (dateCol){
      const fromISO = (document.getElementById("filter_from")||{}).value || null;
      const toISO   = (document.getElementById("filter_to")||{}).value || null;
      const dates = state.rows
        .map(r => toDate(r[dateCol])).filter(Boolean)
        .filter(d=>inRange(d, fromISO, toISO))
        .map(d => dayjs(d).format("YYYY-MM-DD"))
        .sort();
      if (elRange) elRange.textContent = dates.length ? `${dates[0]} → ${dates[dates.length-1]}` : "—";
    } else {
      if (elRange) elRange.textContent = "— (mapea Fecha)";
    }
  }

  // ========= Filtros dinámicos =========
  function fillHeaderOptions(selectId){
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const headers = state.headers || [];
    sel.innerHTML = headers.map(h=>`<option value="${h}">${h}</option>`).join("");
  }
  function fillValuesFor(columnSelectId, valueSelectId){
    const colSel = document.getElementById(columnSelectId);
    const valSel = document.getElementById(valueSelectId);
    if (!colSel || !valSel) return;
    const col = colSel.value;
    const vals = new Set();
    (state.rows||[]).forEach(r=>{ const v=r[col]; if(v!=null){ const s=String(v).trim(); if(s) vals.add(s); } });
    valSel.innerHTML = '<option value="">(Todos)</option>' + Array.from(vals).sort((a,b)=>a.localeCompare(b)).map(v=>`<option value="${v}">${v}</option>`).join("");
  }
  function getDynamicFilters(){
    const rows = [];
    for (let i=1;i<=3;i++){
      const colSel = document.getElementById("fcol"+i);
      const valSel = document.getElementById("fval"+i);
      if (colSel && valSel && colSel.value && valSel.value){
        rows.push({col: colSel.value, val: valSel.value});
      }
    }
    return rows;
  }

  // ========= Pivots existentes =========
  function pivotSedeResumen(rows){
    const sedeCol = state.map.sede, estCol = state.map.estatus;
    if (!sedeCol || !estCol) return {rows:[], totals:{f:0,t:0,all:0}};
    const acc = new Map(); // sede -> {f,t}
    for (const r of rows){
      const sede = (r[sedeCol] ?? "").toString().trim() || "—";
      const ok = isValidated(r[estCol]);
      const cur = acc.get(sede) || {f:0,t:0};
      ok ? (cur.t++) : (cur.f++);
      acc.set(sede, cur);
    }
    const out = Array.from(acc.entries()).map(([s,{f,t}]) => ({ sede:s, falso:f, verdadero:t, total:f+t }));
    const totals = out.reduce((m,r)=>{ m.f+=r.falso; m.t+=r.verdadero; m.all+=r.total; return m; }, {f:0,t:0,all:0});
    return {rows:out, totals};
  }
  function renderPivotSede(rows){
    const tb = document.querySelector("#tblSedeResumen tbody");
    if (!tb) return;
    const sortBy = (document.getElementById("opt_sort")||{}).value || "total";
    const topN   = Math.max(5, Math.min(100, parseInt((document.getElementById("opt_top")||{}).value||"20",10)));
    const d = pivotSedeResumen(rows);
    let out = d.rows.slice();
    if (sortBy === "total") out.sort((a,b)=> b.total - a.total || a.sede.localeCompare(b.sede));
    if (sortBy === "true")  out.sort((a,b)=> b.verdadero - a.verdadero || a.sede.localeCompare(b.sede));
    if (sortBy === "false") out.sort((a,b)=> b.falso - a.falso || a.sede.localeCompare(b.sede));
    if (sortBy === "sede")  out.sort((a,b)=> a.sede.localeCompare(b.sede));
    out = out.slice(0, topN);

    tb.innerHTML = out.map(r=>`<tr><td>${r.sede}</td><td>${r.falso}</td><td>${r.verdadero}</td><td>${r.total}</td></tr>`).join("");
    const f = document.getElementById("sumFalso"), v = document.getElementById("sumVerd"), tt = document.getElementById("sumTotal");
    if (f) f.textContent = d.totals.f; if (v) v.textContent = d.totals.t; if (tt) tt.textContent = d.totals.all;
    return out;
  }

  function pivotUsuarioDetalle(rows){
    const dateCol = state.map.fecha, sedeCol = state.map.sede, ultimoCol = state.map.ultimo, estCol = state.map.estatus;
    if (!dateCol || !sedeCol || !ultimoCol) return [];
    const onlyTrue = (document.getElementById("onlyTrue")||{}).checked !== false;

    const byUser = new Map(); // user -> Map("sede||fecha" -> count)
    const totals = new Map(); // user -> total
    for (const r of rows){
      const u = (r[ultimoCol] ?? "Usuario Desconocido").toString().trim() || "Usuario Desconocido";
      if (onlyTrue && !isValidated(r[estCol])) continue;
      const d = toDate(r[dateCol]); if (!d) continue;
      const fecha = dayjs(d).format("DD/MM/YYYY");
      const sede  = (r[sedeCol] ?? "").toString().trim() || "—";
      const k = sede + "||" + fecha;

      if (!byUser.has(u)) byUser.set(u, new Map());
      const m = byUser.get(u);
      m.set(k, (m.get(k)||0)+1);
      totals.set(u, (totals.get(u)||0)+1);
    }

    const users = Array.from(byUser.keys()).sort((a,b)=> (totals.get(b)||0) - (totals.get(a)||0) || a.localeCompare(b));
    const rowsOut = [];
    for (const u of users){
      const m = byUser.get(u);
      const pairs = Array.from(m.entries()).map(([k,c])=>{
        const [sede,fecha] = k.split("||");
        return {u,sede,fecha,total:c};
      }).sort((a,b)=> dayjs(a.fecha,"DD/MM/YYYY") - dayjs(b.fecha,"DD/MM/YYYY") || a.sede.localeCompare(b.sede));
      rowsOut.push({type:"detail", rows:pairs, user:u, total: (totals.get(u)||0)});
    }
    return rowsOut;
  }
  function renderPivotUsuario(rows){
    const tb = document.querySelector("#tblUsuarioDetalle tbody");
    if (!tb) return;
    const blocks = pivotUsuarioDetalle(rows);
    const html = [];
    for (const blk of blocks){
      for (const r of blk.rows){
        html.push(`<tr><td></td><td>${r.sede}</td><td>${r.fecha}</td><td>${r.total}</td></tr>`);
      }
      html.push(`<tr class="row-total"><td>Total ${blk.user}</td><td></td><td></td><td>${blk.total}</td></tr>`);
    }
    tb.innerHTML = html.join("");
  }

  // ----------------- Sede → COND — helpers -----------------
  function fillScSede(){
    const sel = document.getElementById("scSede");
    if (!sel) return;
    const sedeCol = state.map.sede;
    const vals = sedeCol ? uniqueVals(state.rows, sedeCol).sort((a,b)=>a.localeCompare(b)) : [];
    sel.innerHTML = `<option value="">(Todas)</option>` + vals.map(v=>`<option value="${v}">${v}</option>`).join("");
    // sincroniza con el filtro global si existe
    const global = (document.getElementById("filter_sede")||{}).value || "";
    sel.value = global;
  }

  // Agrupa por sede ⇒ cond ⇒ conteos de TRUE/FALSE
  function pivotSedeCond(rows){
    const sedeCol = state.map.sede;
    const condCol = state.map.activo;   // "Campo Activo (opcional)" como COND
    const estCol  = state.map.estatus;

    if (!sedeCol || !condCol || !estCol){
      return { blocks:[], totals:{f:0,t:0,all:0}, missing:true };
    }

    const q = ((document.getElementById("scSearch")||{}).value || "").trim().toLowerCase();

    // Estructura: sede -> Map(cond -> {f,t})
    const bySede = new Map();
    const totals = { f:0, t:0, all:0 };

    for (const r of rows){
      const sede = (r[sedeCol] ?? "—").toString().trim() || "—";
      const cond = (r[condCol] ?? "(en blanco)").toString().trim() || "(en blanco)";

      if (q && !cond.toLowerCase().includes(q)) continue;

      const ok = isValidated(r[estCol]);

      if (!bySede.has(sede)) bySede.set(sede, new Map());
      const m = bySede.get(sede);
      if (!m.has(cond)) m.set(cond, {f:0,t:0});

      const cur = m.get(cond);
      ok ? (cur.t++) : (cur.f++);
      totals[ ok ? "t" : "f" ]++;
      totals.all++;
    }

    const blocks = [];
    const sedes = Array.from(bySede.keys()).sort((a,b)=>a.localeCompare(b));
    for (const s of sedes){
      const m = bySede.get(s);
      const rowsOut = Array.from(m.entries()).map(([cond, cnt])=>{
        const total = cnt.f + cnt.t;
        return { sede:s, cond, falso:cnt.f, verdadero:cnt.t, total };
      }).sort((a,b)=> b.total - a.total || a.cond.localeCompare(b.cond));

      const subtotal = rowsOut.reduce((acc,r)=>{ acc.f+=r.falso; acc.t+=r.verdadero; acc.all+=r.total; return acc; }, {f:0,t:0,all:0});
      blocks.push({ sede:s, rows:rowsOut, subtotal });
    }

    return { blocks, totals, missing:false };
  }

  function renderSedeCond(rows){
    const body = document.getElementById("tblSedeCondBody");
    const info = document.getElementById("scStatus");
    if (!body) return;

    if (!state.map.sede || !state.map.activo || !state.map.estatus){
      body.innerHTML = "";
      if (info) info.textContent = "Mapea “Sede”, “Estatus (true/false)” y “Campo Activo (opcional)” (COND) en la sección de Mapeo.";
      return;
    }

    // Si hay selector local de sede, sincronizamos con el global
    const localSedeSel  = document.getElementById("scSede");
    const globalSedeSel = document.getElementById("filter_sede");
    if (localSedeSel && globalSedeSel && (localSedeSel.value !== globalSedeSel.value)){
      globalSedeSel.value = localSedeSel.value || "";
    }

    // 'rows' ya viene de applyBaseFilters() → respeta filtros globales
    const p = pivotSedeCond(rows);

    if (p.missing){
      body.innerHTML = "";
      if (info) info.textContent = "Faltan columnas mapeadas.";
      return;
    }

    const selectedSede = (document.getElementById("filter_sede")||{}).value || "";
    const fmt = n => n.toLocaleString("es-PE");
    const html = [];

    for (const b of p.blocks){
      if (selectedSede && b.sede !== selectedSede) continue;

      // Filas detalle (COND)
      for (const r of b.rows){
        html.push(`<tr>
          <td style="text-align:left">${b.sede}</td>
          <td style="text-align:left">${r.cond}</td>
          <td style="text-align:right">${fmt(r.falso)}</td>
          <td style="text-align:right">${fmt(r.verdadero)}</td>
          <td style="text-align:right">${fmt(r.total)}</td>
        </tr>`);
      }
      // Subtotal por sede
      html.push(`<tr class="row-total">
        <td style="text-align:left;font-weight:600">Total ${b.sede}</td>
        <td></td>
        <td style="text-align:right;font-weight:600">${fmt(b.subtotal.f)}</td>
        <td style="text-align:right;font-weight:600">${fmt(b.subtotal.t)}</td>
        <td style="text-align:right;font-weight:600">${fmt(b.subtotal.all)}</td>
      </tr>`);
    }

    body.innerHTML = html.join("");

    if (info) {
      const sedeTxt = selectedSede || "todas las sedes";
      info.textContent = `Mostrando ${sedeTxt}. Registros: ${fmt(p.totals.all)} (TRUE: ${fmt(p.totals.t)} | FALSE: ${fmt(p.totals.f)})`;
    }
  }

  // ========= GRÁFICOS =========
  function renderChartSede(rows){
    const ctx = document.getElementById("chartSedePro");
    if (!ctx) return;

    const percent = (document.getElementById("opt_percent")||{}).checked || false;
    const sortBy  = (document.getElementById("opt_sort")||{}).value || "total";
    const topN    = Math.max(5, Math.min(100, parseInt((document.getElementById("opt_top")||{}).value||"20",10)));

    const d = pivotSedeResumen(rows);
    let list = d.rows.slice();
    if (sortBy === "total") list.sort((a,b)=> b.total - a.total || a.sede.localeCompare(b.sede));
    if (sortBy === "true")  list.sort((a,b)=> b.verdadero - a.verdadero || a.sede.localeCompare(b.sede));
    if (sortBy === "false") list.sort((a,b)=> b.falso - a.falso || a.sede.localeCompare(b.sede));
    if (sortBy === "sede")  list.sort((a,b)=> a.sede.localeCompare(b.sede));
    list = list.slice(0, topN);

    const labels = list.map(x=>x.sede);
    let dTrue  = list.map(x=>x.verdadero);
    let dFalse = list.map(x=>x.falso);

    let xScale = { stacked:true, beginAtZero:true };
    let fmt = (v)=> (v>0 ? v : "");
    if (percent){
      dTrue  = list.map(x=> x.total ? +(100*x.verdadero/x.total).toFixed(1) : 0);
      dFalse = list.map(x=> x.total ? +(100*x.falso/x.total).toFixed(1) : 0);
      xScale = { stacked:true, min:0, max:100, ticks:{callback:(v)=>v+"%"} };
      fmt = (v)=> (v>0 ? v+"%" : "");
    }

    destroyChart("sedePro");
    state.charts.sedePro = new Chart(ctx, {
      type:"bar",
      data:{ labels,
        datasets:[
          { label:"TRUE",  data:dTrue,  stack:"v",
            datalabels:{ anchor:"center", align:"center", formatter:fmt } },
          { label:"FALSE", data:dFalse, stack:"v",
            datalabels:{ anchor:"center", align:"center", formatter:fmt } }
        ]
      },
      options:{
        responsive:true,
        indexAxis:"y",
        plugins:{ legend:{ position:"top" }, tooltip:{ mode:"index", intersect:false } },
        scales:{ x: xScale, y:{ stacked:true } }
      }
    });
  }

  function getUserDateCube(rows){
    const selUlt = (document.getElementById("filter_ultimo")||{}).value || "";
    const agg    = (document.getElementById("agg")||{}).value || "day";
    const topUsersN  = Math.max(3, Math.min(20, parseInt((document.getElementById("opt_user_top")||{}).value||"10",10)));
    const topDatesN  = Math.max(3, Math.min(30, parseInt((document.getElementById("opt_user_dates")||{}).value||"10",10)));
    const dateCol = state.map.fecha, ultimoCol = state.map.ultimo, estCol = state.map.estatus;
    const fromISO = (document.getElementById("filter_from")||{}).value || null;
    const toISO   = (document.getElementById("filter_to")||{}).value || null;
    if (!dateCol || !ultimoCol || !estCol) return {users:[], buckets:[], map:new Map()};

    const onlyTrue = (document.getElementById("onlyTrue")||{}).checked !== false;

    const byUserDate = new Map(); // user -> Map(bucket -> count)
    const userTotals = new Map();
    const bucketSet  = new Set();

    for (const r of rows){
      const d = toDate(r[dateCol]); if (!d) continue;
      if (onlyTrue && !isValidated(r[estCol])) continue;
      if (!inRange(d, fromISO, toISO)) continue;

      const u = (r[ultimoCol] ?? "Usuario Desconocido").toString().trim() || "Usuario Desconocido";
      if (selUlt && u !== selUlt) continue;

      const b = bucketKey(d, agg);
      bucketSet.add(b);
      if (!byUserDate.has(u)) byUserDate.set(u, new Map());
      const m = byUserDate.get(u);
      m.set(b, (m.get(b)||0)+1);
      userTotals.set(u, (userTotals.get(u)||0)+1);
    }

    let users = Array.from(userTotals.entries()).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    if (selUlt) users = [selUlt]; else users = users.slice(0, topUsersN);

    const buckets = Array.from(bucketSet).sort().slice(-topDatesN); // últimas N fechas

    return { users, buckets, map: byUserDate };
  }

  function renderChartUsuario(rows){
    const ctx = document.getElementById("chartUsuarioPro");
    if (!ctx) return;

    const {users, buckets, map} = getUserDateCube(rows);

    destroyChart("usuarioPro");
    if (!users.length || !buckets.length){
      const g = ctx.getContext('2d'); if (g){ g.clearRect(0,0,ctx.width,ctx.height); }
      return;
    }

    const palette = (n)=> Array.from({length:n}, (_,i)=>`hsl(${Math.round((360/n)*i)}, 65%, 55%)`);
    const colors = palette(buckets.length);

    const datasets = buckets.map((b, idx)=>({
      label: b,
      data: users.map(u => map.get(u)?.get(b) || 0),
      backgroundColor: colors[idx],
      stack: "fechas",
      datalabels:{ anchor:"end", align:"end", formatter:v=> v>0? v:'', font:{size:10}, clip:true }
    }));

    state.charts.usuarioPro = new Chart(ctx, {
      type:'bar',
      data:{ labels: users, datasets },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'right' }, tooltip:{ mode:'index', intersect:false } },
        scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } }
      }
    });
  }

  // ========= Mapping & UI =========
  function fillUltimoFilter(){
    const ultimoCol = state.map.ultimo;
    const sel = document.getElementById("filter_ultimo");
    if (!sel) return;
    sel.innerHTML = '<option value="">(Todos)</option>';
    if (!ultimoCol) return;
    const vals = uniqueVals(state.rows, ultimoCol).sort((a,b)=>a.localeCompare(b));
    sel.innerHTML += vals.map(u=>`<option value="${u}">${u}</option>`).join("");
  }

  function fillMappingUI(){
    const headers = state.headers;
    const ids = ["map_sede","map_estatus","map_fecha","map_ultimo","map_activo"];
    ids.forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = headers.map(h=>`<option value="${h}">${h}</option>`).join("");
    });

    const prefs = loadPrefs() || {};
    state.map.sede   = prefs.sede   || detectCol(headers, [/^sede$/i,/agencia/i,/area/i]);
    state.map.estatus= prefs.estatus|| detectCol(headers, [/^validacion$/i,/validación/i,/estatus/i,/estado/i]);
    state.map.fecha  = prefs.fecha  || headers.find(h=>/^fecha$/i.test(h)) || detectCol(headers, [/fecha/i,/date/i]);
    state.map.ultimo = prefs.ultimo || headers.find(h=>/^ultimo_usuario$/i.test(h)) || detectCol(headers, [/ultimo_usuario/i,/ultimo_usu/i,/último_usuario/i,/usuario_final/i,/inventariador/i,/capturista/i]);
    state.map.activo = prefs.activo || detectCol(headers, [/activo/i,/act/i]);
    state.map.estatusValidado = typeof prefs.estatusValidado==="string" ? prefs.estatusValidado : "Validado";

    if (state.map.sede)   document.getElementById("map_sede").value   = state.map.sede;
    if (state.map.estatus)document.getElementById("map_estatus").value= state.map.estatus;
    if (state.map.fecha)  document.getElementById("map_fecha").value  = state.map.fecha;
    if (state.map.ultimo) document.getElementById("map_ultimo").value = state.map.ultimo;
    if (state.map.activo) document.getElementById("map_activo").value = state.map.activo;
    const val = document.getElementById("map_validado"); if (val) val.value = state.map.estatusValidado;

    const sedeVals = state.map.sede ? uniqueVals(state.rows, state.map.sede) : [];
    const sedeSel = document.getElementById("filter_sede");
    if (sedeSel){ sedeSel.innerHTML = `<option value="">Todas las sedes</option>` + sedeVals.map(v=>`<option value="${v}">${v}</option>`).join(""); }
    fillUltimoFilter();
    fillScSede(); // ← llena el combo del cuadro SEDE→COND

    ['fcol1','fcol2','fcol3'].forEach(fillHeaderOptions);
    ['fcol1','fcol2','fcol3'].forEach((id,i)=>{ const vId='fval'+(i+1); fillValuesFor(id, vId); });
    ['fcol1','fcol2','fcol3'].forEach((id,i)=>{
      const vId='fval'+(i+1);
      const el=document.getElementById(id);
      if(el){ el.addEventListener('change', ()=>{ fillValuesFor(id,vId); updateKPIs(); renderAll(); }); }
    });
  }

  function onSavePrefs(){
    state.map.sede   = document.getElementById("map_sede").value;
    state.map.estatus= document.getElementById("map_estatus").value;
    state.map.fecha  = document.getElementById("map_fecha").value;
    state.map.ultimo = document.getElementById("map_ultimo").value;
    state.map.activo = document.getElementById("map_activo").value;
    state.map.estatusValidado = document.getElementById("map_validado").value.trim();
    savePrefs(state.map);
    updateKPIs(); renderAll();
  }

  // ========= Render principal =========
  function renderAll(){
    destroyCharts();
    if (!state.rows.length) return;
    const rows = applyBaseFilters(state.rows);
    renderPivotSede(rows);
    renderPivotUsuario(rows);
    renderChartSede(rows);
    renderChartUsuario(rows);
    // NUEVO → tabla SEDE → COND → VALIDACIÓN
    renderSedeCond(rows);
  }

  // ========= Carga de archivo (solo Admin; útil para pruebas locales) =========
  async function onFileChange(e){
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStatus(document.getElementById("status"), "Leyendo archivo…");
    try{
      const rows = await parseFile(file);
      if (!rows || !rows.length) throw new Error("Archivo vacío");
      state.rows = rows; state.headers = Object.keys(rows[0] || {});
      await saveRows(rows);
      fillMappingUI(); updateKPIs(); renderAll();
      setStatus(document.getElementById("status"), `Listo. ${rows.length} registros cargados.`);
    }catch(err){
      console.error(err);
      setStatus(document.getElementById("status"), "Error leyendo archivo. Revisa la consola (F12) para detalles.", true);
    } finally { try{ e.target.value = ""; }catch(_){ } }
  }

  // ========= Descarga central del archivo del servidor =========
  async function fetchCentralData(url){
    const sep = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${sep}cb=${Date.now()}`;
    const res = await fetch(fullUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo descargar el archivo central: " + res.status);

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const lower = url.toLowerCase();

    // JSON
    if (ct.includes("json") || lower.endsWith(".json")){
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("El JSON debe ser un array de objetos");
      return data;
    }

    // XLS/XLSX
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")){
      const buf = await res.arrayBuffer();
      if (typeof XLSX === "undefined") throw new Error("Falta XLSX en la página");
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    // CSV
    const txt = await res.text();
    if (typeof Papa === "undefined") throw new Error("Falta PapaParse en la página");
    return await new Promise((resolve, reject)=>{
      Papa.parse(txt, { header:true, skipEmptyLines:true,
        complete: r => resolve(r.data), error: err => reject(err)
      });
    });
  }

  // ========= Init =========
  document.addEventListener("DOMContentLoaded", async ()=>{
    requireLogin && requireLogin();
    const current = getCurrentUser ? getCurrentUser() : null;
    state.role = (current && current.role) ? current.role : "usuario";
    const hello = document.getElementById("helloUser");
    if (hello) hello.textContent = `${current ? current.username : ""} (${state.role})`;

    const isAdmin = state.role === "admin";

    // Mostrar/ocultar controles de Admin (carga/export/borrar)
    const idsAdmin = ["uploadLabel","exportAll","clearData","expSede","expUsuario"];
    idsAdmin.forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      if (!isAdmin){ el.style.display="none"; el.disabled = true; }
      else { el.style.display=""; el.disabled = false; }
    });

    const fileInput = document.getElementById("fileInput");
    if (fileInput){
      if (!isAdmin) fileInput.disabled = true;
      fileInput.addEventListener("change", onFileChange);
    }

    // Filtros globales existentes
    ["filter_sede","filter_ultimo","filter_from","filter_to","agg","onlyTrue","fval1","fval2","fval3",
     "opt_sort","opt_top","opt_percent","opt_user_top","opt_user_dates"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.addEventListener("change", ()=>{ updateKPIs(); renderAll(); });
    });

    // Guardar mapeo
    const saveBtn=document.getElementById("savePrefs");
    if (saveBtn) saveBtn.addEventListener("click", onSavePrefs);

    // ===== NUEVO: Controles del cuadro SEDE → COND =====
    fillScSede(); // llena el combo "scSede" si ya hay datos

    // eventos de los controles locales
    const scSede   = document.getElementById("scSede");
    const scSearch = document.getElementById("scSearch");
    if (scSede)   scSede.addEventListener("change", ()=> { renderAll(); });
    if (scSearch) scSearch.addEventListener("input",  ()=> { renderAll(); });

    // sincronía con el filtro global de sede
    const globalSedeSel = document.getElementById("filter_sede");
    if (globalSedeSel){
      globalSedeSel.addEventListener("change", ()=>{
        const sel = document.getElementById("scSede");
        if (sel) sel.value = globalSedeSel.value || "";
        renderAll();
      });
    }

    // exportación del cuadro
    const scExport = document.getElementById("scExport");
    if (scExport){
      scExport.addEventListener("click", ()=>{
        const rows = applyBaseFilters(state.rows);
        const p = pivotSedeCond(rows);
        const flat = [];
        for (const b of p.blocks){
          for (const r of b.rows){
            flat.push({
              "SEDE": b.sede,
              "COND": r.cond,
              "FALSO": r.falso,
              "VERDADERO": r.verdadero,
              "Total general": r.total
            });
          }
          flat.push({
            "SEDE": `Total ${b.sede}`,
            "COND": "",
            "FALSO": b.subtotal.f,
            "VERDADERO": b.subtotal.t,
            "Total general": b.subtotal.all
          });
        }
        exportCSV(flat, "sede_cond_validacion.csv");
      });
    }

    // ========= 1) Intentar cargar SIEMPRE desde el archivo central del servidor =========
    let usedCentral = false;
    try{
      setStatus(document.getElementById("status"), "Cargando datos del servidor…");
      const rows = await fetchCentralData(CENTRAL_DATA_URL);
      if (rows && rows.length){
        state.rows = rows; state.headers = Object.keys(rows[0] || {});
        await saveRows(rows); // guarda local para navegación entre páginas/offline
        fillMappingUI(); updateKPIs(); renderAll();
        setStatus(document.getElementById("status"), `Datos del servidor listos (${rows.length} filas).`);
        usedCentral = true;
      }
    }catch(err){
      console.warn("No se pudo cargar del servidor:", err);
    }

    // ========= 2) Si central falló, intenta con datos locales persistidos =========
    if (!usedCentral){
      const stored = await loadRows();
      if (stored && stored.length){
        state.rows = stored; state.headers = Object.keys(stored[0] || {});
        fillMappingUI(); updateKPIs(); renderAll();
        setStatus(document.getElementById("status"), `Usando datos guardados (${stored.length} filas).`);
      } else {
        setStatus(document.getElementById("status"),
          (isAdmin ? "Sin datos. Reemplaza el archivo central en el servidor o carga un CSV/Excel (solo Admin)."
                   : "Sin datos. Intenta más tarde; el archivo central aún no está disponible."),
          true
        );
      }
    }
  });
})();
