// api/auth.js
import crypto from 'crypto';
import { getSupabase, signToken, hashPwd, cors, ok, err } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { action, username, password } = req.body || {};
  if (!action || !username || !password) return err(res, 'Field tidak boleh kosong');

  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean))
    return err(res, 'Username: 3-30 karakter, huruf kecil, angka, underscore');

  const sb = getSupabase();

  if (action === 'register') {
    if (password.length < 6) return err(res, 'Password minimal 6 karakter');
    const { data: existing } = await sb.from('users').select('id').eq('username', clean).single();
    if (existing) return err(res, 'Username sudah digunakan', 409);
    const id = 'u_' + crypto.randomBytes(10).toString('hex');
    const { error } = await sb.from('users').insert({ id, username: clean, password_hash: hashPwd(password), created_at: new Date().toISOString() });
    if (error) return err(res, 'Gagal membuat akun: ' + error.message, 500);
    const token = signToken({ userId: id, username: clean });
    return ok(res, { token, user: { id, username: clean, createdAt: new Date().toISOString() } });
  }

  if (action === 'login') {
    const { data: user } = await sb.from('users').select('id,username,password_hash,created_at').eq('username', clean).single();
    if (!user || user.password_hash !== hashPwd(password)) return err(res, 'Username atau password salah', 401);
    const token = signToken({ userId: user.id, username: user.username });
    return ok(res, { token, user: { id: user.id, username: user.username, createdAt: user.created_at } });
  }

  return err(res, 'Unknown action');
}
