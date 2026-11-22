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
  catch (e2) { $("login-msg").textContent = "⚠️ " + e2.message; }
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
          <p class="muted">${g.photo_count} fotos · Vence: ${fmtDate(g.expires_at)} ${g.expired ? '<b class="bad">· VENCIDA</b>' : ""}</p>
          <p class="muted small">Link cliente: <a href="${g.shareUrl}" target="_blank">${g.shareUrl}</a></p>
        </div>
        <div class="g-actions">
          <button class="btn btn-ghost btn-small" data-copy="${g.shareUrl}">📋 Copiar link</button>
          <button class="btn btn-ghost btn-small" data-favs="${g.id}">❤️ Favoritas (${g.clients_with_favs} cliente/s)</button>
          <button class="btn btn-ghost btn-small" data-extend="${g.id}">⏳ Extender</button>
          <button class="btn btn-danger btn-small" data-del="${g.id}">🗑️ Eliminar</button>
        </div>
      </div>
      <div class="upload-zone">
        <label>Subir fotos a esta galería (se generan miniaturas automáticamente):
          <input type="file" accept="image/*" multiple data-upload="${g.id}">
        </label>
      </div>
      <div class="fav-list hidden" id="favs-${g.id}"></div>
    </div>`).join("");
  document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.copy); showToast("📋 Link copiado"); });
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { if (confirm("¿Eliminar esta galería y TODAS sus fotos de R2? No se puede deshacer.")) { await api(`/api/admin/galleries/${b.dataset.del}`, { method: "DELETE" }); loadGalleries(); showToast("🗑️ Galería eliminada"); } });
  document.querySelectorAll("[data-extend]").forEach((b) => b.onclick = async () => { const m = prompt("¿Extender por cuántos meses? (3, 5 o 6)", "3"); if (!m) return; await api(`/api/admin/galleries/${b.dataset.extend}/extend`, { method: "POST", body: JSON.stringify({ months: +m }) }); loadGalleries(); showToast("⏳ Galería extendida y activa"); });
  document.querySelectorAll("[data-favs]").forEach((b) => b.onclick = async () => {
    const box = $(`favs-${b.dataset.favs}`); box.classList.toggle("hidden");
    if (box.dataset.loaded) return; box.dataset.loaded = 1;
    const rows = await api(`/api/admin/galleries/${b.dataset.favs}/favorites`);
    box.innerHTML = rows.length ? `<h4>❤️ Fotos favoritas de tus clientes:</h4>` + rows.map((r) => `<p>· ${r.filename} — marcada ${r.veces} vez/veces</p>`).join("") : "<p class='muted'>Aún no marcan favoritas en esta galería.</p>";
  });
  document.querySelectorAll("[data-upload]").forEach((inp) => inp.onchange = () => uploadPhotos(inp.dataset.upload, inp.files));
}

// Genera miniatura (600px) y previa (1600px) en el navegador: la galería carga rapidísimo y R2 solo almacena.
async function makeVersion(file, maxSize) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/webp", 0.82));
}
async function uploadPhotos(galleryId, files) {
  if (!files.length) return;
  $("up-progress").classList.remove("hidden");
  let done = 0;
  for (const f of files) {
    $("up-msg").textContent = `Subiendo ${f.name} (${done + 1}/${files.length})…`;
    try {
      const bmp = await createImageBitmap(f);
      const fd = new FormData();
      fd.append("original", f, f.name); fd.append("filename", f.name);
      fd.append("preview", await makeVersion(f, 1600), "preview.webp");
      fd.append("thumb", await makeVersion(f, 600), "thumb.webp");
      fd.append("width", bmp.width); fd.append("height", bmp.height);
      await api(`/api/admin/galleries/${galleryId}/photos`, { method: "POST", body: fd });
    } catch (e) { showToast("⚠️ " + f.name + ": " + e.message); }
    done++; $("up-bar").style.width = `${(done / files.length) * 100}%`;
  }
  $("up-progress").classList.add("hidden");
  showToast(`✅ ${done} foto(s) subidas`);
  loadGalleries();
}

$("new-gallery-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = await api("/api/admin/galleries", { method: "POST", body: JSON.stringify({ title: $("ng-title").value, sessionDate: $("ng-date").value, months: +$("ng-months").value }) });
  const box = $("ng-result"); box.classList.remove("hidden");
  box.innerHTML = `✅ Galería creada.<br><b>Código para el cliente:</b> <code>${d.code}</code><br><b>Link directo:</b> <a href="${d.shareUrl}" target="_blank">${d.shareUrl}</a><br><span class="muted">Guarda el código: por seguridad no se vuelve a mostrar. Ahora sube las fotos en la tarjeta de la galería 👇</span>`;
  loadGalleries();
});

async function loadCategories() {
  const cats = await api("/api/admin/categories");
  $("pf-cat").innerHTML = cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}
$("btn-add-cat").onclick = async () => {
  const name = $("new-cat").value.trim(); if (!name) return;
  await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
  $("new-cat").value = ""; loadCategories(); showToast("✅ Categoría creada");
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
  showToast("✅ Foto agregada al portafolio"); loadPortfolio();
});

boot();
