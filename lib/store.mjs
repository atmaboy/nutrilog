// lib/store.mjs
// Storage engine menggunakan Supabase (project: supabase-db-experiment)
// Table: kv_store (namespace TEXT, key TEXT, value TEXT, PRIMARY KEY(namespace, key))
//
// SQL untuk buat table di Supabase SQL Editor:
// CREATE TABLE IF NOT EXISTS kv_store (
//   namespace TEXT NOT NULL,
//   key       TEXT NOT NULL,
//   value     TEXT,
//   updated_at TIMESTAMPTZ DEFAULT now(),
//   PRIMARY KEY (namespace, key)
// );

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ||
               process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase belum dikonfigurasi. Tambahkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel Environment Variables."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

export function getStore(namespace = "nutrilog") {
  return {
    async get(key, options = {}) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("kv_store")
          .select("value")
          .eq("namespace", namespace)
          .eq("key", key)
          .maybeSingle();

        if (error || !data) return null;

        const raw = data.value;
        if (raw == null) return null;

        if (options.type === "json") {
          try { return JSON.parse(raw); } catch { return null; }
        }
        return raw;
      } catch {
        return null;
      }
    },

    async set(key, value) {
      const supabase = getSupabase();
      const content = typeof value === "string" ? value : JSON.stringify(value);

      const { error } = await supabase
        .from("kv_store")
        .upsert(
          { namespace, key, value: content, updated_at: new Date().toISOString() },
          { onConflict: "namespace,key" }
        );

      if (error) throw new Error("Supabase set error: " + error.message);
    },

    async delete(key) {
      try {
        const supabase = getSupabase();
        await supabase
          .from("kv_store")
          .delete()
          .eq("namespace", namespace)
          .eq("key", key);
      } catch {
        // Abaikan error delete
      }
    }
  };
}
