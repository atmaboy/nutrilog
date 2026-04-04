// api/admin.mjs
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { hashPwd, signToken, verifyToken, json, preflight } from "../lib/utils.mjs";

const DEFAULT_ADMIN_PWD = "Admin1234!";
const ADMIN_SALT = "nutrilog_admin_2024";

function signAdminToken() {
  return signToken({ role: "admin" }, 4 * 60 * 60 * 1000);
}

function verifyAdmin(authHeader) {
  const payload = verifyToken(authHeader);
  if (payload.role !== "admin") throw new Error("Not admin");
  return payload;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return preflight();

  const store = getStore("nutrilog");
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Public: admin login
  if (req.method === "POST" && action === "login") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const hash = await hashPwd(body.password || "", ADMIN_SALT);
    let cfg;
    try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch { cfg = {}; }
    const stored = cfg.adminPasswordHash || (await hashPwd(DEFAULT_ADMIN_PWD, ADMIN_SALT));
    if (hash !== stored) return json({ error: "Password salah" }, 401);
    return json({ token: signAdminToken() });
  }

  // All other routes require admin token
  try { verifyAdmin(req.headers.get("authorization")); }
  catch (e) { return json({ error: "Unauthorized: " + e.message }, 401); }

  // GET stats
  if (req.method === "GET" && action === "stats") {
    let userIndex;
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch { userIndex = []; }
    let cfg;
    try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch { cfg = {}; }

    const today = new Date().toDateString();
    let totalMeals = 0, totalCal = 0, todayMeals = 0;

    const users = await Promise.all(userIndex.map(async u => {
      let idx;
      try { idx = (await store.get(`meals/index/${u.id}`, { type: "json" })) || []; } catch { idx = []; }
      const kcal = idx.reduce((s, m) => s + (m.totalCalories || 0), 0);
      const td = idx.filter(m => new Date(m.timestamp).toDateString() === today).length;
      totalMeals += idx.length; totalCal += kcal; todayMeals += td;
      return { ...u, totalMeals: idx.length, totalCalories: Math.round(kcal), recentMeals: idx.slice(0, 5) };
    }));

    const allRecent = users.flatMap(u => (u.recentMeals || []).map(m => ({ ...m, username: u.username })))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

    let openReports = 0;
    try {
      const ri = (await store.get("reports/index", { type: "json" })) || [];
      openReports = ri.filter(r => r.status === "open").length;
    } catch {}

    return json({
      totalUsers: userIndex.length, totalMeals,
      totalCalories: Math.round(totalCal), todayMeals,
      hasApiKey: !!(process.env.ANTHROPIC_API_KEY || cfg.apiKey),
      dailyLimit: typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5,
      openReports, users, recentActivity: allRecent,
    });
  }

  // GET user-meals
  if (req.method === "GET" && action === "user-meals") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ error: "userId required" }, 400);
    let idx;
    try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch { idx = []; }
    return json(idx);
  }

  // POST set-apikey
  if (req.method === "POST" && action === "set-apikey") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.apiKey) return json({ error: "apiKey required" }, 400);
    let cfg;
    try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch { cfg = {}; }
    cfg.apiKey = body.apiKey;
    await store.set("config/global", JSON.stringify(cfg));
    return json({ success: true });
  }

  // POST set-limit
  if (req.method === "POST" && action === "set-limit") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const limit = parseInt(body.dailyLimit, 10);
    if (isNaN(limit) || limit < 1 || limit > 9999) return json({ error: "Limit harus 1\u20139999" }, 400);
    let cfg;
    try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch { cfg = {}; }
    cfg.dailyLimit = limit;
    await store.set("config/global", JSON.stringify(cfg));
    return json({ success: true, dailyLimit: limit });
  }

  // POST change-pwd
  if (req.method === "POST" && action === "change-pwd") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.newPassword || body.newPassword.length < 8) return json({ error: "Password minimal 8 karakter" }, 400);
    let cfg;
    try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch { cfg = {}; }
    cfg.adminPasswordHash = await hashPwd(body.newPassword, ADMIN_SALT);
    await store.set("config/global", JSON.stringify(cfg));
    return json({ success: true });
  }

  // GET changelog
  if (req.method === "GET" && action === "get-changelog") {
    let log;
    try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch { log = []; }
    return json(log);
  }

  // POST add-changelog
  if (req.method === "POST" && action === "add-changelog") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.title?.trim()) return json({ error: "Title wajib diisi" }, 400);
    const entry = {
      id: "cl_" + crypto.randomBytes(6).toString("hex"),
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      version: (body.version || "").trim(),
      title: body.title.trim(),
      description: (body.description || "").trim(),
      author: "admin",
    };
    let log;
    try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch { log = []; }
    log.unshift(entry);
    await store.set("changelog/index", JSON.stringify(log));
    return json({ success: true, entry });
  }

  // DELETE delete-changelog
  if (req.method === "DELETE" && action === "delete-changelog") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    let log;
    try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch { log = []; }
    await store.set("changelog/index", JSON.stringify(log.filter(e => e.id !== id)));
    return json({ success: true });
  }

  // GET reports
  if (req.method === "GET" && action === "get-reports") {
    let idx;
    try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch { idx = []; }
    const status = url.searchParams.get("status");
    if (status) idx = idx.filter(r => r.status === status);
    return json(idx);
  }

  // GET single report
  if (req.method === "GET" && action === "get-report") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    try {
      const r = await store.get(`reports/${id}`, { type: "json" });
      return json(r || {});
    } catch { return json({ error: "Not found" }, 404); }
  }

  // POST update-report
  if (req.method === "POST" && action === "update-report") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { id, status } = body;
    if (!id || !["open", "resolved"].includes(status)) return json({ error: "Invalid params" }, 400);
    try {
      const r = await store.get(`reports/${id}`, { type: "json" });
      if (!r) return json({ error: "Not found" }, 404);
      r.status = status;
      await store.set(`reports/${id}`, JSON.stringify(r));
      let idx;
      try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch { idx = []; }
      const i = idx.findIndex(x => x.id === id);
      if (i >= 0) idx[i].status = status;
      await store.set("reports/index", JSON.stringify(idx));
      return json({ success: true });
    } catch { return json({ error: "Failed" }, 500); }
  }

  // DELETE report
  if (req.method === "DELETE" && action === "delete-report") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    await store.delete(`reports/${id}`).catch(() => {});
    let idx;
    try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch { idx = []; }
    await store.set("reports/index", JSON.stringify(idx.filter(r => r.id !== id)));
    return json({ success: true });
  }

  // DELETE user
  if (req.method === "DELETE" && action === "delete-user") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ error: "userId required" }, 400);
    let idx;
    try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch { idx = []; }
    await Promise.all(idx.map(m => store.delete(`meals/data/${userId}/${m.id}`).catch(() => {})));
    await store.delete(`meals/index/${userId}`).catch(() => {});
    await store.delete(`users/${userId}`).catch(() => {});
    let userIndex;
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch { userIndex = []; }
    await store.set("users/index", JSON.stringify(userIndex.filter(u => u.id !== userId)));
    return json({ success: true });
  }

  // DELETE clear-meals
  if (req.method === "DELETE" && action === "clear-meals") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ error: "userId required" }, 400);
    let idx;
    try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch { idx = []; }
    await Promise.all(idx.map(m => store.delete(`meals/data/${userId}/${m.id}`).catch(() => {})));
    await store.delete(`meals/index/${userId}`).catch(() => {});
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
