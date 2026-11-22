// Portafolio dinámico desde la API; con respaldo local si la API aún no está desplegada.
const FALLBACK_CATS = ["Recién Nacido", "Embarazo", "Smash Cake", "Niños y Familia", "Matrimonios"];
const FALLBACK_PHOTOS = [
  { src: "assets/img/ig/smash-celeste-1.jpg", cat: "Smash Cake" }, { src: "assets/img/ig/newborn-teresita.jpg", cat: "Recién Nacido" },
  { src: "assets/img/ig/hermanas-otono.jpg", cat: "Niños y Familia" }, { src: "assets/img/maternity-2.webp", cat: "Embarazo" },
  { src: "assets/img/ig/smash-ulises-torta.jpg", cat: "Smash Cake" }, { src: "assets/img/wedding-2.jpg", cat: "Matrimonios" },
  { src: "assets/img/ig/cumple-globo.jpg", cat: "Smash Cake" }, { src: "assets/img/newborn-2.webp", cat: "Recién Nacido" },
  { src: "assets/img/ig/smash-celeste-2.jpg", cat: "Smash Cake" }, { src: "assets/img/family-2.jpg", cat: "Niños y Familia" },
  { src: "assets/img/maternity-1.jpg", cat: "Embarazo" }, { src: "assets/img/wedding-1.jpg", cat: "Matrimonios" },
];
let allPhotos = [], activeFilter = "Todas";

function renderFilters(cats) {
  const bar = document.getElementById("filter-bar");
  bar.innerHTML = "";
  ["Todas", ...cats].forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c === activeFilter ? " active" : "");
    b.textContent = c === "Todas" ? "✦ Todas" : c;
    b.onclick = () => { activeFilter = c; renderFilters(cats); renderGrid(); };
    bar.appendChild(b);
  });
  bar._cats = cats;
}
function renderGrid() {
  const grid = document.getElementById("portfolio-grid");
  const show = allPhotos.filter((p) => activeFilter === "Todas" || p.cat === activeFilter);
  grid.innerHTML = show.map((p) => `<figure><img src="${p.src}" alt="${p.cat}" loading="lazy"><span class="cat-tag">${p.cat}</span></figure>`).join("");
  document.getElementById("filter-count").textContent = `Mostrando ${show.length} foto${show.length !== 1 ? "s" : ""} · ${activeFilter}`;
}
async function loadPortfolio() {
  try {
    const r = await fetch("/api/public/portfolio");
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (d.photos.length) {
      const name = Object.fromEntries(d.categories.map((c) => [c.id, c.name]));
      allPhotos = d.photos.map((p) => ({ src: p.src, cat: name[p.category_id] || "" }));
      renderFilters(d.categories.map((c) => c.name));
    } else throw new Error("vacío");
  } catch { allPhotos = FALLBACK_PHOTOS; renderFilters(FALLBACK_CATS); }
  renderGrid();
}
loadPortfolio();
document.querySelectorAll("[data-goto-filter]").forEach((c) => c.addEventListener("click", () => {
  activeFilter = c.dataset.gotoFilter;
  renderFilters(document.getElementById("filter-bar")._cats || FALLBACK_CATS);
  renderGrid();
  document.getElementById("portafolio").scrollIntoView({ behavior: "smooth" });
}));

// Acceso por código
document.getElementById("code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("code-input").value.trim();
  const msg = document.getElementById("code-msg");
  if (!code) return;
  msg.textContent = "Verificando tu código…";
  try {
    const r = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Código no válido");
    location.href = "galeria.html";
  } catch (e2) { msg.textContent = "⚠️ " + e2.message; }
});
