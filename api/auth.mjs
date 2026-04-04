// api/auth.mjs
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { hashPwd, signToken, json, preflight } from "../lib/utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { action, username, password } = body;
  if (!action || !username || !password) return json({ error: "Field tidak boleh kosong" }, 400);

  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean))
    return json({ error: "Username: 3\u201330 karakter, hanya huruf kecil, angka, underscore" }, 400);

  const store = getStore("nutrilog");

  // REGISTER
  if (action === "register") {
    if (password.length < 6) return json({ error: "Password minimal 6 karakter" }, 400);

    let userIndex;
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; }
    catch { userIndex = []; }

    if (userIndex.find(u => u.username === clean))
      return json({ error: "Username sudah digunakan" }, 409);

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
    return json({ token, user: { id: user.id, username: user.username, createdAt: user.createdAt } });
  }

  // LOGIN
  if (action === "login") {
    let userIndex;
    try { userIndex = (await store.get("users/index", { type: "json" })) || []; }
    catch { userIndex = []; }

    const meta = userIndex.find(u => u.username === clean);
    if (!meta) return json({ error: "Username atau password salah" }, 401);

    let userDetail;
    try { userDetail = await store.get(`users/${meta.id}`, { type: "json" }); }
    catch { return json({ error: "Username atau password salah" }, 401); }

    const hash = await hashPwd(password);
    if (!userDetail || userDetail.passwordHash !== hash)
      return json({ error: "Username atau password salah" }, 401);

    const token = signToken({ userId: userDetail.id, username: userDetail.username });
    return json({ token, user: { id: userDetail.id, username: userDetail.username, createdAt: userDetail.createdAt } });
  }

  return json({ error: "Unknown action" }, 400);
}
