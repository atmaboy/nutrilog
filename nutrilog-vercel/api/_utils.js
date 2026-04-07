// api/_utils.js  –  Shared utilities (Web Crypto API + Supabase REST)
// Compatible with Node.js 18+ and Vercel Edge Runtime

// ── CORS ─────────────────────────────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export function preflight() {
  return new Response('', { status: 200, headers: CORS });
}

// ── Web Crypto helpers ────────────────────────────────────────────────────────
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

// ── Password hashing ──────────────────────────────────────────────────────────
export async function hashPwd(pw, salt = 'nutrilog_2024') {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── JWT ───────────────────────────────────────────────────────────────────────
const SESSION_TTL = 24 * 60 * 60 * 1000; // 1 day
const ADMIN_TTL   =  4 * 60 * 60 * 1000; // 4 hours

function getSecret() {
  return process.env.JWT_SECRET || 'nutrilog-change-this-in-env';
}

export async function signToken(payload, ttlMs = SESSION_TTL) {
  const h = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const p = btoa(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const s = await hmacSign(`${h}.${p}`, getSecret());
  return `${h}.${p}.${s}`;
}

export async function signAdminToken() {
  return signToken({ role: 'admin' }, ADMIN_TTL);
}

export async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('No token');
  const [h, p, s] = authHeader.slice(7).split('.');
  if (!h || !p || !s) throw new Error('Malformed token');
  const expected = await hmacSign(`${h}.${p}`, getSecret());
  if (s !== expected) throw new Error('Invalid signature');
  let payload;
  try { payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { throw new Error('Malformed payload'); }
  if (payload.exp < Date.now()) throw new Error('Token expired — silakan login kembali');
  return payload;
}

export async function verifyAdmin(authHeader) {
  const p = await verifyToken(authHeader);
  if (p.role !== 'admin') throw new Error('Not admin');
  return p;
}

// ── Supabase REST ─────────────────────────────────────────────────────────────
function sbUrl()  { return process.env.SUPABASE_URL; }
function sbKey()  { return process.env.SUPABASE_SERVICE_KEY; }

function sbHeaders(extra = {}) {
  return {
    apikey: sbKey(),
    Authorization: `Bearer ${sbKey()}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
}

function checkSb() {
  if (!sbUrl() || !sbKey()) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY tidak dikonfigurasi');
}

export async function dbSelect(table, qs = '') {
  checkSb();
  const r = await fetch(`${sbUrl()}/rest/v1/${table}${qs}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`DB select error: ${await r.text()}`);
  return r.json();
}

export async function dbInsert(table, data) {
  checkSb();
  const r = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`DB insert error: ${await r.text()}`);
  return r.json();
}

export async function dbUpsert(table, data) {
  checkSb();
  const r = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`DB upsert error: ${await r.text()}`);
  return r.json();
}

export async function dbUpdate(table, qs, data) {
  checkSb();
  const r = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`DB update error: ${await r.text()}`);
  return r.json();
}

export async function dbDelete(table, qs) {
  checkSb();
  const r = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, {
    method: 'DELETE', headers: sbHeaders({ Prefer: 'return=minimal' }),
  });
  if (!r.ok) throw new Error(`DB delete error: ${await r.text()}`);
  return true;
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
export function nanoid(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
}

export function todayUTC() {
  return new Date().toISOString().split('T')[0];
}
