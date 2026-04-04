// api/report.mjs
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { verifyToken, json, preflight } from "../lib/utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let user;
  try { user = verifyToken(req.headers.get("authorization")); }
  catch (e) { return json({ error: "Unauthorized: " + e.message }, 401); }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const message = (body.message || "").trim();
  if (!message) return json({ error: "Pesan tidak boleh kosong" }, 400);
  if (message.length > 2000) return json({ error: "Pesan terlalu panjang (maks 2000 karakter)" }, 400);

  const store = getStore("nutrilog");
  const id = "r_" + crypto.randomBytes(8).toString("hex");
  const report = {
    id,
    userId: user.userId,
    username: user.username,
    message,
    timestamp: new Date().toISOString(),
    status: "open",
  };

  await store.set(`reports/${id}`, JSON.stringify(report));

  let index;
  try { index = (await store.get("reports/index", { type: "json" })) || []; }
  catch { index = []; }

  index.unshift({
    id, userId: user.userId, username: user.username,
    timestamp: report.timestamp, status: "open",
    preview: message.slice(0, 120),
  });

  await store.set("reports/index", JSON.stringify(index));
  return json({ success: true, id });
}
