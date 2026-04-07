// api/migrate.js — import data from old Netlify system
import crypto from 'crypto';
import { getSupabase, verifyAdminToken, hashPwd, cors, ok, err } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  try { verifyAdminToken(req.headers.authorization); }
  catch (e) { return err(res, e.message, 401); }

  const { action } = req.query;
  const sb = getSupabase();

  // ── IMPORT FROM JSON ─────────────────────────────────────────────────────
  if (action === 'import-json') {
    const { exportData } = req.body || {};
    if (!exportData) return err(res, 'exportData wajib ada');

    const results = { usersImported: 0, mealsImported: 0, reportsImported: 0, errors: [] };

    // Import users
    for (const u of exportData.users || []) {
      try {
        const { error } = await sb.from('users').upsert({
          id: u.id, username: u.username, password_hash: u.passwordHash || u.password_hash,
          created_at: u.createdAt || u.created_at || new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (!error) results.usersImported++;
        else results.errors.push(`User ${u.username}: ${error.message}`);
      } catch (e2) { results.errors.push(`User ${u.username}: ${e2.message}`); }
    }

    // Import meals
    for (const m of exportData.meals || []) {
      try {
        const n = m.nutrition || {};
        const { error } = await sb.from('meals').upsert({
          id: m.id, user_id: m.userId || m.user_id,
          timestamp: m.timestamp, dish_names: (n.dishes || []).map(d => d.name),
          total_calories: n.total_calories || 0, total_protein: n.total_protein_g || 0,
          total_carbs: n.total_carbs_g || 0, total_fat: n.total_fat_g || 0,
          total_fiber: n.total_fiber_g || 0, health_score: n.health_score || 0,
          image_data: m.imageData || m.image_data || '',
          nutrition: n, created_at: m.timestamp,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (!error) results.mealsImported++;
        else results.errors.push(`Meal ${m.id}: ${error.message}`);
      } catch (e2) { results.errors.push(`Meal ${m.id}: ${e2.message}`); }
    }

    // Import reports
    for (const r of exportData.reports || []) {
      try {
        await sb.from('reports').upsert({
          id: r.id, user_id: r.userId || r.user_id, username: r.username,
          message: r.message, status: r.status || 'open',
          created_at: r.timestamp || r.created_at || new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
        results.reportsImported++;
      } catch (e2) { results.errors.push(`Report ${r.id}: ${e2.message}`); }
    }

    return ok(res, { success: true, results });
  }

  // ── IMPORT FROM OLD NETLIFY SITE ─────────────────────────────────────────
  if (action === 'import-netlify') {
    const { netlifyUrl, adminPassword } = req.body || {};
    if (!netlifyUrl || !adminPassword) return err(res, 'netlifyUrl dan adminPassword wajib ada');

    const base = netlifyUrl.replace(/\/$/, '');

    // Get admin token from old site
    let oldToken;
    try {
      const loginRes = await fetch(`${base}/api/admin?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) return err(res, 'Login ke Netlify gagal: ' + (loginData.error || loginRes.status));
      oldToken = loginData.token;
    } catch (e2) { return err(res, 'Tidak bisa terhubung ke Netlify: ' + e2.message, 502); }

    // Fetch export from old site
    let exportData;
    try {
      const exportRes = await fetch(`${base}/api/admin?action=export-all`, {
        headers: { Authorization: 'Bearer ' + oldToken },
      });
      if (!exportRes.ok) {
        const t = await exportRes.text();
        return err(res, `Export dari Netlify gagal (${exportRes.status}). Pastikan Netlify sudah diupdate dengan patch migration. Detail: ${t.slice(0,200)}`);
      }
      exportData = await exportRes.json();
    } catch (e2) { return err(res, 'Gagal fetch export dari Netlify: ' + e2.message, 502); }

    // Re-use import-json logic
    req.query.action = 'import-json';
    req.body = { exportData };
    return handler(req, res);
  }

  return err(res, 'Unknown action');
}
