// api/analyze.mjs
import { getStore } from "../lib/store.mjs";
import { verifyToken, json, preflight } from "../lib/utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let user;
  try { user = verifyToken(req.headers.get("authorization")); }
  catch (e) { return json({ error: "Unauthorized: " + e.message }, 401); }

  const store = getStore("nutrilog");
  const today = new Date().toISOString().split("T")[0];
  const usageKey = `usage/${user.userId}/${today}`;

  let cfg = {};
  try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
  const dailyLimit = typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5;

  let todayUsage = 0;
  try { const raw = (await store.get(usageKey)) || "0"; todayUsage = parseInt(raw, 10) || 0; } catch {}

  if (todayUsage >= dailyLimit) {
    return json({
      error: "DAILY_LIMIT_REACHED",
      message: `Anda sudah mencapai limit analisa foto harian (${dailyLimit} foto/hari). Analisa kembali besok atau hubungi admin untuk penambahan kuota.`,
      limit: dailyLimit,
      used: todayUsage,
    }, 429);
  }

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { try { apiKey = cfg.apiKey; } catch {} }
  if (!apiKey) return json({ error: "API Key belum dikonfigurasi. Hubungi admin." }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    if (upstream.ok) await store.set(usageKey, String(todayUsage + 1));
    return json(data, upstream.status);
  } catch (err) {
    return json({ error: "Gagal menghubungi Anthropic: " + err.message }, 502);
  }
}
