// Galería del cliente: acceso por código o link, favoritas y descargas (incl. ZIP).
const visitorId = localStorage.getItem("if_visitor") || (() => { const v = crypto.randomUUID(); localStorage.setItem("if_visitor", v); return v; })();
const $ = (id) => document.getElementById(id);
let gallery = null, current = 0;
const favSet = new Set();

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
  catch (e2) { $("code-msg").textContent = "⚠️ " + e2.message; }
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
        <button class="fav ${favSet.has(p.id) ? "active" : ""}" data-fav="${p.id}">${favSet.has(p.id) ? "♥" : "♡"}</button>
        <a class="dl" href="${p.original}" download title="Descargar original">⬇</a>
      </figcaption>
    </figure>`).join("");
  document.querySelectorAll("[data-open]").forEach((img) => img.addEventListener("click", () => openLb(+img.dataset.open)));
  document.querySelectorAll("[data-fav]").forEach((b) => b.addEventListener("click", () => toggleFav(b.dataset.fav, b)));
}
function syncFavCount() { $("fav-count").textContent = favSet.size; }

async function toggleFav(photoId, btn) {
  try {
    const d = await api("/api/favorites", { method: "POST", body: JSON.stringify({ photoId, visitorId }) });
    if (d.favorite) { favSet.add(photoId); showToast("❤️ Agregada a tus favoritas"); } else { favSet.delete(photoId); showToast("Quitado de favoritas"); }
    if (btn) { btn.classList.toggle("active", d.favorite); btn.textContent = d.favorite ? "♥" : "♡"; }
    syncFavCount();
    if (gallery.photos[current]?.id === photoId) syncLbFav();
  } catch (e) { showToast("⚠️ " + e.message); }
}

// Lightbox
function openLb(i) { current = i; const p = gallery.photos[i]; $("lb-img").src = p.preview; $("lb-dl").href = p.original; syncLbFav(); $("lightbox").classList.add("open"); document.body.style.overflow = "hidden"; }
function closeLb() { $("lightbox").classList.remove("open"); document.body.style.overflow = ""; }
function syncLbFav() { const p = gallery.photos[current]; const on = favSet.has(p.id); $("lb-fav").textContent = on ? "♥ Favorita" : "♡ Favorita"; }
$("lb-close").onclick = closeLb;
$("lb-prev").onclick = () => openLb((current - 1 + gallery.photos.length) % gallery.photos.length);
$("lb-next").onclick = () => openLb((current + 1) % gallery.photos.length);
$("lb-fav").onclick = () => toggleFav(gallery.photos[current].id);
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLb(); });
addEventListener("keydown", (e) => { if (!$("lightbox").classList.contains("open")) return; if (e.key === "Escape") closeLb(); if (e.key === "ArrowLeft") $("lb-prev").click(); if (e.key === "ArrowRight") $("lb-next").click(); });

// ZIP (generado en el navegador: gratis, sin costo de servidor)
async function downloadZip(photos, label) {
  if (!photos.length) return showToast("⚠️ No hay fotos para descargar");
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
    showToast("✅ ZIP listo. ¡A disfrutar tus fotos!");
  } catch (e) { showToast("⚠️ No se pudo crear el ZIP: " + e.message); }
  $("zip-progress").classList.add("hidden");
}
$("btn-all-zip").onclick = () => downloadZip(gallery.photos, gallery.title.replace(/\s+/g, "-"));
$("btn-fav-zip").onclick = () => downloadZip(gallery.photos.filter((p) => favSet.has(p.id)), gallery.title.replace(/\s+/g, "-") + "-favoritas");

init();
