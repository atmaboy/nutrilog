// lib/utils.mjs — shared helpers untuk semua API
import crypto from "crypto";

export const SECRET =
  process.env.JWT_SECRET || "nutrilog-change-this-secret-in-vercel-env";

export const EXPIRY_DAYS = 60;
export const SESSION_TTL = 24 * 60 * 60 * 1000; // 1 day ms

export async function hashPwd(pw, salt = "nutrilog_user_2024") {
  return crypto.createHmac("sha256", salt).update(pw).digest("hex");
}

export function signToken(payload, ttlMs = SESSION_TTL) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const p = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlMs })
  ).toString("base64url");
  const s = crypto
    .createHmac("sha256", SECRET)
    .update(`${h}.${p}`)
    .digest("base64url");
  return `${h}.${p}.${s}`;
}

export function verifyToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("No token");

  const [h, p, s] = authHeader.slice(7).split(".");
  if (!h || !p || !s) throw new Error("Malformed token");

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${h}.${p}`)
    .digest("base64url");

  if (s !== expected) throw new Error("Invalid signature");

  const payload = JSON.parse(Buffer.from(p, "base64url").toString());

  if (payload.exp < Date.now()) {
    throw new Error("Token expired \u2014 silakan login kembali");
  }

  return payload;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

export function preflight() {
  return new Response("", { status: 200, headers: CORS });
}
