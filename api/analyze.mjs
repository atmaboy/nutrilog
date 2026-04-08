// api/analyze.mjs — Node.js style untuk Vercel
import { getStore } from "../lib/store.mjs";
import { verifyToken, setCors } from "../lib/utils.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Auth
  let user;
  try {
    user = verifyToken(req.headers["authorization"]);
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized: " + e.message });
  }

  const store = getStore("nutrilog");
  const today    = new Date().toISOString().split("T")[0];
  const usageKey = `usage/${user.userId}/${today}`;

  // Baca config global + limit khusus user (jika ada)
  let cfg = {};
  try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}

  let userDetail = null;
  try { userDetail = await store.get(`users/${user.userId}`, { type: "json" }); } catch {}

  const globalDailyLimit = typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5;
  const dailyLimit = typeof userDetail?.dailyLimit === "number" && userDetail.dailyLimit > 0
    ? userDetail.dailyLimit
    : globalDailyLimit;

  // Baca usage hari ini
  let todayUsage = 0;
  try { todayUsage = parseInt((await store.get(usageKey)) || "0", 10) || 0; } catch {}

  if (todayUsage >= dailyLimit) {
    return res.status(429).json({
      error:   "DAILY_LIMIT_REACHED",
      message: `Anda sudah mencapai limit analisa foto harian (${dailyLimit} foto/hari). Analisa kembali besok atau hubungi admin untuk penambahan kuota.`,
      limit:   dailyLimit,
      used:    todayUsage,
      globalLimit: globalDailyLimit,
      hasCustomLimit: dailyLimit !== globalDailyLimit,
    });
  }

  // Resolve API key Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY || cfg.apiKey;
  if (!apiKey)
    return res.status(503).json({ error: "API Key belum dikonfigurasi. Hubungi admin." });

  const body = req.body || {};

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (upstream.ok) {
      await store.set(usageKey, String(todayUsage + 1));
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Gagal menghubungi Anthropic: " + err.message });
  }
}
