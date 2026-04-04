// lib/store.mjs — wrapper @vercel/kv menggantikan @netlify/blobs
import { kv } from "@vercel/kv";

/**
 * Wrapper sederhana mirip getStore('@netlify/blobs'):
 *   store.get(key, { type: "json" })  -> parse JSON otomatis
 *   store.get(key)                    -> nilai raw
 *   store.set(key, value)             -> simpan string/object
 *   store.delete(key)
 */
export function getStore(namespace = "nutrilog") {
  const prefix = namespace ? `${namespace}:` : "";

  function fullKey(key) {
    return `${prefix}${key}`;
  }

  return {
    async get(key, options = {}) {
      const value = await kv.get(fullKey(key));
      if (value == null) return null;

      if (options.type === "json") {
        if (typeof value === "string") {
          try { return JSON.parse(value); } catch { return null; }
        }
        return value;
      }

      return value;
    },

    async set(key, value) {
      return kv.set(fullKey(key), value);
    },

    async delete(key) {
      return kv.del(fullKey(key));
    },
  };
}
