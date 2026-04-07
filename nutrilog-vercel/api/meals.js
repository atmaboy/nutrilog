// api/meals.js
import crypto from 'crypto';
import { getSupabase, verifyToken, cors, ok, err, EXPIRY_DAYS } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = verifyToken(req.headers.authorization); }
  catch (e) { return err(res, e.message, 401); }

  const sb = getSupabase();
  const mealId = req.query.id;

  // GET
  if (req.method === 'GET') {
    if (mealId) {
      const { data, error } = await sb.from('meals').select('*').eq('id', mealId).eq('user_id', user.userId).single();
      if (error || !data) return err(res, 'Meal not found', 404);
      return ok(res, { id: data.id, timestamp: data.timestamp, imageData: data.image_data, nutrition: data.nutrition });
    }
    // Auto-delete expired, then list
    const cutoff = new Date(Date.now() - EXPIRY_DAYS * 86400000).toISOString();
    await sb.from('meals').delete().eq('user_id', user.userId).lt('timestamp', cutoff);
    const { data, error } = await sb.from('meals')
      .select('id,timestamp,dish_names,total_calories,total_protein,total_carbs,total_fat,health_score')
      .eq('user_id', user.userId).order('timestamp', { ascending: false });
    if (error) return err(res, error.message, 500);
    return ok(res, (data || []).map(m => ({
      id: m.id, timestamp: m.timestamp, dishNames: m.dish_names,
      totalCalories: m.total_calories, totalProtein: m.total_protein,
      totalCarbs: m.total_carbs, totalFat: m.total_fat, healthScore: m.health_score,
    })));
  }

  // POST
  if (req.method === 'POST') {
    const { imageData, nutrition, timestamp } = req.body || {};
    if (!nutrition) return err(res, 'nutrition required');
    const id = 'm_' + crypto.randomBytes(10).toString('hex');
    const ts = timestamp || new Date().toISOString();
    const dishes = nutrition.dishes || [];
    const { error } = await sb.from('meals').insert({
      id, user_id: user.userId, timestamp: ts,
      dish_names: dishes.map(d => d.name),
      total_calories: nutrition.total_calories || 0, total_protein: nutrition.total_protein_g || 0,
      total_carbs: nutrition.total_carbs_g || 0, total_fat: nutrition.total_fat_g || 0,
      total_fiber: nutrition.total_fiber_g || 0, health_score: nutrition.health_score || 0,
      image_data: imageData || '', nutrition, created_at: new Date().toISOString(),
    });
    if (error) return err(res, error.message, 500);
    return ok(res, { success: true, meal: { id, timestamp: ts, dishNames: dishes.map(d => d.name), totalCalories: nutrition.total_calories || 0 } }, 201);
  }

  // DELETE
  if (req.method === 'DELETE' && mealId) {
    const { error } = await sb.from('meals').delete().eq('id', mealId).eq('user_id', user.userId);
    if (error) return err(res, error.message, 500);
    return ok(res, { success: true });
  }

  return err(res, 'Method not allowed', 405);
}
