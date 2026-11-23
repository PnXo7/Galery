// Galería del cliente: acceso por código o link, favoritas y descargas (incl. ZIP).
const visitorId = localStorage.getItem("if_visitor") || (() => { const v = crypto.randomUUID(); localStorage.setItem("if_visitor", v); return v; })();
const $ = (id) => document.getElementById(id);
let gallery = null, current = 0;
const favSet = new Set();
const HEART = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.6 3.5 7 5.4 5 7.9 5c1.6 0 3.2.9 4.1 2.3C12.9 5.9 14.5 5 16.1 5c2.5 0 4.4 2 4.4 4.6 0 3.7-3.5 6.9-8.5 10.9z"/></svg>';

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Algo salió mal");
  return d;
}
function show(id) { ["loading", "code-entry", "gallery-view", "error-view"].forEach((x) => $(x).classList.toggle("hidden", x !== id)); }

async function init() {
  const token = new URLSearchParams(location.search).get("t");
  try {
    if (token) { await api("/api/access", { method: "POST", body: JSON.stringify({ token }) }); history.replaceState({}, "", "galeria.html"); }
    gallery = await api(`/api/gallery?v=${visitorId}`);
    render();
  } catch (e) {
    if (token) { show("error-view"); $("error-view").innerHTML = `<h2 class="section-title">Ups…</h2><p>${e.message}</p>`; }
    else show("code-entry");
  }
}
$("code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await api("/api/access", { method: "POST", body: JSON.stringify({ code: $("code-input").value.trim() }) }); init(); }
  catch (e2) { $("code-msg").textContent = e2.message; }
});

function render() {
  show("gallery-view");
  $("g-title").textContent = gallery.title;
  const exp = gallery.expiresAt ? new Date(gallery.expiresAt).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "";
  $("g-meta").textContent = `${gallery.photos.length} fotografías${exp ? " · Disponible hasta el " + exp : ""}`;
  favSet.clear(); gallery.favorites.forEach((f) => favSet.add(f)); syncFavCount();
  $("gallery-grid").innerHTML = gallery.photos.map((p, i) => `
    <figure class="g-item">
      <img src="${p.thumb}" alt="${p.filename}" loading="lazy" data-open="${i}">
      <figcaption>
        <button class="fav ${favSet.has(p.id) ? "active" : ""}" data-fav="${p.id}" aria-label="Favorita">${HEART}</button>
        <a class="dl" href="${p.original}" download title="Descargar original" aria-label="Descargar original"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg></a>
      </figcaption>
    </figure>`).join("");
  document.querySelectorAll("[data-open]").forEach((img) => img.addEventListener("click", () => openLb(+img.dataset.open)));
  document.querySelectorAll("[data-fav]").forEach((b) => b.addEventListener("click", () => toggleFav(b.dataset.fav, b)));
}
function syncFavCount() { $("fav-count").textContent = favSet.size; }

async function toggleFav(photoId, btn) {
  try {
    const d = await api("/api/favorites", { method: "POST", body: JSON.stringify({ photoId, visitorId }) });
    if (d.favorite) { favSet.add(photoId); showToast("Agregada a tus favoritas"); } else { favSet.delete(photoId); showToast("Quitado de favoritas"); }
    if (btn) btn.classList.toggle("active", d.favorite);
    syncFavCount();
    if (gallery.photos[current]?.id === photoId) syncLbFav();
  } catch (e) { showToast(e.message); }
}

// Lightbox con zoom (doble clic / pellizco / rueda) y paneo (arrastrar)
let zoom = { scale: 1, x: 0, y: 0 };
function applyZoom(animate = true) {
  const img = $("lb-img");
  img.style.transition = animate ? "transform .25s ease" : "none";
  img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  img.classList.toggle("zoomed", zoom.scale > 1);
}
function resetZoom() { zoom = { scale: 1, x: 0, y: 0 }; applyZoom(false); }
function clampPan() {
  const img = $("lb-img"), r = img.getBoundingClientRect();
  const maxX = Math.max(0, (r.width - innerWidth * 0.92) / 2 + 80), maxY = Math.max(0, (r.height - innerHeight * 0.76) / 2 + 80);
  zoom.x = Math.min(maxX, Math.max(-maxX, zoom.x)); zoom.y = Math.min(maxY, Math.max(-maxY, zoom.y));
}
function setZoom(scale, cx = innerWidth / 2, cy = innerHeight / 2) {
  scale = Math.min(4, Math.max(1, scale));
  if (scale === zoom.scale) return;
  const img = $("lb-img"), r = img.getBoundingClientRect();
  const px = (cx - (r.left + r.width / 2)) / zoom.scale, py = (cy - (r.top + r.height / 2)) / zoom.scale;
  zoom.x -= px * (scale - zoom.scale); zoom.y -= py * (scale - zoom.scale); zoom.scale = scale;
  if (zoom.scale === 1) { zoom.x = 0; zoom.y = 0; } else clampPan();
  applyZoom();
  if (zoom.scale > 1.4) { // al acercar, cargar la foto en calidad original para ver nítido
    const p = gallery.photos[current];
    if (p && $("lb-img").dataset.hq !== p.id) { $("lb-img").dataset.hq = p.id; const pre = new Image(); pre.onload = () => { if (gallery.photos[current] === p) $("lb-img").src = p.original; }; pre.src = p.original; }
  }
}
// Al abrir el visor se agrega una entrada al historial: así el botón
// "atrás" del teléfono/celular CIERRA la foto en vez de sacar de la página.
let lbInHistory = false;
function openLb(i) {
  const wasOpen = $("lightbox").classList.contains("open");
  current = i; const p = gallery.photos[i]; const img = $("lb-img"); img.dataset.hq = ""; img.src = p.preview; resetZoom(); $("lb-dl").href = p.original; syncLbFav(); $("lightbox").classList.add("open"); document.body.style.overflow = "hidden";
  if (!wasOpen) { history.pushState({ ifLightbox: true }, ""); lbInHistory = true; }
}
function closeLbUI() { $("lightbox").classList.remove("open"); document.body.style.overflow = ""; resetZoom(); lbInHistory = false; }
function closeLb() { // cierre pedido por el usuario (X / Escape / fondo): consume la entrada del historial
  if (lbInHistory) history.back(); else closeLbUI();
}
addEventListener("popstate", () => { if ($("lightbox").classList.contains("open")) closeLbUI(); });
$("lb-img").addEventListener("dblclick", (e) => { e.preventDefault(); setZoom(zoom.scale > 1 ? 1 : 2.6, e.clientX, e.clientY); });
$("lb-img").addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom.scale * (e.deltaY < 0 ? 1.18 : 0.85), e.clientX, e.clientY); }, { passive: false });
const pointers = new Map(); let pinchDist = 0, dragLast = null;
$("lb-img").addEventListener("pointerdown", (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragLast = { x: e.clientX, y: e.clientY }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); } $("lb-img").setPointerCapture(e.pointerId); });
$("lb-img").addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinchDist) setZoom(zoom.scale * (d / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2); pinchDist = d; }
  else if (zoom.scale > 1 && dragLast) { zoom.x += e.clientX - dragLast.x; zoom.y += e.clientY - dragLast.y; dragLast = { x: e.clientX, y: e.clientY }; clampPan(); applyZoom(false); }
});
const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size === 0) dragLast = null; pinchDist = 0; };
$("lb-img").addEventListener("pointerup", endPointer);
$("lb-img").addEventListener("pointercancel", endPointer);
function syncLbFav() { const p = gallery.photos[current]; const on = favSet.has(p.id); $("lb-fav").innerHTML = HEART; $("lb-fav").classList.toggle("is-fav", on); $("lb-fav").title = on ? "Quitar de favoritas" : "Agregar a favoritas"; $("lb-fav").setAttribute("aria-label", $("lb-fav").title); }
$("lb-close").onclick = closeLb;
$("lb-prev").onclick = () => openLb((current - 1 + gallery.photos.length) % gallery.photos.length);
$("lb-next").onclick = () => openLb((current + 1) % gallery.photos.length);
$("lb-fav").onclick = () => toggleFav(gallery.photos[current].id);
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLb(); });
addEventListener("keydown", (e) => { if (!$("lightbox").classList.contains("open")) return; if (e.key === "Escape") closeLb(); if (e.key === "ArrowLeft") $("lb-prev").click(); if (e.key === "ArrowRight") $("lb-next").click(); });

// ZIP (generado en el navegador: gratis, sin costo de servidor)
async function downloadZip(photos, label) {
  if (!photos.length) return showToast("No hay fotos para descargar");
  $("zip-progress").classList.remove("hidden");
  try {
    const { downloadZip: makeZip } = await import("https://cdn.jsdelivr.net/npm/client-zip@2.4.5/index.js");
    const files = [];
    for (let i = 0; i < photos.length; i++) {
      $("zip-msg").textContent = `Descargando foto ${i + 1} de ${photos.length} para tu ZIP… (no cierres esta pestaña)`;
      $("zip-bar").style.width = `${(i / photos.length) * 100}%`;
      const r = await fetch(photos[i].original);
      files.push({ name: photos[i].filename || `foto-${i + 1}.jpg`, input: await r.blob() });
    }
    $("zip-msg").textContent = "Creando tu archivo ZIP…";
    const blob = await makeZip(files).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${label}.zip`; a.click();
    URL.revokeObjectURL(a.href);
    showToast("ZIP listo. ¡A disfrutar tus fotos!");
  } catch (e) { showToast("No se pudo crear el ZIP: " + e.message); }
  $("zip-progress").classList.add("hidden");
}
$("btn-all-zip").onclick = () => downloadZip(gallery.photos, gallery.title.replace(/\s+/g, "-"));
$("btn-fav-zip").onclick = () => downloadZip(gallery.photos.filter((p) => favSet.has(p.id)), gallery.title.replace(/\s+/g, "-") + "-favoritas");

init();
