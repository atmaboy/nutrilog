// api/admin.js
import crypto from 'crypto';
import { getSupabase, signAdminToken, verifyAdminToken, hashPwd, getConfig, setConfig, cors, ok, err, DEFAULT_LIMIT } from './_lib.js';

const ADMIN_SALT = 'nutrilog_admin_2024';
const DEFAULT_ADMIN_PWD = 'Admin1234!';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  const sb = getSupabase();

  // Public: login
  if (req.method === 'POST' && action === 'login') {
    const { password } = req.body || {};
    const hash = hashPwd(password || '', ADMIN_SALT);
    const stored = (await getConfig('admin_password_hash')) || hashPwd(DEFAULT_ADMIN_PWD, ADMIN_SALT);
    if (hash !== stored) return err(res, 'Password salah', 401);
    return ok(res, { token: signAdminToken() });
  }

  // All protected
  try { verifyAdminToken(req.headers.authorization); }
  catch (e) { return err(res, e.message, 401); }

  // GET stats
  if (req.method === 'GET' && action === 'stats') {
    const { data: users } = await sb.from('users').select('id,username,created_at').order('created_at', { ascending: false });
    const { data: mealsAgg } = await sb.from('meals').select('user_id,total_calories');
    const { data: todayMeals } = await sb.from('meals').select('user_id').gte('timestamp', new Date().toISOString().split('T')[0]);
    const { data: openRpts } = await sb.from('reports').select('id').eq('status', 'open');
    const limitStr = await getConfig('daily_limit');
    const apiKey = process.env.ANTHROPIC_API_KEY || await getConfig('api_key');

    const mealsByUser = {};
    const calsByUser = {};
    (mealsAgg || []).forEach(m => {
      mealsByUser[m.user_id] = (mealsByUser[m.user_id] || 0) + 1;
      calsByUser[m.user_id] = (calsByUser[m.user_id] || 0) + (m.total_calories || 0);
    });

    const enriched = (users || []).map(u => ({ ...u, totalMeals: mealsByUser[u.id] || 0, totalCalories: Math.round(calsByUser[u.id] || 0) }));

    const { data: recent } = await sb.from('meals')
      .select('id,timestamp,dish_names,total_calories,users(username)')
      .order('timestamp', { ascending: false }).limit(20);

    return ok(res, {
      totalUsers: (users || []).length,
      totalMeals: Object.values(mealsByUser).reduce((s, v) => s + v, 0),
      totalCalories: Math.round(Object.values(calsByUser).reduce((s, v) => s + v, 0)),
      todayMeals: (todayMeals || []).length,
      openReports: (openRpts || []).length,
      hasApiKey: !!apiKey,
      dailyLimit: limitStr ? parseInt(limitStr) : DEFAULT_LIMIT,
      users: enriched,
      recentActivity: (recent || []).map(m => ({ id: m.id, timestamp: m.timestamp, dishNames: m.dish_names, totalCalories: m.total_calories, username: m.users?.username || '?' })),
    });
  }

  // GET user-meals
  if (req.method === 'GET' && action === 'user-meals') {
    const userId = req.query.userId;
    if (!userId) return err(res, 'userId required');
    const { data } = await sb.from('meals').select('id,timestamp,dish_names,total_calories,total_protein,total_carbs,total_fat,health_score').eq('user_id', userId).order('timestamp', { ascending: false });
    return ok(res, (data || []).map(m => ({ id: m.id, timestamp: m.timestamp, dishNames: m.dish_names, totalCalories: m.total_calories, totalProtein: m.total_protein, totalCarbs: m.total_carbs, totalFat: m.total_fat })));
  }

  // POST set-apikey
  if (req.method === 'POST' && action === 'set-apikey') {
    const { apiKey } = req.body || {};
    if (!apiKey) return err(res, 'apiKey required');
    await setConfig('api_key', apiKey);
    return ok(res, { success: true });
  }

  // POST set-limit
  if (req.method === 'POST' && action === 'set-limit') {
    const limit = parseInt(req.body?.dailyLimit, 10);
    if (isNaN(limit) || limit < 1 || limit > 9999) return err(res, 'Limit harus 1-9999');
    await setConfig('daily_limit', String(limit));
    return ok(res, { success: true, dailyLimit: limit });
  }

  // POST change-pwd
  if (req.method === 'POST' && action === 'change-pwd') {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) return err(res, 'Password minimal 8 karakter');
    await setConfig('admin_password_hash', hashPwd(newPassword, ADMIN_SALT));
    return ok(res, { success: true });
  }

  // GET/POST/DELETE changelog
  if (action === 'get-changelog') {
    const { data } = await sb.from('changelog').select('*').order('created_at', { ascending: false });
    return ok(res, data || []);
  }
  if (req.method === 'POST' && action === 'add-changelog') {
    const { title, version, description } = req.body || {};
    if (!title?.trim()) return err(res, 'Title wajib diisi');
    const { error } = await sb.from('changelog').insert({ id: 'cl_' + crypto.randomBytes(6).toString('hex'), title: title.trim(), version: (version || '').trim(), description: (description || '').trim(), author: 'admin', created_at: new Date().toISOString() });
    if (error) return err(res, error.message, 500);
    return ok(res, { success: true });
  }
  if (req.method === 'DELETE' && action === 'delete-changelog') {
    await sb.from('changelog').delete().eq('id', req.query.id);
    return ok(res, { success: true });
  }

  // GET/POST/DELETE reports
  if (action === 'get-reports') {
    let q = sb.from('reports').select('*').order('created_at', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data } = await q;
    return ok(res, data || []);
  }
  if (req.method === 'POST' && action === 'update-report') {
    const { id, status } = req.body || {};
    if (!id || !['open','resolved'].includes(status)) return err(res, 'Invalid params');
    await sb.from('reports').update({ status }).eq('id', id);
    return ok(res, { success: true });
  }
  if (req.method === 'DELETE' && action === 'delete-report') {
    await sb.from('reports').delete().eq('id', req.query.id);
    return ok(res, { success: true });
  }

  // DELETE user
  if (req.method === 'DELETE' && action === 'delete-user') {
    const userId = req.query.userId;
    if (!userId) return err(res, 'userId required');
    await sb.from('users').delete().eq('id', userId); // cascades meals
    return ok(res, { success: true });
  }

  // DELETE clear-meals
  if (req.method === 'DELETE' && action === 'clear-meals') {
    const userId = req.query.userId;
    if (!userId) return err(res, 'userId required');
    await sb.from('meals').delete().eq('user_id', userId);
    return ok(res, { success: true });
  }

  // GET maintenance config
  if (req.method === 'GET' && action === 'get-maintenance') {
    const raw = await getConfig('maintenance');
    const cfg = raw ? JSON.parse(raw) : { enabled: false, title: '', description: '', estimatedEnd: '' };
    return ok(res, cfg);
  }

  // POST set maintenance config
  if (req.method === 'POST' && action === 'set-maintenance') {
    const { enabled, title, description, estimatedEnd } = req.body || {};
    if (typeof enabled !== 'boolean') return err(res, 'enabled (boolean) wajib ada');
    const cfg = {
      enabled,
      title:       (title       || 'Sedang Dalam Pemeliharaan').trim(),
      description: (description || 'Aplikasi sedang dalam proses pemeliharaan. Silakan coba beberapa saat lagi.').trim(),
      estimatedEnd: (estimatedEnd || '').trim(),
    };
    await setConfig('maintenance', JSON.stringify(cfg));
    return ok(res, { success: true, maintenance: cfg });
  }

  return err(res, 'Not found', 404);
}
