// assets/tour.js
(() => {
  "use strict";

  function vp(){
  // visualViewport maneja zoom, teclado móvil y barras
  const vv = window.visualViewport;
  if (vv){
    return {
      vw: vv.width, vh: vv.height,
      pageX: vv.pageLeft, pageY: vv.pageTop
    };
  }
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    pageX: window.scrollX, pageY: window.scrollY
  };
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }


  // ===================== CONFIGURA AQUÍ TUS PASOS =====================
  // Cambia los selectores/ textos según tu UI.
  const STEPS = [
    { el: "#map_estatus",  title: "Mapea Estatus",  text: "Ajusta el valor de Estatus y elige VALIDACION, y en el CAMPO ACTIVO elige COND." },
    { el: "#filter_sede",  title: "Filtrar por Sede", text: "Elige una sede para ver sólo sus registros." },
    { el: "#filter_from",  title: "Rango de fechas",  text: "Define fecha DESDE (se incluye el día completo)." },
    { el: "#filter_to",    title: "Rango de fechas",  text: "Define fecha HASTA (también incluido entero)." },
    //{ el: "#tblSedeCond",  title: "Sede → COND → Validación", text: "Aquí verás validaciones por condición." }
  ];
  // ===================================================================

  let isOpen = false;
  let stepIndex = 0;
  let overlay = null, panel = null, highlight = null;
  const cleanup = [];

  function $(q){ return document.querySelector(q); }
  function rect(el){ try{ return el.getBoundingClientRect(); }catch{ return null; } }

  function make(tag, cls, html){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  }

  function on(el, ev, fn, opts){ el.addEventListener(ev, fn, opts); cleanup.push(()=> el.removeEventListener(ev, fn, opts)); }

  function stop(e){ e.preventDefault(); e.stopPropagation(); }

  function close(){
    if (!isOpen) return;
    isOpen = false;

    // Limpia listeners
    while (cleanup.length){ try{ cleanup.pop()(); }catch{} }

    // Limpia nodos
    [overlay, panel, highlight].forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
    overlay = panel = highlight = null;

    // Restaura scroll
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  function go(delta){
    const newIdx = stepIndex + delta;
    if (newIdx < 0) return;
    if (newIdx >= STEPS.length){ close(); return; }
    stepIndex = newIdx;
    renderStep();
  }

  function renderStep(){
  const step = STEPS[stepIndex];
  const target = step && step.el ? $(step.el) : null;

  const { vw, vh, pageX, pageY } = vp();
  const pad = 12; // margen interno para no pegar a bordes

  // Posicionar highlight alrededor del target si es visible
  let r = target ? rect(target) : null;
  if (!r || r.width === 0 || r.height === 0){
    // Si no hay target visible: ocultar highlight y centrar panel
    highlight.style.display = "none";
    panel.style.left = `${pageX + vw/2}px`;
    panel.style.top  = `${pageY + vh*0.2}px`;
    panel.style.transform = "translate(-50%, 0)";
  } else {
    highlight.style.display = "block";
    const hl = {
      left:  clamp(r.left + pageX - 6, pageX + pad, pageX + vw - pad),
      top:   clamp(r.top  + pageY - 6, pageY + pad, pageY + vh - pad),
      width: r.width + 12,
      height:r.height + 12
    };
    highlight.style.left   = `${hl.left}px`;
    highlight.style.top    = `${hl.top}px`;
    highlight.style.width  = `${hl.width}px`;
    highlight.style.height = `${hl.height}px`;

    // Panel por defecto: debajo del target
    let px = hl.left;
    let py = hl.top + hl.height + 10;

    // Si no cabe abajo, colócalo arriba
    const panelW = Math.min(360, vw - pad*2);
    const panelH = 140; // aprox; igual se recalcula por contenido
    if (py + panelH > pageY + vh - pad){
      py = hl.top - panelH - 10;
      if (py < pageY + pad) py = pageY + pad;
    }

    // Evita salir por los lados
    px = clamp(px, pageX + pad, pageX + vw - panelW - pad);

    panel.style.left = `${px}px`;
    panel.style.top  = `${py}px`;
    panel.style.transform = "none";

    // Auto-scroll suave hacia el target (centrado), pero solo si está lejos
    const centerY = pageY + vh/2;
    const targetCenterY = hl.top + hl.height/2;
    if (Math.abs(targetCenterY - centerY) > 80){
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  // Contenido
  panel.querySelector(".tour-title").textContent = step?.title || `Paso ${stepIndex+1}`;
  panel.querySelector(".tour-text").textContent  = step?.text || "";
  panel.querySelector(".tour-count").textContent = `${stepIndex+1}/${STEPS.length}`;
}


  function buildUI(){
    // Overlay click-through guard y backdrop
    overlay = make("div", "tour-overlay");
    document.body.appendChild(overlay);

    // Captura cualquier pointer para que no “haga click” por debajo
    on(overlay, "pointerdown", stop, { passive:false, capture:true });
    on(overlay, "pointerup",   stop, { passive:false, capture:true });
    on(overlay, "wheel",       stop, { passive:false, capture:true });

    // Resalta target
    highlight = make("div", "tour-highlight");
    document.body.appendChild(highlight);

    // Panel
    panel = make("div", "tour-panel");
    panel.innerHTML = `
      <div class="tour-header">
        <div class="tour-title"></div>
        <button class="tour-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="tour-body"><div class="tour-text"></div></div>
      <div class="tour-footer">
        <span class="tour-count"></span>
        <div class="tour-actions">
          <button class="tour-btn tour-prev" type="button">Anterior</button>
          <button class="tour-btn tour-next" type="button">Siguiente</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Botones (solo un tipo de evento → pointerup)
    const prev = panel.querySelector(".tour-prev");
    const next = panel.querySelector(".tour-next");
    const x    = panel.querySelector(".tour-close");

    on(prev, "pointerup", (e)=>{ stop(e); go(-1); }, { passive:false });
    on(next, "pointerup", (e)=>{ stop(e); go(+1); }, { passive:false });
    on(x,    "pointerup", (e)=>{ stop(e); close(); }, { passive:false });

    // Evitar scroll de fondo
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Recalcular al redimensionar/rotar
    on(window, "resize", ()=> renderStep(), { passive:true });
    on(window, "orientationchange", ()=> setTimeout(renderStep, 300), { passive:true });
    on(window, "scroll", ()=> renderStep(), { passive:true });
    if (window.visualViewport){
  on(window.visualViewport, "resize", ()=> renderStep(), { passive:true });
  on(window.visualViewport, "scroll", ()=> renderStep(), { passive:true });
}

  }

  function start(force=false){
    if (isOpen) return;                    // antirrebote: no abrir 2 veces
    if (!Array.isArray(STEPS) || !STEPS.length) return;

    isOpen = true;
    stepIndex = 0;
    buildUI();
    renderStep();
  }

  // ——— NO auto-iniciar. Exponer API global para el botón de ayuda ———
  window.DashTour = {
    start: ()=> start(true),
    reset: ()=> { try{ localStorage.removeItem("dash_tour_seen"); }catch{} }
  };

  // Enlaza una sola vez el botón #btnHelp (idempotente)
  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = document.getElementById("btnHelp");
    if (btn && !btn.dataset.tourBound){
      btn.dataset.tourBound = "1";
      btn.addEventListener("pointerup", (e)=>{ e.preventDefault(); e.stopPropagation(); window.DashTour.start(); }, { passive:false });
      // Evita doble disparo en iOS antiguos
      btn.addEventListener("click", (e)=>{ e.preventDefault(); }, { passive:false });
    }
  });

})();
