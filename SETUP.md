# NutriLog — Setup Guide

## 1. Buat Table di Supabase

Buka **Supabase Dashboard → SQL Editor** pada project `supabase-db-experiment`, lalu jalankan:

```sql
CREATE TABLE IF NOT EXISTS kv_store (
  namespace  TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (namespace, key)
);

-- Index opsional untuk performa
CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store (namespace);
```

## 2. Environment Variables di Vercel

Buka **Vercel Dashboard → nutrilog → Settings → Environment Variables**, tambahkan:

| Variable | Nilai | Keterangan |
|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Dari Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service Role Key (bukan anon key!) |
| `JWT_SECRET` | string acak min 32 char | Untuk signing token user |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | API key Claude untuk analisis foto |

> ⚠️ Gunakan **Service Role Key** (bukan Anon Key) agar bisa bypass Row Level Security.

## 3. Redeploy

Setelah env variables ditambahkan, klik **Redeploy** di Vercel atau push commit baru.
