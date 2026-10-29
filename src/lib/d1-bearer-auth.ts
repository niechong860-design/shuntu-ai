import {
  derivePasswordHash,
  hashPassword,
  normalizeEmail,
  verifyPassword,
  type D1Database,
} from "./auth-password.ts";

export type AuthEnvironment = {
  DB?: D1Database;
  AUTH_SESSION_SIGNING_KEY?: string;
  DATABASE_PRIMARY?: string;
};
type Identity = {
  user_id: string;
  email: string;
  password_hash: string;
  disabled_at: string | null;
  email_verified_at: string | null;
  created_at: string;
};
type Claims = {
  sub: string;
  sid: string;
  email: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};
const issuer = "urn:shuntu:d1-auth";
const encoder = new TextEncoder();
export const accessSeconds = 900;
const refreshSeconds = 30 * 86400;
export function authEnvironment(): AuthEnvironment {
  const globals = globalThis as Record<string, unknown>;
  return (globals.__SHUNTU_CLOUDFLARE_ENV__ ?? globals.__env__ ?? {}) as AuthEnvironment;
}
export function authDatabase(): D1Database {
  const db = authEnvironment().DB;
  if (!db || authEnvironment().DATABASE_PRIMARY !== "d1") throw new Error("AUTH_UNAVAILABLE");
  return db;
}
function base64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error("INVALID_CREDENTIALS");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (x) =>
    x.charCodeAt(0),
  );
}
function random() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function key() {
  const secret = authEnvironment().AUTH_SESSION_SIGNING_KEY;
  if (!secret || encoder.encode(secret).length < 32) throw new Error("AUTH_UNAVAILABLE");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function rolesFor(userId: string) {
  const rows = await authDatabase()
    .prepare("SELECT role FROM user_roles WHERE user_id=?")
    .bind(userId)
    .all<{ role: string }>();
  return (rows.results ?? []).map((r) => r.role);
}
export async function requireRole(userId: string, roles: readonly string[]) {
  if (!(await rolesFor(userId)).some((role) => roles.includes(role))) throw new Error("FORBIDDEN");
}
export async function readAuthUser(userId: string) {
  const user = await authDatabase()
    .prepare(
      "SELECT p.id,COALESCE(NULLIF(trim(p.email),''),i.provider_user_id) AS email,COALESCE(c.disabled_at,x.disabled_at) AS disabled_at FROM profiles p LEFT JOIN auth_credentials c ON c.user_id=p.id LEFT JOIN auth_user_controls x ON x.user_id=p.id LEFT JOIN auth_identities i ON i.user_id=p.id AND i.provider='legacy_email' WHERE p.id=?",
    )
    .bind(userId)
    .first<{ id: string; email: string | null; disabled_at: string | null }>();
  return {
    data: {
      user: user
        ? {
            id: user.id,
            email: user.email,
            banned_until: user.disabled_at ? "2999-01-01T00:00:00Z" : null,
          }
        : null,
    },
    error: null,
  };
}
export async function readAuthUsers(options: { page: number; perPage: number }) {
  const rows = await authDatabase()
    .prepare(
      "SELECT p.id,COALESCE(c.disabled_at,x.disabled_at) AS disabled_at FROM profiles p LEFT JOIN auth_credentials c ON c.user_id=p.id LEFT JOIN auth_user_controls x ON x.user_id=p.id ORDER BY p.id LIMIT ? OFFSET ?",
    )
    .bind(options.perPage, (options.page - 1) * options.perPage)
    .all<{ id: string; disabled_at: string | null }>();
  return {
    data: {
      users: (rows.results ?? []).map((u) => ({
        id: u.id,
        banned_until: u.disabled_at ? "2999-01-01T00:00:00Z" : null,
      })),
    },
    error: null,
  };
}
export async function setUserDisabled(userId: string, disabled: boolean) {
  const now = new Date().toISOString();
  await authDatabase().batch([
    authDatabase()
      .prepare(
        "INSERT INTO auth_user_controls(user_id,disabled_at,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET disabled_at=excluded.disabled_at,updated_at=excluded.updated_at",
      )
      .bind(userId, disabled ? now : null, now),
    authDatabase()
      .prepare("UPDATE auth_credentials SET disabled_at=?,updated_at=? WHERE user_id=?")
      .bind(disabled ? now : null, now, userId),
    authDatabase()
      .prepare(
        "UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND ?=1",
      )
      .bind(now, userId, disabled ? 1 : 0),
  ]);
}
export async function replacePassword(userId: string, password: string, keepSid?: string) {
  const encoded = await hashPassword(password),
    now = new Date().toISOString();
  await authDatabase().batch([
    authDatabase()
      .prepare(
        "UPDATE auth_credentials SET password_hash=?,updated_at=? WHERE user_id=? AND disabled_at IS NULL",
      )
      .bind(encoded, now, userId),
    authDatabase()
      .prepare(
        "UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND token_hash<>?",
      )
      .bind(now, userId, keepSid ? await digest(keepSid) : ""),
  ]);
}
export async function listAdminIdentities() {
  return (
    (
      await authDatabase()
        .prepare(
          "SELECT r.user_id,r.role,r.created_at,COALESCE(NULLIF(trim(p.email),''),i.provider_user_id) AS email,p.display_name FROM user_roles r JOIN profiles p ON p.id=r.user_id LEFT JOIN auth_identities i ON i.user_id=r.user_id AND i.provider='legacy_email' WHERE r.role IN ('admin','founder')",
        )
        .all<{
          user_id: string;
          role: string;
          created_at: string;
          email: string | null;
          display_name: string | null;
        }>()
    ).results ?? []
  );
}
export async function addAdminIdentity(emailInput: string) {
  const email = normalizeEmail(emailInput),
    user = await identity(email);
  if (!user || user.disabled_at) throw new Error("INVALID_IDENTITY");
  await authDatabase()
    .prepare(
      "INSERT INTO user_roles(id,user_id,role) VALUES(?,?,'admin') ON CONFLICT(user_id,role) DO NOTHING",
    )
    .bind(crypto.randomUUID(), user.user_id)
    .run();
  return { ok: true, email: user.email };
}
export async function removeAdminIdentity(userId: string) {
  await authDatabase()
    .prepare("DELETE FROM user_roles WHERE user_id=? AND role='admin'")
    .bind(userId)
    .run();
  return { ok: true };
}
async function identity(email: string): Promise<Identity | null> {
  const rows = await authDatabase()
    .prepare(
      "SELECT DISTINCT c.user_id,c.password_hash,c.email_verified_at,c.created_at,COALESCE(c.disabled_at,x.disabled_at) AS disabled_at,COALESCE(NULLIF(trim(p.email),''),i.provider_user_id) AS email FROM auth_credentials c JOIN profiles p ON p.id=c.user_id LEFT JOIN auth_user_controls x ON x.user_id=c.user_id LEFT JOIN auth_identities i ON i.user_id=c.user_id AND i.provider='legacy_email' WHERE lower(trim(p.email))=? OR i.provider_user_id=? LIMIT 2",
    )
    .bind(email, email)
    .all<Identity>();
  const row = rows.results?.length === 1 ? rows.results[0] : null;
  // A profile address and source identity must never silently disagree.
  return row && row.email?.trim().toLowerCase() === email ? row : null;
}
async function limit(bucket: string, maximum: number) {
  const window = Math.floor(Date.now() / 900000);
  const row = await authDatabase()
    .prepare(
      "INSERT INTO auth_rate_limits(bucket,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_started_at=excluded.window_started_at THEN attempts+1 ELSE 1 END,window_started_at=excluded.window_started_at RETURNING attempts",
    )
    .bind(await digest(bucket), window)
    .first<{ attempts: number }>();
  if (!row || row.attempts > maximum) throw new Error("RATE_LIMITED");
}
export function publicUser(user: {
  user_id: string;
  email: string;
  email_verified_at?: string | null;
  created_at?: string;
}) {
  return {
    id: user.user_id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.email_verified_at ?? null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: user.created_at ?? null,
  };
}
async function sign(claims: Claims) {
  const header = base64(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64(encoder.encode(JSON.stringify(claims)));
  const text = header + "." + payload;
  return (
    text +
    "." +
    base64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(text))))
  );
}
async function responseSession(
  user: { user_id: string; email: string; email_verified_at?: string | null; created_at?: string },
  sid: string,
  refresh: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({
    sub: user.user_id,
    sid,
    email: user.email,
    iss: issuer,
    aud: "authenticated",
    iat: now,
    exp: now + accessSeconds,
  });
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: accessSeconds,
    expires_at: now + accessSeconds,
    refresh_token: refresh,
    user: publicUser(user),
  };
}
async function createSession(user: Identity) {
  const sid = random(),
    refresh = random();
  // Verify signing configuration before any session is persisted.
  const result = await responseSession(user, sid, refresh);
  await authDatabase()
    .prepare("INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)")
    .bind(
      await digest(sid),
      user.user_id,
      await digest(refresh),
      new Date(Date.now() + refreshSeconds * 1000).toISOString(),
    )
    .run();
  return result;
}
export async function registerAccount(emailInput: unknown, password: unknown, ip: string) {
  const email = normalizeEmail(emailInput);
  if (typeof password !== "string") throw new Error("INVALID_CREDENTIALS");
  await key();
  const db = authDatabase();
  // Unmigrated profiles can have no email. Do not let registration claim an
  // address until all existing UUIDs have credentials and authoritative identities.
  const pending = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM profiles p LEFT JOIN auth_credentials c ON c.user_id=p.id LEFT JOIN auth_identities i ON i.user_id=p.id AND i.provider='legacy_email' WHERE c.user_id IS NULL OR i.user_id IS NULL",
    )
    .first<{ n: number }>();
  if (!pending || pending.n !== 0) throw new Error("REGISTRATION_NOT_READY");
  await limit("signup:ip:" + ip, 5);
  const encoded = await hashPassword(password);
  const userId = crypto.randomUUID();
  // Same default as 0001 (20 centi-credits / 0.2 credits). No existing wallet,
  // profile or role is updated, and caller-supplied UUID/role metadata is ignored.
  await db.batch([
    db
      .prepare(
        "INSERT INTO profiles(id,email) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM profiles WHERE lower(trim(email))=?) AND NOT EXISTS(SELECT 1 FROM auth_identities WHERE provider='legacy_email' AND provider_user_id=?)",
      )
      .bind(userId, email, email, email),
    db
      .prepare("INSERT INTO auth_credentials(user_id,password_hash) VALUES(?,?)")
      .bind(userId, encoded),
    db
      .prepare(
        "INSERT INTO auth_identities(id,user_id,provider,provider_user_id) VALUES(?,?,'legacy_email',?)",
      )
      .bind("legacy-email:" + userId, userId, email),
  ]);
  // Email verification is not required by the existing account policy. Do not
  // fabricate verified_at or a session: the current frontend signs in afterward.
  return {
    user: publicUser({ user_id: userId, email, created_at: new Date().toISOString() }),
  };
}
export async function login(emailInput: unknown, password: unknown, ip: string) {
  let email: string;
  try {
    email = normalizeEmail(emailInput);
  } catch {
    throw new Error("INVALID_CREDENTIALS");
  }
  if (typeof password !== "string" || password.length > 256) throw new Error("INVALID_CREDENTIALS");
  await key();
  await limit("login:ip:" + ip, 30);
  await limit("login:email:" + email, 8);
  const user = await identity(email);
  const valid = await verifyPassword(
    password,
    user?.password_hash ??
      "pbkdf2-sha256$310000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000",
  );
  if (!user || !valid || user.disabled_at) throw new Error("INVALID_CREDENTIALS");
  if (/^\$2[aby]\$/.test(user.password_hash)) {
    const upgraded = await derivePasswordHash(password);
    const result = (await authDatabase()
      .prepare(
        "UPDATE auth_credentials SET password_hash=?,updated_at=? WHERE user_id=? AND password_hash=? AND disabled_at IS NULL",
      )
      .bind(upgraded, new Date().toISOString(), user.user_id, user.password_hash)
      .run()) as { meta?: { changes?: number } };
    if (result.meta?.changes !== 1) {
      const current = await identity(email);
      if (
        !current ||
        current.disabled_at ||
        !(await verifyPassword(password, current.password_hash))
      )
        throw new Error("INVALID_CREDENTIALS");
    }
  }
  return createSession(user);
}
export async function authenticateBearer(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token || token.length > 4096) throw new Error("INVALID_CREDENTIALS");
  try {
    const [header, payload, signature, ...extra] = token.split(".");
    if (extra.length || !signature) throw new Error();
    const h = JSON.parse(new TextDecoder().decode(decode(header)));
    if (h.alg !== "HS256" || h.typ !== "JWT") throw new Error();
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(),
        decode(signature),
        encoder.encode(header + "." + payload),
      ))
    )
      throw new Error();
    const c = JSON.parse(new TextDecoder().decode(decode(payload))) as Claims;
    const now = Math.floor(Date.now() / 1000);
    if (
      c.iss !== issuer ||
      c.aud !== "authenticated" ||
      typeof c.sub !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(c.sub) ||
      typeof c.sid !== "string" ||
      !Number.isInteger(c.exp) ||
      !Number.isInteger(c.iat) ||
      c.exp <= now ||
      c.iat > now + 30 ||
      c.exp - c.iat > accessSeconds
    )
      throw new Error();
    const row = await authDatabase()
      .prepare(
        "SELECT s.user_id,COALESCE(NULLIF(trim(p.email),''),i.provider_user_id) AS email,c.email_verified_at,c.created_at FROM auth_sessions s JOIN profiles p ON p.id=s.user_id JOIN auth_credentials c ON c.user_id=s.user_id LEFT JOIN auth_user_controls x ON x.user_id=s.user_id LEFT JOIN auth_identities i ON i.user_id=s.user_id AND i.provider='legacy_email' WHERE s.token_hash=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND c.disabled_at IS NULL AND x.disabled_at IS NULL",
      )
      .bind(await digest(c.sid), c.sub, new Date().toISOString())
      .first<{ user_id: string; email: string; email_verified_at: string | null }>();
    if (!row || !row.email || row.email.toLowerCase() !== c.email) throw new Error();
    return { userId: row.user_id, claims: c, user: publicUser(row) };
  } catch {
    throw new Error("INVALID_CREDENTIALS");
  }
}
export async function refreshSession(refresh: unknown) {
  if (typeof refresh !== "string" || !/^[\w-]{43}$/.test(refresh))
    throw new Error("INVALID_CREDENTIALS");
  await key();
  const sid = random(),
    next = random(),
    now = new Date().toISOString();
  const row = await authDatabase()
    .prepare(
      "UPDATE auth_sessions SET token_hash=?,csrf_hash=?,expires_at=? WHERE csrf_hash=? AND revoked_at IS NULL AND expires_at>? AND user_id IN (SELECT c.user_id FROM auth_credentials c JOIN profiles p ON p.id=c.user_id LEFT JOIN auth_user_controls x ON x.user_id=c.user_id WHERE c.disabled_at IS NULL AND x.disabled_at IS NULL) RETURNING user_id",
    )
    .bind(
      await digest(sid),
      await digest(next),
      new Date(Date.now() + refreshSeconds * 1000).toISOString(),
      await digest(refresh),
      now,
    )
    .first<{ user_id: string }>();
  if (!row) throw new Error("INVALID_CREDENTIALS");
  const user = await authDatabase()
    .prepare(
      "SELECT c.user_id,COALESCE(NULLIF(trim(p.email),''),i.provider_user_id) AS email,c.email_verified_at,c.created_at FROM auth_credentials c JOIN profiles p ON p.id=c.user_id LEFT JOIN auth_identities i ON i.user_id=c.user_id AND i.provider='legacy_email' WHERE c.user_id=?",
    )
    .bind(row.user_id)
    .first<Identity>();
  if (!user?.email) throw new Error("INVALID_CREDENTIALS");
  return responseSession(user, sid, next);
}
export async function logout(request: Request, scope: string) {
  const auth = await authenticateBearer(request),
    now = new Date().toISOString();
  if (scope === "local")
    await authDatabase()
      .prepare("UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?")
      .bind(now, await digest(auth.claims.sid))
      .run();
  else if (scope === "others")
    await authDatabase()
      .prepare(
        "UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL",
      )
      .bind(now, auth.userId, await digest(auth.claims.sid))
      .run();
  else if (scope === "global")
    await authDatabase()
      .prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL")
      .bind(now, auth.userId)
      .run();
  else throw new Error("INVALID_REQUEST");
}
export async function handleBearerAuth(request: Request) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  const url = new URL(request.url),
    action = url.pathname.replace(/^\/api\/auth\//, "");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    return json({ error: "invalid_request", message: "Authentication failed" }, 403);
  try {
    if (action === "signup" && request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > 8192)
        return json({ error: "invalid_request" }, 413);
      const text = await request.text();
      if (encoder.encode(text).length > 8192) return json({ error: "invalid_request" }, 413);
      const payload = JSON.parse(text) as Record<string, unknown>;
      return json(
        await registerAccount(
          payload.email,
          payload.password,
          request.headers.get("cf-connecting-ip") ?? "local",
        ),
      );
    }
    if (action === "token" && request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > 8192)
        return json({ error: "invalid_request" }, 413);
      const text = await request.text();
      if (encoder.encode(text).length > 8192) return json({ error: "invalid_request" }, 413);
      const payload = JSON.parse(text) as Record<string, unknown>;
      if (url.searchParams.get("grant_type") === "password")
        return json(
          await login(
            payload.email,
            payload.password,
            request.headers.get("cf-connecting-ip") ?? "local",
          ),
        );
      if (url.searchParams.get("grant_type") === "refresh_token")
        return json(await refreshSession(payload.refresh_token));
    }
    if (action === "user" && request.method === "GET")
      return json((await authenticateBearer(request)).user);
    if (action === "user" && request.method === "PUT") {
      const auth = await authenticateBearer(request),
        text = await request.text();
      if (encoder.encode(text).length > 8192) return json({ error: "invalid_request" }, 413);
      const payload = JSON.parse(text) as Record<string, unknown>;
      if (
        Object.keys(payload).some((k) => k !== "password") ||
        typeof payload.password !== "string"
      )
        return json({ error: "feature_unavailable" }, 503);
      await replacePassword(auth.userId, payload.password, auth.claims.sid);
      return json(auth.user);
    }
    if (action === "logout" && request.method === "POST") {
      await logout(request, url.searchParams.get("scope") ?? "global");
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    // Unimplemented account lifecycle operations fail explicitly and never
    // proxy credentials to an external authentication service.
    if (["recover", "resend", "verify", "user"].includes(action))
      return json({ error: "feature_unavailable", message: "Account operation unavailable" }, 503);
    return json({ error: "not_found" }, 404);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_CREDENTIALS";
    if (code === "AUTH_UNAVAILABLE")
      return json({ error: "auth_unavailable", message: "Authentication unavailable" }, 503);
    if (code === "RATE_LIMITED")
      return json({ error: "rate_limited", message: "Try again later" }, 429);
    if (code === "REGISTRATION_NOT_READY")
      return json({ error: "signup_unavailable", message: "Account operation unavailable" }, 503);
    if (action === "signup")
      return json({ error: "signup_failed", message: "Unable to create account" }, 400);
    return json(
      {
        error: "invalid_credentials",
        error_code: "invalid_credentials",
        message: "Invalid login credentials",
      },
      401,
    );
  }
}
