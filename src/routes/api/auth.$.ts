import { createFileRoute } from "@tanstack/react-router";

const MAX_AUTH_BODY_BYTES = 64 * 1024;
const AUTH_PATH_PATTERN = /^\/(?:settings|signup|token|logout|recover|verify|user|resend|otp|callback|sso|authorize|reauthenticate)(?:\/.*)?$/;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "origin",
  "referer",
  "user-agent",
  "x-client-info",
  "x-supabase-api-version",
  "x-supabase-auth-event",
  "access-control-request-headers",
  "access-control-request-method",
];
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "expires",
  "pragma",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
];

function getUpstreamUrl(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;

  const incoming = new URL(request.url);
  const authPath = incoming.pathname.slice("/api/auth".length) || "/";
  if (!AUTH_PATH_PATTERN.test(authPath)) return null;

  const target = new URL(supabaseUrl);
  target.pathname = `/auth/v1${authPath}`;
  target.search = incoming.search;
  return { target, publishableKey };
}

async function proxyAuthRequest(request: Request) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS" } });
  }

  const upstreamConfig = getUpstreamUrl(request);
  if (!upstreamConfig) return new Response("Not found", { status: 404 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUTH_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("apikey", upstreamConfig.publishableKey);
  headers.set("x-forwarded-host", new URL(request.url).host);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > MAX_AUTH_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  let upstream: Response;
  try {
    upstream = await fetch(upstreamConfig.target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("[auth-proxy] upstream request failed", {
      method: request.method,
      path: upstreamConfig.target.pathname,
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ message: "Authentication service temporarily unavailable" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.append("Vary", "Origin");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyAuthRequest(request),
      POST: ({ request }) => proxyAuthRequest(request),
      PUT: ({ request }) => proxyAuthRequest(request),
      PATCH: ({ request }) => proxyAuthRequest(request),
      DELETE: ({ request }) => proxyAuthRequest(request),
      OPTIONS: ({ request }) => proxyAuthRequest(request),
    },
  },
});
