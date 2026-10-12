// Local demo auth stub — mimics Supabase GoTrue + PostgREST enough for the
// Chronicle login/onboarding/settings flow. Demo only; not app code.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const PORT = 4010;
const SECRET = "chronicle-demo-stub-secret";
const DEMO_SUB = "3f1c9a7e-5b2d-4c8a-9f1e-7a6d5c4b3a21";
const EXPIRES_IN = 86400; // 24h — keeps auto-refresh out of the demo

const DEMO_USER = {
  id: DEMO_SUB,
  aud: "authenticated",
  role: "authenticated",
  email: "demo.reader@gmail.com",
  email_confirmed_at: new Date().toISOString(),
  phone: "",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: {
    full_name: "Demo Reader",
    name: "Demo Reader",
    email: "demo.reader@gmail.com",
    avatar_url: "",
  },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anon: false,
};

// ---- in-memory "database", persisted so a stub restart keeps demo data ----
const STATE_FILE = new URL(".demo-stub-state.json", import.meta.url);
const profiles = new Map(); // id -> row  (signup trigger simulated at token exchange)
const interests = []; // { id, user_id, topic }
const codes = new Map(); // code -> { redirectTo, challenge }
const refreshTokens = new Map(); // refresh_token -> sub
let rowId = 0;
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  for (const row of saved.profiles || []) profiles.set(row.id, row);
  interests.push(...(saved.interests || []));
  rowId = saved.rowId || interests.length;
} catch {
  /* first run */
}
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ profiles: [...profiles.values()], interests, rowId }),
  );
}

// ---- JWT helpers (HS256 — auth-js falls back to GET /user for HS*) ----
const b64 = (buf) => Buffer.from(buf).toString("base64url");
function signJwt(payload) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
function issueSession(sub) {
  const user = { ...DEMO_USER, id: sub };
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    user_metadata: user.user_metadata,
    session_id: crypto.randomUUID(),
    iat: now,
    exp: now + EXPIRES_IN,
    iss: "http://localhost:4010/auth/v1",
  });
  const refresh_token = "rt_" + crypto.randomBytes(24).toString("base64url");
  refreshTokens.set(refresh_token, sub);
  if (!profiles.has(sub)) {
    profiles.set(sub, { id: sub, onboarded: false }); // signup trigger
    saveState();
  }
  return { access_token, token_type: "bearer", expires_in: EXPIRES_IN, refresh_token, user };
}
function userFor(sub) {
  return { ...DEMO_USER, id: sub };
}

// ---- tiny PostgREST emulation ----
function parseQuery(search) {
  const filters = [];
  let select = "*";
  let order = null;
  for (const [key, value] of search) {
    if (key === "select") select = value;
    else if (key === "order") order = value;
    else if (value.startsWith("eq.")) filters.push([key, value.slice(3)]);
    else if (key === "on_conflict" || key === "resolution") { /* upsert hints */ }
  }
  return { select, filters, order };
}
function project(row, select) {
  if (!select || select === "*") return row;
  const out = {};
  for (const col of select.split(",")) {
    const c = col.trim();
    if (c in row) out[c] = row[c];
  }
  return out;
}
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
function sendEmpty(res, status) {
  res.writeHead(status, { "Access-Control-Allow-Origin": "*" });
  res.end();
}
function restError(res, status, code, message, details = "") {
  sendJson(res, status, { code, message, details, hint: null });
}

const CHOOSER = (redirect, challenge, scopes) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Choose an account</title>
<style>
  body{font-family:Roboto,Arial,sans-serif;background:#f8f9fa;display:flex;justify-content:center;padding-top:8vh;margin:0}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:28px;padding:32px;width:380px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  h1{font-size:22px;font-weight:400;color:#202124;margin:0 0 4px}
  p{font-size:14px;color:#5f6368;margin:0 0 20px}
  .acct{display:flex;align-items:center;gap:14px;padding:10px 8px;border-radius:24px;cursor:pointer;border:none;background:none;width:100%;text-align:left;font:inherit}
  .acct:hover{background:#f1f3f4}
  .av{width:36px;height:36px;border-radius:50%;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px}
  .nm{font-size:14px;color:#202124}.em{font-size:12px;color:#5f6368}
  .note{font-size:11px;color:#9aa0a6;margin-top:18px;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<div class="card">
  <h1>Choose an account</h1>
  <p>to continue to <b>Chronicle</b></p>
  <a class="acct" href="/auth/v1/approve?redirect_to=${encodeURIComponent(redirect)}&code_challenge=${encodeURIComponent(challenge || "")}&scopes=${encodeURIComponent(scopes || "")}">
    <span class="av">D</span>
    <span><span class="nm">Demo Reader</span><br><span class="em">demo.reader@gmail.com</span></span>
  </a>
  <div class="note">Local demo account — this is not real Google. No network traffic leaves your machine.</div>
</div></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const auth = req.headers.authorization || "";
  console.log(`[stub] ${req.method} ${path}${url.search ? url.search : ""}`);

  // CORS preflight (browser calls: sign-out, etc.)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return sendEmpty(res, 204);

  // ---- OAuth authorize: show the demo account chooser ----
  if (req.method === "GET" && path === "/auth/v1/authorize") {
    const redirect = url.searchParams.get("redirect_to") || "http://localhost:3000/auth/callback";
    const challenge = url.searchParams.get("code_challenge") || "";
    const scopes = url.searchParams.get("scopes") || "";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(CHOOSER(redirect, challenge, scopes));
  }
  if (req.method === "GET" && path === "/auth/v1/approve") {
    const redirect = url.searchParams.get("redirect_to");
    const challenge = url.searchParams.get("code_challenge") || "";
    const code = "code_" + crypto.randomBytes(18).toString("base64url");
    codes.set(code, { redirectTo: redirect, challenge });
    const sep = redirect.includes("?") ? "&" : "?";
    res.writeHead(302, { Location: `${redirect}${sep}code=${code}` });
    return res.end();
  }

  // ---- Token endpoint (PKCE exchange + refresh) ----
  if (req.method === "POST" && path === "/auth/v1/token") {
    const grant = url.searchParams.get("grant_type");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch { /* ignore */ }
      if (grant === "pkce") {
        const entry = codes.get(data.auth_code);
        if (!entry) return restError(res, 400, "invalid_grant", "Invalid authentication code");
        codes.delete(data.auth_code); // single use
        if (entry.challenge && data.code_verifier) {
          const derived = crypto.createHash("sha256").update(data.code_verifier).digest("base64url");
          if (derived !== entry.challenge) console.log("[stub] WARN PKCE mismatch (allowed for demo)");
        }
        return sendJson(res, 200, issueSession(DEMO_SUB));
      }
      if (grant === "refresh_token") {
        const sub = refreshTokens.get(data.refresh_token);
        if (!sub) return restError(res, 400, "invalid_grant", "Invalid refresh token");
        refreshTokens.delete(data.refresh_token);
        return sendJson(res, 200, issueSession(sub));
      }
      return restError(res, 400, "unsupported_grant_type", `Unsupported grant: ${grant}`);
    });
    return;
  }

  // ---- Who am I (getClaims falls back to GET /user for HS256) ----
  if (req.method === "GET" && path === "/auth/v1/user") {
    const token = auth.replace(/^Bearer\s+/i, "");
    const claims = verifyJwt(token);
    if (!claims) return restError(res, 401, "bad_jwt", "invalid JWT");
    return sendJson(res, 200, userFor(claims.sub));
  }
  if (req.method === "POST" && path === "/auth/v1/logout") {
    const token = auth.replace(/^Bearer\s+/i, "");
    const claims = verifyJwt(token);
    if (claims) for (const [rt, sub] of refreshTokens) if (sub === claims.sub) refreshTokens.delete(rt);
    return sendEmpty(res, 204);
  }

  // ---- PostgREST ----
  if (path.startsWith("/rest/v1/")) {
    const table = path.slice("/rest/v1/".length).split("?")[0];
    const token = auth.replace(/^Bearer\s+/i, "");
    const claims = verifyJwt(token);
    if (!claims) return restError(res, 401, "bad_jwt", "JWT required");
    const sub = claims.sub; // simulated RLS: rows scoped to the caller
    const { select, filters, order } = parseQuery(url.searchParams);

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const prefer = String(req.headers.prefer || "");
      const wantRows = prefer.includes("return=representation");
      const wantsObject = String(req.headers.accept || "").includes("vnd.pgrst.object");

      const rowsOf = () => {
        if (table === "profiles") {
          const row = profiles.get(sub);
          return row ? [row] : [];
        }
        if (table === "interests") {
          return interests
            .filter((r) => r.user_id === sub) // RLS
            .filter((r) => filters.every(([k, v]) => String(r[k]) === v))
            .sort((a, b) => (order && order.includes("desc") ? b.topic.localeCompare(a.topic) : a.topic.localeCompare(b.topic)));
        }
        return [];
      };

      if (req.method === "GET") {
        let rows = rowsOf().filter((r) => filters.every(([k, v]) => String(r[k]) === v));
        rows = rows.map((r) => project(r, select));
        if (wantsObject) {
          if (rows.length === 1) return sendJson(res, 200, rows[0]);
          return restError(res, 406, "PGRST116", "JSON object requested, multiple (or no) rows returned", "Results contain 0 rows");
        }
        return sendJson(res, 200, rows);
      }

      if (req.method === "DELETE") {
        let removed = [];
        if (table === "interests") {
          for (let i = interests.length - 1; i >= 0; i--) {
            if (interests[i].user_id === sub && filters.every(([k, v]) => String(interests[i][k]) === v)) {
              removed.push(interests.splice(i, 1)[0]);
            }
          }
          if (removed.length) saveState();
        }
        return wantRows ? sendJson(res, 200, removed) : sendEmpty(res, 204);
      }

      if (req.method === "POST") {
        let payload;
        try { payload = JSON.parse(body || "null"); } catch { return restError(res, 400, "PGRST202", "invalid JSON body"); }
        const rowsIn = Array.isArray(payload) ? payload : [payload];
        const isUpsert = prefer.includes("resolution=merge-duplicates") || url.searchParams.has("on_conflict");

        if (table === "interests") {
          const inserted = [];
          for (const row of rowsIn) {
            const clean = { id: ++rowId, user_id: sub, topic: String(row.topic) };
            interests.push(clean);
            inserted.push(clean);
          }
          saveState();
          return wantRows ? sendJson(res, 201, inserted) : sendEmpty(res, 201);
        }
        if (table === "profiles") {
          const updated = [];
          for (const row of rowsIn) {
            const existing = profiles.get(sub) || { id: sub, onboarded: false };
            const next = isUpsert
              ? { ...existing, ...row, id: sub }
              : { ...row, id: sub };
            profiles.set(sub, next);
            updated.push(next);
          }
          saveState();
          return wantRows ? sendJson(res, 201, updated) : sendEmpty(res, 201);
        }
        return restError(res, 404, "PGRST205", `table not found: ${table}`);
      }

      return restError(res, 405, "PGRST105", "Method not allowed");
    });
    return;
  }

  // ---- status/debug for the test harness ----
  if (path === "/demo/state") {
    return sendJson(res, 200, {
      profiles: [...profiles.values()],
      interests,
      liveCodes: codes.size,
    });
  }

  sendJson(res, 404, { error: "not_found", path });
});

server.listen(PORT, () => console.log(`[stub] demo auth+PostgREST on http://localhost:${PORT}`));
