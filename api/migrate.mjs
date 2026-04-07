// api/migrate.mjs
// ⚠️  MIGRATION ENDPOINT — HAPUS SETELAH MIGRASI SELESAI

import { getStore } from "../lib/store.mjs";

const MIGRATE_SECRET = process.env.MIGRATE_SECRET || "nutrilog-migrate-2024";

function parseURL(req) {
  // req.url di Vercel bisa berupa path saja (/api/migrate?...)
  // atau full URL tergantung versi runtime. Kita handle keduanya.
  try {
    return new URL(req.url);
  } catch {
    return new URL(req.url, "https://nutrilog-rho.vercel.app");
  }
}

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: corsHeaders });
  }

  const url = parseURL(req);
  const secret = url.searchParams.get("secret");

  if (secret !== MIGRATE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized — pastikan MIGRATE_SECRET sudah diset di Vercel env" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // ── GET ────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const action = url.searchParams.get("action");

    // Server-to-server migration: fetch dari Netlify → tulis ke Supabase
    if (action === "fetch-and-migrate") {
      const netlifyUrl = url.searchParams.get("netlifyUrl");
      const netlifySecret = url.searchParams.get("netlifySecret");

      if (!netlifyUrl || !netlifySecret) {
        return new Response(
          JSON.stringify({ error: "Parameter netlifyUrl dan netlifySecret wajib diisi" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      try {
        const exportUrl = netlifyUrl + "/api/export-data?secret=" + encodeURIComponent(netlifySecret);

        const exportRes = await fetch(exportUrl, {
          headers: { Accept: "application/json" },
        });

        if (!exportRes.ok) {
          const errText = await exportRes.text();
          return new Response(
            JSON.stringify({
              error: "Netlify export gagal (" + exportRes.status + "): " + errText.slice(0, 300),
            }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const exportPayload = await exportRes.json();
        const dataToMigrate = exportPayload.data || exportPayload;

        if (!dataToMigrate || typeof dataToMigrate !== "object") {
          return new Response(
            JSON.stringify({ error: "Format data dari Netlify tidak valid" }),
            { status: 422, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const store = getStore("nutrilog");
        const entries = Object.entries(dataToMigrate);
        const successKeys = [];
        const failedKeys = [];

        for (const [key, value] of entries) {
          try {
            const content = typeof value === "string" ? value : JSON.stringify(value);
            await store.set(key, content);
            successKeys.push(key);
          } catch (e) {
            failedKeys.push({ key: key, error: e.message });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            total: entries.length,
            successCount: successKeys.length,
            failedCount: failedKeys.length,
            failed: failedKeys,
            successKeys: successKeys,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Gagal fetch dari Netlify: " + err.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Default GET: cek koneksi Supabase
    try {
      const store = getStore("nutrilog");
      const userIndex = (await store.get("users/index", { type: "json" })) || [];
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Supabase terhubung ✓",
          existingUsers: userIndex.length,
          nextStep: "GET /api/migrate?secret=MIGRATE_SECRET&action=fetch-and-migrate&netlifyUrl=https://APP.netlify.app&netlifySecret=EXPORT_SECRET",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Supabase tidak terhubung: " + err.message }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  // ── POST: terima JSON payload langsung ─────────────────────────────────
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const dataToMigrate = body.data || body;

    if (!dataToMigrate || typeof dataToMigrate !== "object") {
      return new Response(
        JSON.stringify({ error: "Body harus berisi { data: { key: value } }" }),
        { status: 422, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const store = getStore("nutrilog");
    const entries = Object.entries(dataToMigrate);
    const successKeys = [];
    const failedKeys = [];

    for (const [key, value] of entries) {
      try {
        const content = typeof value === "string" ? value : JSON.stringify(value);
        await store.set(key, content);
        successKeys.push(key);
      } catch (e) {
        failedKeys.push({ key: key, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: entries.length,
        successCount: successKeys.length,
        failedCount: failedKeys.length,
        failed: failedKeys,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
