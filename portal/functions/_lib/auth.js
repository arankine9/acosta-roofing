// Who is calling. Cloudflare Access sits in front of the whole portal and
// forwards a signed JWT in the Cf-Access-Jwt-Assertion header; we verify it
// ourselves (RS256 against the team's published keys, audience, issuer,
// expiry) and then check the email against ALLOWED_EMAILS, so a
// misconfigured Access policy alone can't open the API.

import { HttpError } from "./http.js";

const LEEWAY = 60; // seconds of clock skew tolerated on exp/nbf
const KEYS_TTL = 60 * 60 * 1000; // refetch the signing keys hourly
const REFETCH_MIN = 60 * 1000; // ...or on an unknown kid, at most once a minute

const unauthorized = (message) => new HttpError(401, message, "unauthorized");

/* Lower-cased emails from a comma/space separated list. */
export const emailList = (value) =>
  String(value || "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const teamDomain = (value) =>
  String(value || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// team domain → { keys: Map(kid → CryptoKey), at: fetch time }
const keyCache = new Map();

async function signingKeys(team, { refresh = false } = {}) {
  const cached = keyCache.get(team);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && (refresh ? age < REFETCH_MIN : age < KEYS_TTL)) return cached.keys;

  let res;
  try {
    res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    if (cached) return cached.keys;
    throw new HttpError(502, "Couldn't load the Cloudflare Access signing keys. Check ACCESS_TEAM_DOMAIN.", "access_keys");
  }
  const { keys = [] } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      map.set(jwk.kid, key);
    } catch {}
  }
  keyCache.set(team, { keys: map, at: Date.now() });
  return map;
}

/* Verify a Cloudflare Access JWT; returns its claims or throws a 401. */
export async function verifyAccessJwt(token, { team, aud, now = Date.now() / 1000 }) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw unauthorized("Invalid Access token.");
  let header, claims;
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
  } catch {
    throw unauthorized("Invalid Access token.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw unauthorized("Invalid Access token.");

  let key = (await signingKeys(team)).get(header.kid);
  if (!key) key = (await signingKeys(team, { refresh: true })).get(header.kid);
  if (!key) throw unauthorized("Access token signed with an unknown key.");

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {}
  if (!valid) throw unauthorized("Access token signature is invalid.");

  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) throw unauthorized("Access token is for a different application.");
  if (claims.iss !== `https://${team}`) throw unauthorized("Access token has the wrong issuer.");
  if (typeof claims.exp !== "number" || claims.exp + LEEWAY < now) throw unauthorized("Access token has expired. Reload the page to sign in again.");
  if (typeof claims.nbf === "number" && claims.nbf - LEEWAY > now) throw unauthorized("Access token isn't valid yet.");
  return claims;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/* The signed-in, allowlisted email for this request, or throws 401/403. */
export async function authenticate(request, env) {
  const allowed = emailList(env.ALLOWED_EMAILS);
  let email;

  // Local development only: `wrangler pages dev` has no Access in front.
  if (env.DEV_AUTH_EMAIL && LOCAL_HOSTS.has(new URL(request.url).hostname)) {
    email = String(env.DEV_AUTH_EMAIL).trim().toLowerCase();
  } else {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) throw unauthorized("Not signed in.");
    const team = teamDomain(env.ACCESS_TEAM_DOMAIN);
    if (!team || !env.ACCESS_AUD) {
      throw new HttpError(500, "The portal isn't configured: ACCESS_TEAM_DOMAIN and ACCESS_AUD are required.", "config");
    }
    const claims = await verifyAccessJwt(token, { team, aud: String(env.ACCESS_AUD).trim() });
    if (typeof claims.email !== "string" || !claims.email) throw unauthorized("Access token has no email.");
    email = claims.email.trim().toLowerCase();
  }

  if (!allowed.includes(email)) throw new HttpError(403, `${email} isn't allowed to use the portal.`, "forbidden");
  return email;
}
