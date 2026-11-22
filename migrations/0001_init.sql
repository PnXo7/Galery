-- Inolvidable Fotografía — esquema inicial (Cloudflare D1)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS portfolio_photos (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS galleries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  session_date TEXT,
  code_hash TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  r2_original TEXT NOT NULL,
  r2_preview TEXT,
  r2_thumb TEXT,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  UNIQUE (gallery_id, photo_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_favs_gallery ON favorites(gallery_id);

-- Categorías iniciales (puedes editarlas/borrarlas desde el panel)
INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
  ('cat-recien-nacido', 'Recién Nacido', 1),
  ('cat-embarazo', 'Embarazo', 2),
  ('cat-smash-cake', 'Smash Cake', 3),
  ('cat-familia', 'Niños y Familia', 4),
  ('cat-matrimonios', 'Matrimonios', 5);
