// api/auth.mjs — Node.js style untuk Vercel
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { hashPwd, signToken, setCors } from "../lib/utils.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { action, username, password } = req.body || {};

  if (!action || !username || !password)
    return res.status(400).json({ error: "Field tidak boleh kosong" });

  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean))
    return res.status(400).json({ error: "Username: 3\u201330 karakter, hanya huruf kecil, angka, underscore" });

  const store = getStore("nutrilog");

  // ── REGISTER ────────────────────────────────────────────────────────────
  if (action === "register") {
    if (password.length < 6)
      return res.status(400).json({ error: "Password minimal 6 karakter" });

    let userIndex = [];
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch {}

    if (userIndex.find((u) => u.username === clean))
      return res.status(409).json({ error: "Username sudah digunakan" });

    const passwordHash = await hashPwd(password);
    const user = {
      id: "u_" + crypto.randomBytes(10).toString("hex"),
      username: clean,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    await store.set(`users/${user.id}`, JSON.stringify(user));
    userIndex.push({ id: user.id, username: user.username, createdAt: user.createdAt });
    await store.set("users/index", JSON.stringify(userIndex));

    const token = signToken({ userId: user.id, username: user.username });
    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
    });
  }

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (action === "login") {
    let userIndex = [];
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; } catch {}

    const meta = userIndex.find((u) => u.username === clean);
    if (!meta)
      return res.status(401).json({ error: "Username atau password salah" });

    let userDetail = null;
    try { userDetail = await store.get(`users/${meta.id}`, { type: "json" }); } catch {}

    const hash = await hashPwd(password);
    if (!userDetail || userDetail.passwordHash !== hash)
      return res.status(401).json({ error: "Username atau password salah" });

    const token = signToken({ userId: userDetail.id, username: userDetail.username });
    return res.status(200).json({
      token,
      user: { id: userDetail.id, username: userDetail.username, createdAt: userDetail.createdAt },
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
