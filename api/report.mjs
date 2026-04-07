// api/report.mjs — Node.js style untuk Vercel
import { getStore } from "../lib/store.mjs";
import crypto from "crypto";
import { verifyToken, setCors } from "../lib/utils.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Auth
  let user;
  try {
    user = verifyToken(req.headers["authorization"]);
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized: " + e.message });
  }

  const { message } = req.body || {};
  const msg = (message || "").trim();

  if (!msg)
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  if (msg.length > 2000)
    return res.status(400).json({ error: "Pesan terlalu panjang (maks 2000 karakter)" });

  const store = getStore("nutrilog");
  const id    = "r_" + crypto.randomBytes(8).toString("hex");

  const report = {
    id,
    userId:    user.userId,
    username:  user.username,
    message:   msg,
    timestamp: new Date().toISOString(),
    status:    "open",
  };

  await store.set(`reports/${id}`, JSON.stringify(report));

  let index = [];
  try { index = (await store.get("reports/index", { type: "json" })) || []; } catch {}
  index.unshift({
    id,
    userId:    user.userId,
    username:  user.username,
    timestamp: report.timestamp,
    status:    "open",
    preview:   msg.slice(0, 120),
  });
  await store.set("reports/index", JSON.stringify(index));

  return res.status(200).json({ success: true, id });
}
