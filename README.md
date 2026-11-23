# Inolvidable Fotografía — Plataforma de entrega de fotos 📸

Web de **Daniel Rojas (Valdivia, Chile)**: portafolio público + entrega privada de galerías a clientes con código o link, favoritas y descargas en calidad original.

**Arquitectura (100% Cloudflare, costo ~$0):**
- **Pages** → la web (`public/`) y la API (`functions/`)
- **R2** → las fotos (original + previa 1600px + miniatura 600px, generadas en el navegador al subir)
- **D1** → galerías, códigos, categorías, favoritas

---

## 🚀 Publicación (lo que debe hacer Daniel Rojas, ~15 min, una sola vez)

### 1. Cuenta Cloudflare
Crea una cuenta gratis en https://dash.cloudflare.com/sign-up

### 2. Conectar este repositorio
En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** → elige `PnXo7/Galery`.
- Build command: *(vacío)*
- Build output directory: `public`
- Deploy. Obtendrás una URL tipo `inolvidable-fotografia.pages.dev` (aún sin fotos reales: falta el paso 3).

### 3. Crear el almacenamiento y la base de datos
**Opción A (panel web, sin comandos):**
1. **R2 → Create bucket** → nombre: `inolvidable-fotos`
2. **D1 → Create database** → nombre: `inolvidable-db`. Al crearla, abre su **Console** y ejecuta todo el contenido de `migrations/0001_init.sql`.
3. Los bindings ya están declarados en `wrangler.toml` (por eso el botón "Add" de Settings → Bindings se ve deshabilitado, es normal):
   - D1: `DB` → `inolvidable-db`
   - R2: `BUCKET` → `inolvidable-fotos`
4. **Settings → Environment variables** (Production), agrega dos *secrets*:
   - `ADMIN_PASSWORD` = tu contraseña para el panel (ej. una frase larga)
   - `SESSION_SECRET` = un texto largo cualquiera (30+ caracteres al azar)
5. **Deployments → Retry deployment** (para que tome los bindings).

**Opción B (terminal, con Node instalado):**
```bash
npm install
npx wrangler login
npx wrangler d1 create inolvidable-db        # luego vincula DB y BUCKET en el panel (paso 3.3)
npx wrangler r2 bucket create inolvidable-fotos
npm run db:remote
npx wrangler pages secret put ADMIN_PASSWORD --project-name inolvidable-fotografia
npx wrangler pages secret put SESSION_SECRET --project-name inolvidable-fotografia
npm run deploy
```

### 4. Usar la plataforma
- **Panel:** `https://TU-DOMINIO/admin.html` → entra con tu `ADMIN_PASSWORD`.
- Crea una galería → el sistema da **CÓDIGO** y **LINK** (guárdalo: el código no se vuelve a mostrar, por seguridad solo guardamos su huella).
- Sube las fotos desde la tarjeta de la galería (puedes elegir muchas a la vez).
- Envía el código o el link a tu cliente por WhatsApp.
- El cliente: entra en **Mis Fotos**, ve su galería, marca ❤️ favoritas y descarga (una, favoritas en ZIP o todas en ZIP).
- Tú ves las **favoritas de cada cliente** en el panel, y puedes **extender** (3/5/6 meses) o **eliminar** galerías vencidas (el cliente nunca puede borrar nada).

## 💻 Desarrollo local
```bash
npm install
npm run db:local
npm run dev   # http://localhost:8788
```
Crea un archivo `.dev.vars` con `ADMIN_PASSWORD=...` y `SESSION_SECRET=...` para local.

## 💰 Costos
- Gratis hasta 10 GB en R2 y los límites generosos de Pages/D1.
- Después: ~$0,015 USD por GB/mes en R2 (100 GB ≈ $1,35/mes), descargas siempre gratis.
