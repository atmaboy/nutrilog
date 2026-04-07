// api/status.js
// Public endpoint — no auth required.
// Returns maintenance mode config so the frontend can check before rendering.
import { getConfig, cors, ok, err } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const raw = await getConfig('maintenance');
    const cfg = raw ? JSON.parse(raw) : null;

    return ok(res, {
      maintenance: cfg?.enabled === true,
      title:       cfg?.title       || 'Sedang Dalam Pemeliharaan',
      description: cfg?.description || 'Aplikasi sedang dalam proses pemeliharaan. Silakan coba beberapa saat lagi.',
      estimatedEnd: cfg?.estimatedEnd || '',
    });
  } catch (e) {
    // If DB is unreachable, don't block the user — default to NOT in maintenance
    return ok(res, { maintenance: false, title: '', description: '', estimatedEnd: '' });
  }
}
