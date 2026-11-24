// Panel del fotógrafo
const $ = (id) => document.getElementById(id);
async function api(path, opts = {}) {
  const r = await fetch(path, opts.body instanceof FormData ? opts : { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Algo salió mal");
  return d;
}
const fmtDate = (t) => t ? new Date(t).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "—";

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("pw").value }) }); boot(); }
  catch (e2) { $("login-msg").textContent = e2.message; }
});
$("btn-logout").onclick = async () => { await api("/api/admin/logout", { method: "POST", body: "{}" }); location.reload(); };

async function boot() {
  try { await loadAll(); $("login-view").classList.add("hidden"); $("panel-view").classList.remove("hidden"); }
  catch { $("login-view").classList.remove("hidden"); }
}
async function loadAll() { await Promise.all([loadGalleries(), loadCategories(), loadPortfolio()]); }

async function loadGalleries() {
  const rows = await api("/api/admin/galleries");
  $("gallery-list").innerHTML = rows.map((g) => `
    <div class="panel-card">
      <div class="g-row">
        <div>
          <h3>${g.title}</h3>
          <p class="muted">${g.photo_count} fotos · Personas que marcaron favoritas: ${g.clients_with_favs}</p>
          <p class="muted small">Creada: ${fmtDate(g.created_at)}${g.session_date ? ` · Sesión: ${g.session_date}` : ""} · Vence: ${fmtDate(g.expires_at)} ${g.expired ? '<b class="bad">· VENCIDA</b>' : '<b class="ok">· ACTIVA</b>'}</p>
          <p class="muted small">Link cliente: <a href="${g.shareUrl}" target="_blank">${g.shareUrl}</a></p>
          ${g.code ? `<p class="muted small">Código de acceso: <code class="code-chip">${g.code}</code></p>` : ""}
        </div>
        <div class="g-actions">
          <button class="btn btn-ghost btn-small" data-copy="${g.shareUrl}">Copiar link</button>
          ${g.code ? `<button class="btn btn-ghost btn-small" data-copy="${g.code}">Copiar código</button>` : ""}
          <button class="btn btn-ghost btn-small" data-rename="${g.id}" data-title="${g.title.replace(/"/g, "&quot;")}">Editar nombre</button>
          <button class="btn btn-ghost btn-small" data-favs="${g.id}">Favoritas por persona (${g.clients_with_favs})</button>
          <button class="btn btn-ghost btn-small" data-extend="${g.id}">Extender</button>
          <button class="btn btn-danger btn-small" data-del="${g.id}">Eliminar</button>
        </div>
      </div>
      <div class="upload-zone">
        <label>Subir fotos a esta galería (se generan miniaturas automáticamente):
          <input type="file" accept="image/*" multiple data-upload="${g.id}">
        </label>
      </div>
      <div class="fav-list hidden" id="favs-${g.id}"></div>
    </div>`).join("");
  document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.copy); showToast("Copiado: " + b.dataset.copy.slice(0, 42)); });
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { if (confirm("¿Eliminar esta galería y TODAS sus fotos de R2? No se puede deshacer.")) { await api(`/api/admin/galleries/${b.dataset.del}`, { method: "DELETE" }); loadGalleries(); showToast("Galería eliminada"); } });
  document.querySelectorAll("[data-extend]").forEach((b) => b.onclick = async () => { const m = prompt("¿Extender por cuántos meses? (3, 5 o 6)", "3"); if (!m) return; await api(`/api/admin/galleries/${b.dataset.extend}/extend`, { method: "POST", body: JSON.stringify({ months: +m }) }); loadGalleries(); showToast("Galería extendida y activa"); });
  document.querySelectorAll("[data-rename]").forEach((b) => b.onclick = async () => {
    const nuevo = prompt("Nuevo nombre de la galería:", b.dataset.title);
    if (!nuevo || !nuevo.trim() || nuevo.trim() === b.dataset.title) return;
    await api(`/api/admin/galleries/${b.dataset.rename}/rename`, { method: "POST", body: JSON.stringify({ title: nuevo }) });
    showToast("Nombre actualizado"); loadGalleries();
  });
  document.querySelectorAll("[data-favs]").forEach((b) => b.onclick = async () => {
    const box = $(`favs-${b.dataset.favs}`); box.classList.toggle("hidden");
    if (box.dataset.loaded) return; box.dataset.loaded = 1;
    const d = await api(`/api/admin/galleries/${b.dataset.favs}/favorites`);
    if (!d.visitors.length) { box.innerHTML = "<p class='muted'>Aún nadie marca favoritas en esta galería. Cuando un cliente toque el corazón en sus fotos, aquí verás su selección, separada por persona.</p>"; return; }
    box.innerHTML = d.visitors.map((v, i) => `
      <h4>Persona ${i + 1} · ${v.photos.length} favorita(s)</h4>
      <div class="fav-photos">${v.photos.map((ph) => `<a href="${ph.preview}" target="_blank" title="${ph.filename} — clic para ver en grande"><img src="${ph.thumb}" alt="${ph.filename}" loading="lazy"></a>`).join("")}</div>`).join("");
  });
  document.querySelectorAll("[data-upload]").forEach((inp) => inp.onchange = () => { const fs = [...inp.files]; inp.value = ""; uploadPhotos(inp.dataset.upload, fs); });
}

// Genera miniatura (600px) y previa (1600px) en el navegador: la galería carga rapidísimo y R2 solo almacena.
// UNA sola decodificación por foto (antes eran 3: agotaba la memoria en lotes grandes, ej. 300 fotos).
async function versionFromBitmap(bmp, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/webp", 0.82));
}
async function makeVersion(file, maxSize) {
  const bmp = await createImageBitmap(file);
  try { return await versionFromBitmap(bmp, maxSize); } finally { if (bmp.close) bmp.close(); }
}
let lastFailed = { galleryId: null, files: [] };
async function runUpload(galleryId, files) {
  let ok = 0, dup = 0; const failed = [];
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let settled = false, lastErr = "";
    for (let attempt = 1; attempt <= 3 && !settled; attempt++) { // hasta 2 reintentos con pausa
      try {
        $("up-msg").textContent = `Subiendo ${f.name} (${i + 1}/${files.length}) · listas: ${ok} · saltadas: ${dup} · con error: ${failed.length}`;
        const bmp = await createImageBitmap(f);
        let preview, thumb; const w = bmp.width, h = bmp.height;
        try { preview = await versionFromBitmap(bmp, 1600); thumb = await versionFromBitmap(bmp, 600); }
        finally { if (bmp.close) bmp.close(); }
        const pid = crypto.randomUUID();
        const putRaw = async (kind, blob) => {
          const rr = await fetch(`/api/admin/galleries/${galleryId}/blob/${pid}/${kind}`, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
          if (!rr.ok) { const d = await rr.json().catch(() => ({})); throw new Error(d.error || `Error ${rr.status} subiendo ${kind}`); }
        };
        await putRaw("original", f);
        await putRaw("preview", preview);
        await putRaw("thumb", thumb);
        const r = await api(`/api/admin/galleries/${galleryId}/register`, { method: "POST", body: JSON.stringify({ id: pid, filename: f.name, width: w, height: h }) });
        if (r.duplicate) dup++; else ok++;
        settled = true;
      } catch (e) { lastErr = e.message; if (attempt < 3) await new Promise((r) => setTimeout(r, 900 * attempt)); }
    }
    if (!settled) {
      failed.push({ file: f, error: lastErr });
      $("up-live").innerHTML = failed.slice(-6).map((x) => `<p class="bad">No subió: ${x.file.name} <span class="muted">(${x.error})</span></p>`).join("");
    }
    $("up-bar").style.width = `${((i + 1) / files.length) * 100}%`;
  }
  try { wakeLock && wakeLock.release(); } catch {}
  return { ok, dup, failed };
}
function showUploadReport(galleryId, { ok, dup, failed }) {
  lastFailed = { galleryId, files: failed.map((x) => x.file) };
  $("up-live").innerHTML = "";
  $("up-report").classList.remove("hidden");
  $("up-msg").textContent = "Subida terminada";
  $("up-report-summary").innerHTML = `<p><b>${ok}</b> fotos subidas · <b>${dup}</b> ya existían (saltadas) · <b class="${failed.length ? "bad" : ""}">${failed.length}</b> no subieron</p>` +
    (failed.length ? `<p class="muted">Estas son las que dieron error (miniatura y nombre). Puedes reintentarlas con el botón, sin volver a elegir archivos:</p>` : `<p class="muted">Todo subió correctamente.</p>`);
  $("up-failed-grid").innerHTML = failed.map((x) => `<figure><img src="${URL.createObjectURL(x.file)}" alt=""><figcaption>${x.file.name}<br><span>${x.error}</span></figcaption></figure>`).join("");
  $("up-retry").classList.toggle("hidden", !failed.length);
}
async function uploadPhotos(galleryId, files) {
  if (!files.length) return;
  files = [...files];
  $("up-progress").classList.remove("hidden");
  $("up-report").classList.add("hidden");
  $("up-live").innerHTML = "";
  const result = await runUpload(galleryId, files);
  showUploadReport(galleryId, result);
  loadGalleries();
}
$("up-retry").addEventListener("click", async () => {
  if (!lastFailed.files.length) return;
  $("up-report").classList.add("hidden");
  const result = await runUpload(lastFailed.galleryId, lastFailed.files);
  showUploadReport(lastFailed.galleryId, result);
  loadGalleries();
});
$("up-close").addEventListener("click", () => {
  $("up-progress").classList.add("hidden");
  document.querySelectorAll("#up-failed-grid img").forEach((img) => URL.revokeObjectURL(img.src));
});

$("new-gallery-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = await api("/api/admin/galleries", { method: "POST", body: JSON.stringify({ title: $("ng-title").value, sessionDate: $("ng-date").value, months: +$("ng-months").value }) });
  const box = $("ng-result"); box.classList.remove("hidden");
  box.innerHTML = `Galería creada.<br><b>Código para el cliente:</b> <code>${d.code}</code><br><b>Link directo:</b> <a href="${d.shareUrl}" target="_blank">${d.shareUrl}</a><br><span class="muted">El código quedará visible en la tarjeta de la galería. Ahora sube las fotos ahí mismo</span>`;
  loadGalleries();
});

async function loadCategories() {
  const cats = await api("/api/admin/categories");
  $("pf-cat").innerHTML = cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}
$("btn-add-cat").onclick = async () => {
  const name = $("new-cat").value.trim(); if (!name) return;
  await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
  $("new-cat").value = ""; loadCategories(); showToast("Categoría creada");
};
async function loadPortfolio() {
  const d = await fetch("/api/public/portfolio").then((r) => r.json());
  const name = Object.fromEntries((d.categories || []).map((c) => [c.id, c.name]));
  $("pf-list").innerHTML = (d.photos || []).map((p) => `<div class="pf-item"><img src="${p.src}"><span>${name[p.category_id] || ""}</span><button data-pdel="${p.id}">✕</button></div>`).join("");
  document.querySelectorAll("[data-pdel]").forEach((b) => b.onclick = async () => { await api(`/api/admin/portfolio/${b.dataset.pdel}`, { method: "DELETE" }); loadPortfolio(); });
}
$("portfolio-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = $("pf-file").files[0]; if (!f) return;
  const fd = new FormData();
  fd.append("category_id", $("pf-cat").value);
  fd.append("file", await makeVersion(f, 1400), "foto.webp");
  await api("/api/admin/portfolio", { method: "POST", body: fd });
  showToast("Foto agregada al portafolio"); loadPortfolio();
});

boot();
