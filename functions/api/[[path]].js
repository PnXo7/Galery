// Inolvidable Fotografía — API (Cloudflare Pages Functions)
// Bindings requeridos: DB (D1), BUCKET (R2)
// Secrets: ADMIN_PASSWORD, SESSION_SECRET
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...h } });
const err = (m, s = 400) => json({ error: m }, s);

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function signVal(env, payload) { const p = btoa(JSON.stringify(payload)); return `${p}.${await hmac(env.SESSION_SECRET, p)}`; }
async function readVal(env, token) {
  if (!token) return null;
  const [p, sig] = token.split(".");
  if (!p || sig !== await hmac(env.SESSION_SECRET, p)) return null;
  try { return JSON.parse(atob(p)); } catch { return null; }
}
function cookie(req, name) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
const setCookie = (name, val, days = 30) => `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const uid = () => crypto.randomUUID();
const genCode = (title) => {
  const base = (title || "FOTOS").toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ ]/gi, "").trim().split(/\s+/).slice(0, 2).join("").replace(/[^A-Z]/g, "").slice(0, 10) || "FOTOS";
  return `${base}${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};
let _codeColOk = false;
async function ensureCodeColumn(env) {
  if (_codeColOk) return;
  try { await env.DB.prepare("SELECT code_text FROM galleries LIMIT 1").all(); _codeColOk = true; }
  catch { try { await env.DB.prepare("ALTER TABLE galleries ADD COLUMN code_text TEXT").run(); } catch {} _codeColOk = true; }
}
const isAdmin = async (env, req) => { const v = await readVal(env, cookie(req, "if_admin")); return v?.admin === true; };
async function galleryAccess(env, req, galleryId) {
  if (await isAdmin(env, req)) return true;
  const v = await readVal(env, cookie(req, "if_gallery"));
  return v?.gid === galleryId;
}
async function loadGallery(env, id) { return env.DB.prepare("SELECT * FROM galleries WHERE id=?").bind(id).first(); }
function galleryPublic(g, origin) {
  const expired = g.status !== "active" || (g.expires_at && Date.now() > g.expires_at);
  return { id: g.id, title: g.title, sessionDate: g.session_date, expiresAt: g.expires_at, expired, shareUrl: `${origin}/galeria.html?t=${g.token}` };
}

export async function onRequest({ request: req, env }) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  try {
    /* ---------- PÚBLICO: portafolio ---------- */
    if (parts[0] === "public" && parts[1] === "portfolio" && method === "GET") {
      const cats = (await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order, name").all()).results;
      const photos = (await env.DB.prepare("SELECT p.id, p.category_id, p.caption FROM portfolio_photos p ORDER BY p.created_at DESC").all()).results
        .map(p => ({ ...p, src: `/api/media/portfolio/${p.id}` }));
      return json({ categories: cats, photos });
    }

    /* ---------- ACCESO CLIENTE ---------- */
    if (parts[0] === "access" && method === "POST") {
      const { code, token } = await body();
      const g = token
        ? await env.DB.prepare("SELECT * FROM galleries WHERE token=?").bind(token).first()
        : await env.DB.prepare("SELECT * FROM galleries WHERE code_hash=?").bind(await sha256((code || "").trim().toUpperCase())).first();
      if (!g) return err("Código o enlace no válido. Revisa e intenta de nuevo.", 404);
      if (g.status !== "active" || (g.expires_at && Date.now() > g.expires_at)) return err("Esta galería ya venció. Contacta a tu fotógrafo para reactivarla.", 410);
      const session = await signVal(env, { gid: g.id });
      return json(galleryPublic(g, url.origin), 200, { "Set-Cookie": setCookie("if_gallery", session, 30) });
    }
    if (parts[0] === "gallery" && method === "GET") {
      const v = await readVal(env, cookie(req, "if_gallery"));
      const admin = await isAdmin(env, req);
      const gid = url.searchParams.get("id") && admin ? url.searchParams.get("id") : v?.gid;
      if (!gid) return err("Sin acceso. Ingresa tu código.", 401);
      const g = await loadGallery(env, gid);
      if (!g) return err("Galería no encontrada.", 404);
      if (!admin && (g.status !== "active" || (g.expires_at && Date.now() > g.expires_at))) return err("Esta galería ya venció.", 410);
      const photos = (await env.DB.prepare("SELECT id, filename, width, height FROM photos WHERE gallery_id=?").bind(gid).all()).results
        .map(p => ({ ...p, thumb: `/api/media/${p.id}/thumb`, preview: `/api/media/${p.id}/preview`, original: `/api/media/${p.id}/original` }))
        .sort((a, b) => a.filename.localeCompare(b.filename, "es", { numeric: true, sensitivity: "base" })); // orden por nombre: IMG_2 antes que IMG_10
      const favs = (await env.DB.prepare("SELECT photo_id FROM favorites WHERE gallery_id=? AND visitor_id=?").bind(gid, url.searchParams.get("v") || "").all()).results.map(r => r.photo_id);
      return json({ ...galleryPublic(g, url.origin), photos, favorites: favs });
    }
    if (parts[0] === "favorites" && method === "POST") {
      const { photoId, visitorId } = await body();
      const photo = await env.DB.prepare("SELECT * FROM photos WHERE id=?").bind(photoId).first();
      if (!photo || !(await galleryAccess(env, req, photo.gallery_id))) return err("Sin acceso.", 403);
      const ex = await env.DB.prepare("SELECT id FROM favorites WHERE gallery_id=? AND photo_id=? AND visitor_id=?").bind(photo.gallery_id, photoId, visitorId).first();
      if (ex) { await env.DB.prepare("DELETE FROM favorites WHERE id=?").bind(ex.id).run(); return json({ favorite: false }); }
      await env.DB.prepare("INSERT INTO favorites (id, gallery_id, photo_id, visitor_id) VALUES (?,?,?,?)").bind(uid(), photo.gallery_id, photoId, visitorId).run();
      return json({ favorite: true });
    }

    /* ---------- MEDIA (R2) ---------- */
    if (parts[0] === "media") {
      let key, contentTypeFallback = "image/jpeg", download = false;
      if (parts[1] === "portfolio") {
        const p = await env.DB.prepare("SELECT * FROM portfolio_photos WHERE id=?").bind(parts[2]).first();
        if (!p) return err("No encontrada", 404);
        key = p.r2_key;
      } else {
        const p = await env.DB.prepare("SELECT * FROM photos WHERE id=?").bind(parts[1]).first();
        if (!p || !(await galleryAccess(env, req, p.gallery_id))) return err("Sin acceso.", 403);
        key = p[`r2_${parts[2]}`]; download = parts[2] === "original";
        if (!key) return err("Tamaño no válido", 400);
        var fname = p.filename;
      }
      const obj = await env.BUCKET.get(key);
      if (!obj) return err("Archivo no encontrado en R2.", 404);
      const h = { "Content-Type": obj.httpMetadata?.contentType || contentTypeFallback, "Cache-Control": download ? "private, no-store" : "private, max-age=3600" };
      if (download) h["Content-Disposition"] = `attachment; filename="${fname || "foto.jpg"}"`;
      return new Response(obj.body, { headers: h });
    }

    /* ---------- ADMIN: login ---------- */
    if (parts[0] === "admin" && parts[1] === "login" && method === "POST") {
      const { password } = await body();
      if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) return err("Contraseña incorrecta.", 401);
      const session = await signVal(env, { admin: true });
      return json({ ok: true }, 200, { "Set-Cookie": setCookie("if_admin", session, 7) });
    }
    if (parts[0] === "admin" && parts[1] === "logout" && method === "POST") return json({ ok: true }, 200, { "Set-Cookie": setCookie("if_admin", "", -1) });
    if (parts[0] !== "admin") return err("Ruta no encontrada.", 404);
    if (!(await isAdmin(env, req))) return err("Debes iniciar sesión como administrador.", 401);

    /* ---------- ADMIN: categorías ---------- */
    if (parts[1] === "categories") {
      if (method === "GET") return json((await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order, name").all()).results);
      if (method === "POST") { const { name } = await body(); if (!name) return err("Falta el nombre."); const id = uid(); await env.DB.prepare("INSERT INTO categories (id, name) VALUES (?,?)").bind(id, name.trim()).run(); return json({ id }); }
      if (method === "DELETE" && parts[2]) { await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(parts[2]).run(); return json({ ok: true }); }
    }

    /* ---------- ADMIN: galerías ---------- */
    if (parts[1] === "galleries") {
      await ensureCodeColumn(env);
      if (method === "GET" && !parts[2]) {
        const rows = (await env.DB.prepare(`SELECT g.*, (SELECT COUNT(*) FROM photos p WHERE p.gallery_id=g.id) AS photo_count, (SELECT COUNT(DISTINCT visitor_id) FROM favorites f WHERE f.gallery_id=g.id) AS clients_with_favs FROM galleries g ORDER BY g.created_at DESC`).all()).results;
        return json(rows.map(g => ({ ...g, code_hash: undefined, token: undefined, code: g.code_text || null, expired: g.status !== "active" || (g.expires_at && Date.now() > g.expires_at), shareUrl: `${url.origin}/galeria.html?t=${g.token}` })));
      }
      if (method === "POST" && !parts[2]) {
        const { title, sessionDate, months } = await body();
        if (!title) return err("Falta el título de la galería.");
        const m = [3, 5, 6].includes(+months) ? +months : 6;
        const code = genCode(title), id = uid(), token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
        const expires = Date.now() + m * 30 * 86400000;
        await env.DB.prepare("INSERT INTO galleries (id, title, session_date, code_hash, code_text, token, expires_at) VALUES (?,?,?,?,?,?,?)").bind(id, title.trim(), sessionDate || null, await sha256(code), code, token, expires).run();
        return json({ id, code, shareUrl: `${url.origin}/galeria.html?t=${token}`, expiresAt: expires });
      }
      const g = await loadGallery(env, parts[2]);
      if (!g) return err("Galería no encontrada.", 404);
      if (method === "GET" && parts[3] === "favorites") {
        const rows = (await env.DB.prepare(`SELECT f.visitor_id, ph.id AS photo_id, ph.filename FROM favorites f JOIN photos ph ON ph.id=f.photo_id WHERE f.gallery_id=? ORDER BY f.visitor_id, f.created_at`).bind(g.id).all()).results;
        const byVisitor = new Map();
        for (const r of rows) {
          if (!byVisitor.has(r.visitor_id)) byVisitor.set(r.visitor_id, []);
          byVisitor.get(r.visitor_id).push({ id: r.photo_id, filename: r.filename, thumb: `/api/media/${r.photo_id}/thumb`, preview: `/api/media/${r.photo_id}/preview` });
        }
        return json({ visitors: [...byVisitor.entries()].map(([visitor_id, photos]) => ({ visitor_id, photos })) });
      }
      if (method === "POST" && parts[3] === "rename") {
        const { title } = await body();
        if (!title || !title.trim()) return err("El nombre no puede estar vacío.");
        await env.DB.prepare("UPDATE galleries SET title=? WHERE id=?").bind(title.trim(), g.id).run();
        return json({ ok: true, title: title.trim() });
      }
      if (method === "POST" && parts[3] === "code") {
        const code = genCode(g.title);
        await env.DB.prepare("UPDATE galleries SET code_hash=?, code_text=? WHERE id=?").bind(await sha256(code), code, g.id).run();
        return json({ ok: true, code });
      }
      if (method === "POST" && parts[3] === "extend") {
        const { months } = await body(); const m = [3, 5, 6].includes(+months) ? +months : 3;
        const base = Math.max(Date.now(), g.expires_at || 0);
        await env.DB.prepare("UPDATE galleries SET expires_at=?, status='active' WHERE id=?").bind(base + m * 30 * 86400000, g.id).run();
        return json({ ok: true, expiresAt: base + m * 30 * 86400000 });
      }
      if (method === "DELETE") {
        const photos = (await env.DB.prepare("SELECT * FROM photos WHERE gallery_id=?").bind(g.id).all()).results;
        for (const p of photos) for (const k of [p.r2_original, p.r2_preview, p.r2_thumb]) if (k) await env.BUCKET.delete(k);
        await env.DB.prepare("DELETE FROM galleries WHERE id=?").bind(g.id).run();
        return json({ ok: true });
      }
      // Subida de fotos (original + previa + miniatura generadas en el navegador)
      if (method === "POST" && parts[3] === "photos") {
        const form = await req.formData();
        const original = form.get("original"), preview = form.get("preview"), thumb = form.get("thumb");
        const filename = form.get("filename") || original?.name || "foto.jpg";
        if (!original) return err("Falta el archivo original.");
        const existing = await env.DB.prepare("SELECT id FROM photos WHERE gallery_id=? AND filename=?").bind(g.id, filename).first();
        if (existing) return json({ id: existing.id, duplicate: true });
        const pid = uid(), base = `galleries/${g.id}/${pid}`;
        await env.BUCKET.put(`${base}/original.jpg`, original.stream(), { httpMetadata: { contentType: original.type || "image/jpeg" } });
        if (preview) await env.BUCKET.put(`${base}/preview.webp`, preview.stream(), { httpMetadata: { contentType: "image/webp" } });
        if (thumb) await env.BUCKET.put(`${base}/thumb.webp`, thumb.stream(), { httpMetadata: { contentType: "image/webp" } });
        await env.DB.prepare("INSERT INTO photos (id, gallery_id, filename, r2_original, r2_preview, r2_thumb, width, height) VALUES (?,?,?,?,?,?,?,?)")
          .bind(pid, g.id, filename, `${base}/original.jpg`, preview ? `${base}/preview.webp` : `${base}/original.jpg`, thumb ? `${base}/thumb.webp` : `${base}/original.jpg`, +(form.get("width") || 0), +(form.get("height") || 0)).run();
        return json({ id: pid });
      }
    }

    /* ---------- ADMIN: portafolio ---------- */
    if (parts[1] === "portfolio") {
      if (method === "POST") {
        const form = await req.formData();
        const file = form.get("file"), categoryId = form.get("category_id");
        if (!file || !categoryId) return err("Falta foto o categoría.");
        const id = uid(), key = `portfolio/${id}.webp`;
        await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "image/webp" } });
        await env.DB.prepare("INSERT INTO portfolio_photos (id, category_id, r2_key, caption) VALUES (?,?,?,?)").bind(id, categoryId, key, form.get("caption") || "").run();
        return json({ id });
      }
      if (method === "DELETE" && parts[2]) {
        const p = await env.DB.prepare("SELECT * FROM portfolio_photos WHERE id=?").bind(parts[2]).first();
        if (p) { await env.BUCKET.delete(p.r2_key); await env.DB.prepare("DELETE FROM portfolio_photos WHERE id=?").bind(p.id).run(); }
        return json({ ok: true });
      }
    }
    return err("Ruta no encontrada.", 404);
  } catch (e) {
    return err("Error del servidor: " + e.message, 500);
  }
}
