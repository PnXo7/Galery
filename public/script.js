// Utilidades visuales compartidas
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}
const nav = document.getElementById("nav");
if (nav) addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 40), { passive: true });
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }), { threshold: .1 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
