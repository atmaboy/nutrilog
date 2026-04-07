// api/report.js
import crypto from 'crypto';
import { getSupabase, verifyToken, cors, ok, err } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let user;
  try { user = verifyToken(req.headers.authorization); }
  catch (e) { return err(res, e.message, 401); }

  const { message } = req.body || {};
  if (!message?.trim()) return err(res, 'Pesan tidak boleh kosong');
  if (message.length > 2000) return err(res, 'Pesan terlalu panjang (maks 2000 karakter)');

  const sb = getSupabase();
  const id = 'r_' + crypto.randomBytes(8).toString('hex');
  const { error } = await sb.from('reports').insert({
    id, user_id: user.userId, username: user.username,
    message: message.trim(), status: 'open', created_at: new Date().toISOString(),
  });
  if (error) return err(res, error.message, 500);
  return ok(res, { success: true, id }, 201);
}
