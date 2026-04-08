// api/admin.mjs — Node.js style untuk Vercel
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { hashPwd, signToken, verifyToken, setCors } from "../lib/utils.mjs";

const DEFAULT_ADMIN_PWD = "Admin1234!";
const ADMIN_SALT        = "nutrilog_admin_2024";

function signAdminToken() {
  return signToken({ role: "admin" }, 4 * 60 * 60 * 1000);
}

function verifyAdmin(authHeader) {
  const payload = verifyToken(authHeader);
  if (payload.role !== "admin") throw new Error("Not admin");
  return payload;
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();

    const action = req.query?.action || null;
    
    // ── PUBLIC: maintenance status (no token needed) ──────────────────────────
if (req.method === "GET" && action === "get-maintenance-status") {
  const pubStore = getStore("nutrilog");
  let cfg = {};
  try { cfg = (await pubStore.get("config/global", { type: "json" })) || {}; } catch {}
  const m = cfg.maintenance || {};
  return res.status(200).json({
    enabled:     !!m.enabled,
    title:       m.title       || "NutriLog sedang dalam perbaikan",
    description: m.description || "Kami sedang melakukan peningkatan sistem. Silakan kembali beberapa saat lagi.",
  });
}

    // ── PUBLIC: admin login ──────────────────────────────────────────────────
    if (req.method === "POST" && action === "login") {
      try {
        const { password } = req.body || {};
        const hash = await hashPwd(password || "", ADMIN_SALT);

        // Coba baca config dari store; kalau Supabase belum tersambung, pakai default
        let cfg = {};
        try {
          const store = getStore("nutrilog");
          cfg = (await store.get("config/global", { type: "json" })) || {};
        } catch (storeErr) {
          console.error("[admin/login] store error:", storeErr.message);
          // Lanjut dengan cfg kosong → akan pakai password default
        }

        const stored = cfg.adminPasswordHash || (await hashPwd(DEFAULT_ADMIN_PWD, ADMIN_SALT));
        if (hash !== stored) return res.status(401).json({ error: "Password salah" });

        return res.status(200).json({ token: signAdminToken() });
      } catch (loginErr) {
        console.error("[admin/login] unexpected error:", loginErr.message);
        return res.status(500).json({ error: "Login gagal: " + loginErr.message });
      }
    }

    // ── PROTECTED: verifikasi admin token ────────────────────────────────────
    try {
      verifyAdmin(req.headers["authorization"]);
    } catch (e) {
      return res.status(401).json({ error: "Unauthorized: " + e.message });
    }

    const store = getStore("nutrilog");

    // ── GET stats ────────────────────────────────────────────────────────────
    if (req.method === "GET" && action === "stats") {
      let userIndex = [];
      try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch {}

      let cfg = {};
      try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}

      const globalDailyLimit = typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5;
      const today = new Date().toDateString();
      let totalMeals = 0, totalCal = 0, todayMeals = 0;

      const users = await Promise.all(
        userIndex.map(async (u) => {
          let idx = [];
          try { idx = (await store.get(`meals/index/${u.id}`, { type: "json" })) || []; } catch {}

          let detail = null;
          try { detail = await store.get(`users/${u.id}`, { type: "json" }); } catch {}

          const kcal = idx.reduce((s, m) => s + (m.totalCalories || 0), 0);
          const td   = idx.filter((m) => new Date(m.timestamp).toDateString() === today).length;
          const dailyLimitOverride = typeof detail?.dailyLimit === "number" && detail.dailyLimit > 0 ? detail.dailyLimit : null;
          const effectiveDailyLimit = dailyLimitOverride || globalDailyLimit;

          totalMeals += idx.length;
          totalCal   += kcal;
          todayMeals += td;

          return {
            ...u,
            totalMeals: idx.length,
            totalCalories: Math.round(kcal),
            recentMeals: idx.slice(0, 5),
            dailyLimitOverride,
            effectiveDailyLimit,
          };
        })
      );

      const allRecent = users
        .flatMap((u) => (u.recentMeals || []).map((m) => ({ ...m, username: u.username })))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 20);

      let openReports = 0;
      try {
        const ri = (await store.get("reports/index", { type: "json" })) || [];
        openReports = ri.filter((r) => r.status === "open").length;
      } catch {}

      return res.status(200).json({
        totalUsers:     userIndex.length,
        totalMeals,
        totalCalories:  Math.round(totalCal),
        todayMeals,
        hasApiKey:      !!(process.env.ANTHROPIC_API_KEY || cfg.apiKey),
        dailyLimit:     typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5,
        openReports,
        users,
        recentActivity: allRecent,
      });
    }

    // ── GET user-meals ────────────────────────────────────────────────────────
    if (req.method === "GET" && action === "user-meals") {
      const { userId } = req.query || {};
      if (!userId) return res.status(400).json({ error: "userId required" });

      let idx = [];
      try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch {}
      return res.status(200).json(idx);
    }

    // ── POST set-apikey ───────────────────────────────────────────────────────
    if (req.method === "POST" && action === "set-apikey") {
      const { apiKey } = req.body || {};
      if (!apiKey) return res.status(400).json({ error: "apiKey required" });

      let cfg = {};
      try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
      cfg.apiKey = apiKey;
      await store.set("config/global", JSON.stringify(cfg));
      return res.status(200).json({ success: true });
    }

    // ── POST set-limit ────────────────────────────────────────────────────────
    if (req.method === "POST" && action === "set-limit") {
      const limit = parseInt((req.body || {}).dailyLimit, 10);
      if (isNaN(limit) || limit < 1 || limit > 9999)
        return res.status(400).json({ error: "Limit harus 1\u20139999" });

      let cfg = {};
      try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
      cfg.dailyLimit = limit;
      await store.set("config/global", JSON.stringify(cfg));
      return res.status(200).json({ success: true, dailyLimit: limit });
    }

    // ── POST set-user-limit ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "set-user-limit") {
      const { userId, dailyLimit } = req.body || {};
      if (!userId) return res.status(400).json({ error: "userId required" });

      let user = null;
      try { user = await store.get(`users/${userId}`, { type: "json" }); } catch {}
      if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

      let cfg = {};
      try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
      const globalDailyLimit = typeof cfg.dailyLimit === "number" ? cfg.dailyLimit : 5;

      if (dailyLimit === null) {
        delete user.dailyLimit;
        await store.set(`users/${userId}`, JSON.stringify(user));
        return res.status(200).json({ success: true, dailyLimitOverride: null, effectiveDailyLimit: globalDailyLimit });
      }

      const parsedLimit = parseInt(dailyLimit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 9999)
        return res.status(400).json({ error: "Limit user harus 1\u20139999" });

      user.dailyLimit = parsedLimit;
      await store.set(`users/${userId}`, JSON.stringify(user));
      return res.status(200).json({ success: true, dailyLimitOverride: parsedLimit, effectiveDailyLimit: parsedLimit });
    }

    // ── POST change-pwd ───────────────────────────────────────────────────────
    if (req.method === "POST" && action === "change-pwd") {
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 8)
        return res.status(400).json({ error: "Password minimal 8 karakter" });

      let cfg = {};
      try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
      cfg.adminPasswordHash = await hashPwd(newPassword, ADMIN_SALT);
      await store.set("config/global", JSON.stringify(cfg));
      return res.status(200).json({ success: true });
    }

    // ── GET get-changelog ─────────────────────────────────────────────────────
    if (req.method === "GET" && action === "get-changelog") {
      let log = [];
      try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch {}
      return res.status(200).json(log);
    }

    // ── POST add-changelog ────────────────────────────────────────────────────
    if (req.method === "POST" && action === "add-changelog") {
      const { title, version, description } = req.body || {};
      if (!title?.trim()) return res.status(400).json({ error: "Title wajib diisi" });

      const entry = {
        id:          "cl_" + crypto.randomBytes(6).toString("hex"),
        timestamp:   new Date().toISOString(),
        date:        new Date().toISOString().split("T")[0],
        version:     (version || "").trim(),
        title:       title.trim(),
        description: (description || "").trim(),
        author:      "admin",
      };

      let log = [];
      try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch {}
      log.unshift(entry);
      await store.set("changelog/index", JSON.stringify(log));
      return res.status(200).json({ success: true, entry });
    }

    // ── DELETE delete-changelog ───────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-changelog") {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: "id required" });

      let log = [];
      try { log = (await store.get("changelog/index", { type: "json" })) || []; } catch {}
      await store.set("changelog/index", JSON.stringify(log.filter((e) => e.id !== id)));
      return res.status(200).json({ success: true });
    }

    // ── GET get-reports ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "get-reports") {
      let idx = [];
      try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch {}

      const { status } = req.query || {};
      if (status) idx = idx.filter((r) => r.status === status);
      return res.status(200).json(idx);
    }

    // ── GET get-report (single) ───────────────────────────────────────────────
    if (req.method === "GET" && action === "get-report") {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: "id required" });

      try {
        const r = await store.get(`reports/${id}`, { type: "json" });
        return r ? res.status(200).json(r) : res.status(404).json({ error: "Not found" });
      } catch {
        return res.status(404).json({ error: "Not found" });
      }
    }

    // ── POST update-report ────────────────────────────────────────────────────
    if (req.method === "POST" && action === "update-report") {
      const { id, status } = req.body || {};
      if (!id || !["open", "resolved"].includes(status))
        return res.status(400).json({ error: "Invalid params" });

      try {
        const r = await store.get(`reports/${id}`, { type: "json" });
        if (!r) return res.status(404).json({ error: "Not found" });

        r.status = status;
        await store.set(`reports/${id}`, JSON.stringify(r));

        let idx = [];
        try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch {}
        const i = idx.findIndex((x) => x.id === id);
        if (i >= 0) idx[i].status = status;
        await store.set("reports/index", JSON.stringify(idx));

        return res.status(200).json({ success: true });
      } catch {
        return res.status(500).json({ error: "Failed" });
      }
    }

    // ── DELETE delete-report ──────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-report") {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: "id required" });

      await store.delete(`reports/${id}`).catch(() => {});
      let idx = [];
      try { idx = (await store.get("reports/index", { type: "json" })) || []; } catch {}
      await store.set("reports/index", JSON.stringify(idx.filter((r) => r.id !== id)));
      return res.status(200).json({ success: true });
    }
    
    // ── GET get-maintenance (admin) ───────────────────────────────────────────
if (req.method === "GET" && action === "get-maintenance") {
  let cfg = {};
  try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
  const m = cfg.maintenance || {};
  return res.status(200).json({
    enabled:     !!m.enabled,
    title:       m.title       || "NutriLog sedang dalam perbaikan",
    description: m.description || "Kami sedang melakukan peningkatan sistem. Silakan kembali beberapa saat lagi.",
  });
}

// ── POST set-maintenance ──────────────────────────────────────────────────
if (req.method === "POST" && action === "set-maintenance") {
  const { enabled, title, description } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: "Judul maintenance wajib diisi" });
  let cfg = {};
  try { cfg = (await store.get("config/global", { type: "json" })) || {}; } catch {}
  cfg.maintenance = {
    enabled:     !!enabled,
    title:       title.trim(),
    description: (description || "").trim(),
    updatedAt:   new Date().toISOString(),
  };
  await store.set("config/global", JSON.stringify(cfg));
  return res.status(200).json({ success: true, maintenance: cfg.maintenance });
}

    // ── DELETE delete-user ────────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-user") {
      const { userId } = req.query || {};
      if (!userId) return res.status(400).json({ error: "userId required" });

      let idx = [];
      try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch {}

      await Promise.all(idx.map((m) => store.delete(`meals/data/${userId}/${m.id}`).catch(() => {})));
      await store.delete(`meals/index/${userId}`).catch(() => {});
      await store.delete(`users/${userId}`).catch(() => {});

      let userIndex = [];
      try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch {}
      await store.set("users/index", JSON.stringify(userIndex.filter((u) => u.id !== userId)));

      return res.status(200).json({ success: true });
    }

    // ── DELETE clear-meals ────────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "clear-meals") {
      const { userId } = req.query || {};
      if (!userId) return res.status(400).json({ error: "userId required" });

      let idx = [];
      try { idx = (await store.get(`meals/index/${userId}`, { type: "json" })) || []; } catch {}

      await Promise.all(idx.map((m) => store.delete(`meals/data/${userId}/${m.id}`).catch(() => {})));
      await store.delete(`meals/index/${userId}`).catch(() => {});

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: "Not found" });

  } catch (fatalErr) {
    console.error("[admin] fatal error:", fatalErr.message, fatalErr.stack);
    return res.status(500).json({ error: "Server error: " + fatalErr.message });
  }
}
