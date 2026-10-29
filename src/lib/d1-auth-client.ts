export type D1AuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
};

export type D1AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at?: number;
  user: D1AuthUser;
};

type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
type AuthListener = (event: AuthEvent, session: D1AuthSession | null) => void;
const STORAGE_KEY = "shuntu.d1.auth.session";
const listeners = new Set<AuthListener>();
let cachedSession: D1AuthSession | null | undefined;

function readStoredSession(): D1AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as D1AuthSession;
    return parsed?.access_token && parsed?.refresh_token && parsed?.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(session: D1AuthSession | null): void {
  cachedSession = session;
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function notify(event: AuthEvent, session: D1AuthSession | null): void {
  for (const listener of listeners) {
    try {
      listener(event, session);
    } catch {
      /* listener isolation */
    }
  }
}

async function getSessionValue(): Promise<D1AuthSession | null> {
  if (cachedSession !== undefined) return cachedSession;
  cachedSession = readStoredSession();
  return cachedSession;
}

async function request<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (includeAuth) {
    const session = await getSessionValue();
    if (session?.access_token) headers.set("authorization", `Bearer ${session.access_token}`);
  }
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message ?? "Authentication failed")
        : "Authentication failed";
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    if (body && typeof body === "object" && "error" in body)
      error.code = String((body as { error?: unknown }).error ?? "");
    throw error;
  }
  return body as T;
}

async function getSession() {
  let session = await getSessionValue();
  if (session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await request<D1AuthSession>(
        "/api/auth/token?grant_type=refresh_token",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
        false,
      );
      writeSession(refreshed);
      notify("TOKEN_REFRESHED", refreshed);
      session = refreshed;
    } catch {
      writeSession(null);
      notify("SIGNED_OUT", null);
      session = null;
    }
  }
  return { data: { session }, error: null };
}

async function signInWithPassword(input: { email: string; password: string }) {
  const session = await request<D1AuthSession>("/api/auth/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  writeSession(session);
  notify("SIGNED_IN", session);
  return { data: { session, user: session.user }, error: null };
}

async function signUp(input: { email: string; password: string }) {
  const session = await request<D1AuthSession>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  writeSession(session);
  notify("SIGNED_IN", session);
  return { data: { session, user: session.user }, error: null };
}

async function getUser() {
  const user = await request<D1AuthUser>("/api/auth/user", { method: "GET" });
  return { data: { user }, error: null };
}

async function updateUser(input: { password: string }) {
  const user = await request<D1AuthUser>("/api/auth/user", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return { data: { user }, error: null };
}

async function signOut() {
  try {
    await request<unknown>("/api/auth/logout?scope=global", { method: "POST", body: "{}" });
  } finally {
    writeSession(null);
    notify("SIGNED_OUT", null);
  }
  return { error: null };
}

function onAuthStateChange(callback: AuthListener) {
  listeners.add(callback);
  void getSessionValue().then((session) => callback("INITIAL_SESSION", session));
  return {
    data: {
      subscription: {
        unsubscribe: () => {
          listeners.delete(callback);
        },
      },
    },
  };
}

export const d1Auth = {
  auth: { getSession, signInWithPassword, signUp, getUser, updateUser, signOut, onAuthStateChange },
};
export async function getD1AccessToken(): Promise<string | null> {
  return (await getSessionValue())?.access_token ?? null;
}
