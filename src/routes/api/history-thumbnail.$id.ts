import { createFileRoute } from "@tanstack/react-router";
import { authenticateSupabaseRequest } from "@/lib/supabase-request-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createBusinessDatabaseFromContext } from "@/lib/business-database-router";
import {
  GENERATED_PREVIEW_CACHE_CONTROL,
  GENERATED_PREVIEW_CONTENT_TYPE,
  ensureGeneratedPreviewFromOriginalUrl,
  getCloudflareEnv,
  getGeneratedPreviewKeyFromPublicUrl,
  getGeneratedPreviewObject,
} from "@/lib/r2-image-preview";

type PreviewSize = 480 | 1024 | 1536;

function getIfNoneMatch(request: Request): string | null {
  const value = request.headers.get("If-None-Match");
  return value?.trim() || null;
}

function getPreviewResponse(request: Request, object: Awaited<ReturnType<typeof getGeneratedPreviewObject>>): Response {
  if (!object) return new Response("Preview unavailable", { status: 502 });

  const etag = object.httpEtag;
  if (etag && getIfNoneMatch(request) === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": GENERATED_PREVIEW_CACHE_CONTROL,
        Vary: "Authorization",
        ETag: etag,
      },
    });
  }

  const headers = new Headers({
    "Content-Type": GENERATED_PREVIEW_CONTENT_TYPE,
    "Cache-Control": GENERATED_PREVIEW_CACHE_CONTROL,
    Vary: "Authorization",
  });
  if (etag) headers.set("ETag", etag);
  return new Response(object.body, { status: 200, headers });
}

function getPreviewSize(request: Request): PreviewSize {
  const size = new URL(request.url).searchParams.get("size");
  if (size === "1536") return 1536;
  if (size === "1024") return 1024;
  return 480;
}

export const Route = createFileRoute("/api/history-thumbnail/$id")({
  server: {
    handlers: {
      GET: async ({ request, params, context }) => {
        let auth: Awaited<ReturnType<typeof authenticateSupabaseRequest>>;
        try {
          auth = await authenticateSupabaseRequest(request);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = createBusinessDatabaseFromContext(context as Parameters<typeof createBusinessDatabaseFromContext>[0]);
        const row = await db.getGenerationHistory({ historyId: params.id });
        if (!row) return new Response("Not found", { status: 404 });

        if (row.user_id !== auth.userId) {
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId)
            .in("role", ["admin", "founder"]);
          if (!roles?.length) return new Response("Not found", { status: 404 });
        }

        const size = getPreviewSize(request);
        const previewKey = getGeneratedPreviewKeyFromPublicUrl(row.image_url, size);
        if (!previewKey) return new Response("Preview unavailable", { status: 502 });

        try {
          const cloudflareEnv = getCloudflareEnv();
          let preview = await getGeneratedPreviewObject(previewKey, cloudflareEnv);
          if (!preview) {
            const ensured = await ensureGeneratedPreviewFromOriginalUrl(row.image_url ?? "", cloudflareEnv);
            if (!ensured) return new Response("Preview unavailable", { status: 502 });
            preview = await getGeneratedPreviewObject(previewKey, cloudflareEnv);
          }

          return preview ? getPreviewResponse(request, preview) : new Response("Preview unavailable", { status: 502 });
        } catch {
          return new Response("Preview unavailable", { status: 502 });
        }
      },
    },
  },
});
