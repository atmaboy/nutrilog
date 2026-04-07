// api/analyze.js
import { getSupabase, verifyToken, getConfig, cors, ok, err, DEFAULT_LIMIT } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let user;
  try { user = verifyToken(req.headers.authorization); }
  catch (e) { return err(res, e.message, 401); }

  const sb = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Daily limit check
  const limitStr = await getConfig('daily_limit');
  const dailyLimit = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT;

  const { data: usage } = await sb.from('usage_tracking').select('count').eq('user_id', user.userId).eq('usage_date', today).single();
  const todayCount = usage?.count || 0;

  if (todayCount >= dailyLimit) {
    return res.status(429).json({
      error: 'DAILY_LIMIT_REACHED',
      message: `Anda sudah mencapai limit analisa foto harian (${dailyLimit} foto/hari). Analisa kembali besok atau hubungi admin untuk penambahan kuota.`,
      limit: dailyLimit, used: todayCount,
    });
  }

  // Resolve API key
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { apiKey = await getConfig('api_key'); }
  if (!apiKey) return err(res, 'API Key belum dikonfigurasi. Hubungi admin.', 503);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();

    if (upstream.ok) {
      // Upsert usage
      await sb.from('usage_tracking').upsert({ user_id: user.userId, usage_date: today, count: todayCount + 1 }, { onConflict: 'user_id,usage_date' });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    return err(res, 'Gagal menghubungi Anthropic: ' + e.message, 502);
  }
}
