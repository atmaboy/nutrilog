// api/meals.mjs
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { verifyToken, json, preflight, EXPIRY_DAYS } from "../lib/utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return preflight();

  let user;
  try { user = verifyToken(req.headers.get("authorization")); }
  catch (e) { return json({ error: "Unauthorized: " + e.message }, 401); }

  const store = getStore("nutrilog");
  const url = new URL(req.url);
  const mealId = url.searchParams.get("id");

  // GET
  if (req.method === "GET") {
    if (mealId) {
      try {
        const meal = await store.get(`meals/data/${user.userId}/${mealId}`, { type: "json" });
        return meal ? json(meal) : json({ error: "Meal not found" }, 404);
      } catch { return json({ error: "Failed to fetch meal" }, 500); }
    }

    let index;
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; }
    catch { index = []; }

    const cutoff = Date.now() - EXPIRY_DAYS * 86_400_000;
    const expired = index.filter(m => new Date(m.timestamp).getTime() <= cutoff);
    const valid = index.filter(m => new Date(m.timestamp).getTime() > cutoff);

    if (expired.length) {
      await Promise.all(expired.map(m => store.delete(`meals/data/${user.userId}/${m.id}`).catch(() => {})));
      await store.set(`meals/index/${user.userId}`, JSON.stringify(valid));
    }

    return json(valid);
  }

  // POST
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const id = "m_" + crypto.randomBytes(10).toString("hex");
    const timestamp = body.timestamp || new Date().toISOString();
    const nutrition = body.nutrition || {};

    await store.set(`meals/data/${user.userId}/${id}`, JSON.stringify({
      id, timestamp, imageData: body.imageData || "", nutrition,
    }));

    const meta = {
      id, timestamp,
      dishNames: (nutrition.dishes || []).map(d => d.name),
      totalCalories: nutrition.total_calories || 0,
      totalProtein: nutrition.total_protein_g || 0,
      totalCarbs: nutrition.total_carbs_g || 0,
      totalFat: nutrition.total_fat_g || 0,
      healthScore: nutrition.health_score || 0,
    };

    let index;
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; }
    catch { index = []; }
    index.unshift(meta);
    await store.set(`meals/index/${user.userId}`, JSON.stringify(index));

    return json({ success: true, meal: meta }, 201);
  }

  // DELETE
  if (req.method === "DELETE" && mealId) {
    await store.delete(`meals/data/${user.userId}/${mealId}`).catch(() => {});
    let index;
    try { index = (await store.get(`meals/index/${user.userId}`, { type: "json" })) || []; }
    catch { index = []; }
    await store.set(`meals/index/${user.userId}`, JSON.stringify(index.filter(m => m.id !== mealId)));
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
