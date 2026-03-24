-- ═══════════════════════════════════════════════════════════════
--  ProdTrack — Supabase Database Setup
--  Run this entire script in: Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phases (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, product_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id         BIGSERIAL PRIMARY KEY,
  worker_id  BIGINT NOT NULL REFERENCES workers(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  phase_id   BIGINT NOT NULL REFERENCES phases(id),
  quantity   NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. Row Level Security (allow public read/write for anon key)

ALTER TABLE workers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries  ENABLE ROW LEVEL SECURITY;

-- Workers: read-only for anon (you manage in dashboard)
CREATE POLICY "anon read workers"  ON workers  FOR SELECT USING (true);
-- Products: read-only for anon
CREATE POLICY "anon read products" ON products FOR SELECT USING (true);
-- Phases: read-only for anon
CREATE POLICY "anon read phases"   ON phases   FOR SELECT USING (true);
-- Entries: full access for anon (log + delete)
CREATE POLICY "anon read entries"   ON entries FOR SELECT USING (true);
CREATE POLICY "anon insert entries" ON entries FOR INSERT WITH CHECK (true);
CREATE POLICY "anon delete entries" ON entries FOR DELETE USING (true);


-- ── 3. Sample data (edit freely in the Supabase Table Editor) ──

INSERT INTO workers (name) VALUES
  ('Anna'),
  ('Mikko'),
  ('Sofia'),
  ('Juhani')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name) VALUES
  ('Product A'),
  ('Product B'),
  ('Product C')
ON CONFLICT (name) DO NOTHING;

-- Phases for Product A
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Cutting',       id, 1 FROM products WHERE name = 'Product A'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Assembly',      id, 2 FROM products WHERE name = 'Product A'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Quality Check', id, 3 FROM products WHERE name = 'Product A'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Packaging',     id, 4 FROM products WHERE name = 'Product A'
ON CONFLICT (name, product_id) DO NOTHING;

-- Phases for Product B
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Welding',       id, 1 FROM products WHERE name = 'Product B'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Grinding',      id, 2 FROM products WHERE name = 'Product B'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Painting',      id, 3 FROM products WHERE name = 'Product B'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Inspection',    id, 4 FROM products WHERE name = 'Product B'
ON CONFLICT (name, product_id) DO NOTHING;

-- Phases for Product C
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Forming',       id, 1 FROM products WHERE name = 'Product C'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Curing',        id, 2 FROM products WHERE name = 'Product C'
ON CONFLICT (name, product_id) DO NOTHING;
INSERT INTO phases (name, product_id, sort_order)
SELECT 'Testing',       id, 3 FROM products WHERE name = 'Product C'
ON CONFLICT (name, product_id) DO NOTHING;


-- ── Done! ──────────────────────────────────────────────────────
-- You can now manage everything in: Supabase → Table Editor
-- Add/edit workers, products, phases freely.
-- The app re-reads the database on every load.
