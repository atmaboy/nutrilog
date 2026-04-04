// api/migrate.mjs
// ⚠️  MIGRATION ENDPOINT — HAPUS SETELAH MIGRASI SELESAI
// Menerima export JSON dari Netlify lama dan menulis ke Supabase

import { getStore } from "../lib/store.mjs";

const MIGRATE_SECRET = process.env.MIGRATE_SECRET || "nutrilog-migrate-2024";

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (secret !== MIGRATE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // ── GET: status check ──────────────────────────────────────────────────
  if (req.method === "GET") {
    const action = url.searchParams.get("action");

    if (action === "fetch-and-migrate") {
      // Server-to-server: fetch dari Netlify lalu langsung tulis ke Supabase
      const netlifyUrl = url.searchParams.get("netlifyUrl");
      const netlifySecret = url.searchParams.get("netlifySecret");

      if (!netlifyUrl || !netlifySecret) {
        return new Response(
          JSON.stringify({ error: "Parameter netlifyUrl dan netlifySecret wajib diisi" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      try {
        // Fetch data dari Netlify export endpoint
        const exportUrl = `${netlifyUrl}/api/export-data?secret=${encodeURIComponent(netlifySecret)}`;
        const exportRes = await fetch(exportUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(55000), // 55 detik timeout
        });

        if (!exportRes.ok) {
          const errText = await exportRes.text();
          return new Response(
            JSON.stringify({
              error: `Netlify export gagal (${exportRes.status}): ${errText.slice(0, 300)}`,
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

        // Tulis ke Supabase
        const store = getStore("nutrilog");
        const entries = Object.entries(dataToMigrate);
        const results = { success: [], failed: [] };

        for (const [key, value] of entries) {
          try {
            await store.set(key, typeof value === "string" ? value : JSON.stringify(value));
            results.success.push(key);
          } catch (e) {
            results.failed.push({ key, error: e.message });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            total: entries.length,
            successCount: results.success.length,
            failedCount: results.failed.length,
            failed: results.failed,
            successKeys: results.success,
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

    // Default GET: cek status Supabase
    try {
      const store = getStore("nutrilog");
      const userIndex = (await store.get("users/index", { type: "json" })) || [];
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Supabase terhubung",
          existingUsers: userIndex.length,
          instructions: {
            step1: "Deploy export-data.mjs ke Netlify lama",
            step2: `Panggil: GET /api/migrate?secret=MIGRATE_SECRET&action=fetch-and-migrate&netlifyUrl=https://NAMA-NETLIFY.netlify.app&netlifySecret=EXPORT_SECRET`,
          },
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

  // ── POST: terima JSON payload langsung (alternatif manual) ─────────────
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const dataToMigrate = body.data || body;

    if (!dataToMigrate || typeof dataToMigrate !== "object") {
      return new Response(
        JSON.stringify({ error: "Body harus berisi { data: { key: value, ... } }" }),
        { status: 422, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const store = getStore("nutrilog");
    const entries = Object.entries(dataToMigrate);
    const results = { success: [], failed: [] };

    for (const [key, value] of entries) {
      try {
        await store.set(key, typeof value === "string" ? value : JSON.stringify(value));
        results.success.push(key);
      } catch (e) {
        results.failed.push({ key, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: entries.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        failed: results.failed,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
