// api/_lib.js  — shared utilities (Supabase + JWT + helpers)
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Supabase ──────────────────────────────────────────────────────────────────
let _sb = null;
export function getSupabase() {
  if (!_sb) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required');
    }
    _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

// ── JWT ───────────────────────────────────────────────────────────────────────
const SECRET = process.env.JWT_SECRET || 'nutrilog-change-me-in-vercel-env';
const USER_TTL  = 24 * 60 * 60 * 1000;       // 1 day
const ADMIN_TTL =  4 * 60 * 60 * 1000;       // 4 hours

export function signToken(payload, ttlMs = USER_TTL) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

export function signAdminToken() { return signToken({ role: 'admin' }, ADMIN_TTL); }

export function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('No token');
  const [h, p, s] = authHeader.slice(7).split('.');
  if (!h || !p || !s) throw new Error('Malformed token');
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (s !== expected) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (payload.exp < Date.now()) throw new Error('Token expired — silakan login kembali');
  return payload;
}

export function verifyAdminToken(authHeader) {
  const p = verifyToken(authHeader);
  if (p.role !== 'admin') throw new Error('Admin access required');
  return p;
}

// ── Password hashing ──────────────────────────────────────────────────────────
export function hashPwd(pw, salt = 'nutrilog_user_2024') {
  return crypto.createHmac('sha256', salt).update(pw).digest('hex');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function ok(res, data, status = 200) { res.status(status).json(data); }
export function err(res, msg, status = 400) { res.status(status).json({ error: msg }); }

// ── Config helpers ────────────────────────────────────────────────────────────
export async function getConfig(key) {
  const sb = getSupabase();
  const { data } = await sb.from('config').select('value').eq('key', key).single();
  return data?.value ?? null;
}

export async function setConfig(key, value) {
  const sb = getSupabase();
  await sb.from('config').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ── Daily limit check ─────────────────────────────────────────────────────────
export const EXPIRY_DAYS = 60;
export const DEFAULT_LIMIT = 5;
