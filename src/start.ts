import { createStart, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

import { renderErrorPage } from "./lib/error-page";

function sameOriginServerFnFetch(url: string, init: RequestInit): Promise<Response> {
  if (typeof window === "undefined") return fetch(url, init);

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/_serverFn/") && parsed.origin !== window.location.origin) {
      return fetch(`${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`, init);
    }
  } catch {
    // Fall through to the original URL if parsing ever fails.
  }

  return fetch(url, init);
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
  serverFns: {
    fetch: sameOriginServerFnFetch,
  },
}));
