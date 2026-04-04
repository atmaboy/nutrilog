# NutriLog – AI Food Intelligence Tracker

Aplikasi pelacak nutrisi berbasis AI menggunakan foto makanan, dibangun dengan Vercel Serverless Functions + Vercel KV.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (PWA)
- **Backend**: Vercel Serverless Functions (`/api/*.mjs`)
- **Storage**: Vercel KV (Redis via `@vercel/kv`)
- **AI**: Anthropic Claude API

## Struktur

```
/
├── index.html          # Frontend user
├── admin.html          # Admin backoffice
├── sw.js               # Service Worker (PWA)
├── manifest.json       # Web App Manifest
├── package.json
├── api/                # Vercel Serverless Functions
│   ├── auth.mjs
│   ├── meals.mjs
│   ├── analyze.mjs
│   ├── report.mjs
│   └── admin.mjs
└── lib/                # Shared helpers
    ├── store.mjs         # Vercel KV wrapper
    └── utils.mjs         # JWT, hash, helpers
```

## Deploy ke Vercel

1. Import repo ini di [vercel.com/new](https://vercel.com/new)
2. Buat **KV Store** di tab Storage, lalu klik Connect ke project ini
3. Tambah environment variables:
   - `JWT_SECRET` — string acak panjang
   - `ANTHROPIC_API_KEY` — API key Anthropic kamu
4. Deploy!

## Environment Variables

| Variable | Keterangan |
|---|---|
| `KV_REST_API_URL` | Otomatis dari Vercel KV |
| `KV_REST_API_TOKEN` | Otomatis dari Vercel KV |
| `JWT_SECRET` | Secret untuk signing JWT token |
| `ANTHROPIC_API_KEY` | API key Anthropic Claude |

## Default Admin

- Password default: `Admin1234!`
- Ganti segera setelah login pertama via panel admin.
