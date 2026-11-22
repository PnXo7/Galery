// Maqueta de diseño — interacciones SOLO visuales, sin funcionalidad real.
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove('show'), 3400);
}

// Nav sombra al hacer scroll
const nav = document.getElementById('nav');
addEventListener('scroll', ()=> nav.classList.toggle('scrolled', scrollY > 40), {passive:true});

// Reveal on scroll
const io = new IntersectionObserver(es => es.forEach(e => {
  if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
}), {threshold:.12});
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Favoritas (demo)
let favs = 0;
const favCount = document.getElementById('fav-count');
const favCount2 = document.getElementById('fav-count-2');
function syncFavs(){ favCount.textContent = favs; favCount2.textContent = favs; }
document.querySelectorAll('.fav').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const on = btn.classList.toggle('active');
    btn.textContent = on ? '♥' : '♡';
    favs += on ? 1 : -1;
    syncFavs();
    showToast(on ? '❤️ Agregada a tus favoritas (demo)' : 'Quitado de favoritas (demo)');
  });
});

// Descargas (demo)
document.querySelectorAll('[data-download]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const tipo = btn.dataset.download;
    const msg = tipo === 'una' ? '⬇ Demo: aquí se descargaría la foto en CALIDAD ORIGINAL desde R2'
      : tipo === 'favoritas' ? `⬇ Demo: aquí se descargaría un ZIP con tus ${favs} favorita(s)`
      : '⬇ Demo: aquí se descargaría un ZIP con TODAS las fotos en calidad original';
    showToast(msg);
  });
});

// Código (demo)
document.getElementById('code-form').addEventListener('submit', e => {
  e.preventDefault();
  const code = document.getElementById('code-input').value.trim();
  if(code.length < 4){ showToast('⚠️ Escribe un código válido (demo: MARTINA2026)'); return; }
  showToast(`🔓 Demo: código "${code.toUpperCase()}" aceptado — bienvenida a tu galería`);
  document.getElementById('galeria').scrollIntoView({behavior:'smooth'});
});

// Lightbox (demo)
const items = [...document.querySelectorAll('#gallery-grid .g-item img')];
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
let current = 0;
function openLb(i){ current = i; lbImg.src = items[i].src; lb.classList.add('open'); document.body.style.overflow='hidden'; }
function closeLb(){ lb.classList.remove('open'); document.body.style.overflow=''; }
items.forEach((img,i)=> img.closest('figure').addEventListener('click', ()=>openLb(i)));
document.getElementById('lb-close').onclick = closeLb;
document.getElementById('lb-prev').onclick = ()=>openLb((current-1+items.length)%items.length);
document.getElementById('lb-next').onclick = ()=>openLb((current+1)%items.length);
document.getElementById('lb-fav').onclick = ()=>showToast('❤️ Demo: favorita marcada desde el visor');
lb.addEventListener('click', e=>{ if(e.target===lb) closeLb(); });
addEventListener('keydown', e=>{
  if(!lb.classList.contains('open')) return;
  if(e.key==='Escape') closeLb();
  if(e.key==='ArrowLeft') document.getElementById('lb-prev').click();
  if(e.key==='ArrowRight') document.getElementById('lb-next').click();
});
// Filtros del portafolio por categoría (demo visual)
// En la versión real las categorías vendrán del panel del fotógrafo.
const chips = [...document.querySelectorAll('#filter-bar .chip')];
const pfItems = [...document.querySelectorAll('#portfolio-grid figure')];
const pfCount = document.getElementById('filter-count');
const catNames = {'todas':'todas las categorías','recien-nacido':'Recién Nacido','embarazo':'Embarazo','smash-cake':'Smash Cake','familia':'Niños y Familia','matrimonios':'Matrimonios'};
function applyFilter(cat){
  chips.forEach(c => c.classList.toggle('active', c.dataset.filter === cat));
  pfItems.forEach(f => f.classList.add('filtering'));
  setTimeout(() => {
    let visible = 0;
    pfItems.forEach(f => {
      const show = cat === 'todas' || f.dataset.cat === cat;
      f.classList.toggle('filtered-out', !show);
      if(show) visible++;
    });
    pfCount.textContent = `Mostrando ${visible} foto${visible !== 1 ? 's' : ''} · ${catNames[cat] || cat}`;
    requestAnimationFrame(()=> pfItems.forEach(f => f.classList.remove('filtering')));
  }, 180);
}
chips.forEach(c => c.addEventListener('click', () => applyFilter(c.dataset.filter)));
document.querySelectorAll('[data-goto-filter]').forEach(card => {
  card.addEventListener('click', () => {
    applyFilter(card.dataset.gotoFilter);
    document.getElementById('portafolio').scrollIntoView({behavior:'smooth'});
  });
});
applyFilter('todas');

syncFavs();
