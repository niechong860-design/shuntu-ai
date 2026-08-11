import { createFileRoute } from "@tanstack/react-router";
import { authenticateSupabaseRequest } from "@/lib/supabase-request-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IMAGE_ORIGIN = "https://img.shuntu.cc";
const GENERATED_PREFIX = "/generated/";
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 80;

type CloudflareImageOptions = {
  image: { width: number; fit: "scale-down"; format: "webp"; quality: number };
};

type WorkerCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function getTrustedImageUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== IMAGE_ORIGIN || !url.pathname.startsWith(GENERATED_PREFIX)) return null;
    if (url.search || url.hash) return null;
    if (url.pathname.split("/").some((part) => part === "." || part === "..")) return null;
    return url;
  } catch {
    return null;
  }
}

function getEdgeCache(): WorkerCache | undefined {
  return (globalThis as typeof globalThis & { caches?: { default?: WorkerCache } }).caches?.default;
}

export const Route = createFileRoute("/api/history-thumbnail/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        let auth: Awaited<ReturnType<typeof authenticateSupabaseRequest>>;
        try {
          auth = await authenticateSupabaseRequest(request);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: row, error } = await supabaseAdmin
          .from("generation_history")
          .select("image_url, user_id")
          .eq("id", params.id)
          .maybeSingle();
        if (error || !row) return new Response("Not found", { status: 404 });

        if (row.user_id !== auth.userId) {
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId)
            .in("role", ["admin", "founder"]);
          if (!roles?.length) return new Response("Not found", { status: 404 });
        }

        const original = getTrustedImageUrl(row.image_url);
        if (!original) return new Response("Invalid image source", { status: 404 });

        const cacheKey = new Request(
          `${new URL(request.url).origin}/__history-thumb-cache/v1/${encodeURIComponent(original.pathname)}?w=${THUMB_WIDTH}&format=webp&q=${THUMB_QUALITY}`,
        );
        const cache = getEdgeCache();
        if (cache) {
          try {
            const hit = await cache.match(cacheKey);
            if (hit) return new Response(hit.body, { status: 200, headers: hit.headers });
          } catch {
            // Transformation caching remains available if the Cache API is unavailable.
          }
        }

        const transformed = await fetch(original.href, {
          cf: { image: { width: THUMB_WIDTH, fit: "scale-down", format: "webp", quality: THUMB_QUALITY } },
          headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        } as RequestInit & { cf: CloudflareImageOptions });
        if (!transformed.ok || !transformed.body) {
          return new Response("Thumbnail unavailable", { status: transformed.status || 502 });
        }

        const response = new Response(transformed.body, {
          status: 200,
          headers: {
            "Content-Type": transformed.headers.get("content-type") ?? "image/webp",
            "Cache-Control": "private, max-age=0, must-revalidate",
            "Vary": "Authorization",
          },
        });
        if (cache) {
          try {
            await cache.put(cacheKey, response.clone());
          } catch {
            // Cache writes are optional and must not fail a valid thumbnail response.
          }
        }
        return response;
      },
    },
  },
});
