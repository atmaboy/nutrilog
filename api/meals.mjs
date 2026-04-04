// api/meals.mjs — Node.js style untuk Vercel
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { verifyToken, setCors, EXPIRY_DAYS } from "../lib/utils.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth
  let user;
  try {
    user = verifyToken(req.headers["authorization"]);
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized: " + e.message });
  }

  const store = getStore("nutrilog");
  const mealId = req.query?.id || null;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    if (mealId) {
      try {
        const meal = await store.get(`meals/data/${user.userId}/${mealId}`, { type: "json" });
        return meal
          ? res.status(200).json(meal)
          : res.status(404).json({ error: "Meal not found" });
      } catch {
        return res.status(500).json({ error: "Failed to fetch meal" });
      }
    }

    let index = [];
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; } catch {}

    // Auto-delete expired
    const cutoff = Date.now() - EXPIRY_DAYS * 86_400_000;
    const expired = index.filter((m) => new Date(m.timestamp).getTime() <= cutoff);
    const valid   = index.filter((m) => new Date(m.timestamp).getTime() > cutoff);

    if (expired.length) {
      await Promise.all(
        expired.map((m) => store.delete(`meals/data/${user.userId}/${m.id}`).catch(() => {}))
      );
      await store.set(`meals/index/${user.userId}`, JSON.stringify(valid));
    }

    return res.status(200).json(valid);
  }

  // ── POST (save meal) ──────────────────────────────────────────────────────
  if (req.method === "POST") {
    const body      = req.body || {};
    const id        = "m_" + crypto.randomBytes(10).toString("hex");
    const timestamp = body.timestamp || new Date().toISOString();
    const nutrition = body.nutrition || {};

    await store.set(
      `meals/data/${user.userId}/${id}`,
      JSON.stringify({ id, timestamp, imageData: body.imageData || "", nutrition })
    );

    const meta = {
      id,
      timestamp,
      dishNames:     (nutrition.dishes || []).map((d) => d.name),
      totalCalories: nutrition.total_calories  || 0,
      totalProtein:  nutrition.total_protein_g || 0,
      totalCarbs:    nutrition.total_carbs_g   || 0,
      totalFat:      nutrition.total_fat_g     || 0,
      healthScore:   nutrition.health_score    || 0,
    };

    let index = [];
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; } catch {}
    index.unshift(meta);
    await store.set(`meals/index/${user.userId}`, JSON.stringify(index));

    return res.status(201).json({ success: true, meal: meta });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE" && mealId) {
    await store.delete(`meals/data/${user.userId}/${mealId}`).catch(() => {});

    let index = [];
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; } catch {}
    await store.set(`meals/index/${user.userId}`, JSON.stringify(index.filter((m) => m.id !== mealId)));

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
