import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { runReplicationBatch, type ReplicationRuntimeEnv } from "./lib/replication-runtime";

type ServerEntry = {
  fetch: (request: Request, requestOpts?: unknown, ctx?: unknown) => Promise<Response> | Response;
};

type WorkerExecutionContext = { waitUntil?: (promise: Promise<unknown>) => void };

const CLOUDFLARE_ENV_GLOBAL_KEY = "__SHUNTU_CLOUDFLARE_ENV__";

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

async function handleManualReplication(request: Request, env: ReplicationRuntimeEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const expected = (env as ReplicationRuntimeEnv & { REPLICATION_RUNNER_TOKEN?: string }).REPLICATION_RUNNER_TOKEN?.trim();
  const supplied = request.headers.get("x-replication-runner-token")?.trim();
  if (!expected || !supplied || supplied !== expected) return new Response("Not Found", { status: 404 });
  try {
    const result = await runReplicationBatch(env, 10);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[replication] batch failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "replication batch failed" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      (globalThis as Record<string, unknown>)[CLOUDFLARE_ENV_GLOBAL_KEY] = env;
      if (new URL(request.url).pathname === "/api/internal/replication") {
        return await handleManualReplication(request, (env ?? {}) as ReplicationRuntimeEnv);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, {
        context: {
          cloudflare: { env, ctx },
        },
      });
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
  async scheduled(_controller: unknown, env: unknown, ctx: WorkerExecutionContext) {
    const task = runReplicationBatch((env ?? {}) as ReplicationRuntimeEnv, 10).catch((error) => {
      console.error("[replication] scheduled batch failed", error instanceof Error ? error.message : "unknown error");
    });
    ctx.waitUntil?.(task);
    await task;
  },
};
