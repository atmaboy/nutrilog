// lib/store.mjs
// KV-store menggunakan Supabase REST API (pure fetch, tanpa supabase-js)
// Tabel: kv_store (namespace TEXT, key TEXT, value TEXT, PRIMARY KEY(namespace, key))
//
// Menggunakan SERVICE_ROLE_KEY → otomatis bypass RLS
// Tidak butuh @supabase/supabase-js

function getEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diset di Vercel env"
    );
  }
  return { url, key };
}

function headers(key) {
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    // Penting: header ini bikin Supabase bypass RLS untuk service role
    "X-Client-Info": "nutrilog-server/1.0",
  };
}

export function getStore(namespace = "nutrilog") {
  return {
    async get(key, options = {}) {
      const { url, key: svcKey } = getEnv();
      const endpoint =
        `${url}/rest/v1/kv_store` +
        `?namespace=eq.${encodeURIComponent(namespace)}` +
        `&key=eq.${encodeURIComponent(key)}` +
        `&select=value&limit=1`;

      const res = await fetch(endpoint, {
        method: "GET",
        headers: headers(svcKey),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase GET error ${res.status}: ${err}`);
      }

      const rows = await res.json();
      if (!rows || rows.length === 0) return null;

      const raw = rows[0].value;
      if (raw == null) return null;

      if (options.type === "json") {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return raw;
    },

    async set(key, value) {
      const { url, key: svcKey } = getEnv();
      const content =
        typeof value === "string" ? value : JSON.stringify(value);

      const res = await fetch(`${url}/rest/v1/kv_store`, {
        method: "POST",
        headers: {
          ...headers(svcKey),
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          namespace,
          key,
          value: content,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase SET error ${res.status}: ${err}`);
      }
    },

    async delete(key) {
      const { url, key: svcKey } = getEnv();
      const endpoint =
        `${url}/rest/v1/kv_store` +
        `?namespace=eq.${encodeURIComponent(namespace)}` +
        `&key=eq.${encodeURIComponent(key)}`;

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: headers(svcKey),
      });

      if (!res.ok) {
        // Abaikan error delete — tidak kritikal
        console.warn(`Supabase DELETE warn ${res.status}`);
      }
    },
  };
}
