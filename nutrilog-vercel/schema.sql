-- ============================================================
-- NutriLog – Supabase Schema
-- Run this SQL in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Meals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ NOT NULL,
  image_data      TEXT,                           -- base64 JPEG (compressed client-side)
  nutrition       JSONB NOT NULL DEFAULT '{}',    -- full AI result
  dish_names      TEXT[]  DEFAULT '{}',           -- denormalised for fast list
  total_calories  INTEGER DEFAULT 0,
  total_protein_g NUMERIC(8,1) DEFAULT 0,
  total_carbs_g   NUMERIC(8,1) DEFAULT 0,
  total_fat_g     NUMERIC(8,1) DEFAULT 0,
  total_fiber_g   NUMERIC(8,1) DEFAULT 0,
  health_score    INTEGER DEFAULT 7,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_id  ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_ts       ON meals(timestamp DESC);

-- ── Daily usage ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_usage (
  user_id TEXT  NOT NULL,
  date    TEXT  NOT NULL,   -- YYYY-MM-DD UTC
  count   INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- ── Reports ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Changelog ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog (
  id          TEXT PRIMARY KEY,
  version     TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  author      TEXT DEFAULT 'admin',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── App config (single row) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  api_key             TEXT,
  daily_limit         INTEGER DEFAULT 5,
  admin_password_hash TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO config (id, daily_limit)
VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

-- ── Row-Level Security (disable for server-side service key) ──
-- All access goes through our API using the service-role key which bypasses RLS.
-- Optionally enable RLS for extra safety:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
-- etc.
-- (Leave disabled if you only access via service-role key from serverless functions)
