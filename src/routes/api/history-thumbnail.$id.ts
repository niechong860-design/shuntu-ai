import { createFileRoute } from "@tanstack/react-router";
import { authenticateD1Request } from "@/lib/d1-request-auth";
import { rolesFor } from "@/lib/d1-bearer-auth";
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

function getPreviewResponse(
  request: Request,
  object: Awaited<ReturnType<typeof getGeneratedPreviewObject>>,
): Response {
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
        let auth: Awaited<ReturnType<typeof authenticateD1Request>>;
        try {
          auth = await authenticateD1Request(request);
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = createBusinessDatabaseFromContext(
          context as Parameters<typeof createBusinessDatabaseFromContext>[0],
        );
        const row = await db.getGenerationHistory({ historyId: params.id });
        if (!row) return new Response("Not found", { status: 404 });

        if (row.user_id !== auth.userId) {
          const roles = (await rolesFor(auth.userId)).filter((role) =>
            ["admin", "founder"].includes(role),
          );
          if (!roles?.length) return new Response("Not found", { status: 404 });
        }

        const size = getPreviewSize(request);
        const previewKey = getGeneratedPreviewKeyFromPublicUrl(row.image_url, size);
        if (!previewKey) return new Response("Preview unavailable", { status: 502 });

        try {
          const cloudflareEnv = getCloudflareEnv();
          let preview = await getGeneratedPreviewObject(previewKey, cloudflareEnv);
          if (!preview) {
            const ensured = await ensureGeneratedPreviewFromOriginalUrl(
              row.image_url ?? "",
              cloudflareEnv,
            );
            if (ensured) preview = await getGeneratedPreviewObject(previewKey, cloudflareEnv);
          }

          // Keep the large preview route compatible with old processor images
          // while their 1536px variant is being generated or rolled out.
          if (!preview && size === 1536) {
            const fallbackKey = getGeneratedPreviewKeyFromPublicUrl(row.image_url, 1024);
            if (fallbackKey) preview = await getGeneratedPreviewObject(fallbackKey, cloudflareEnv);
          }

          return preview
            ? getPreviewResponse(request, preview)
            : new Response("Preview unavailable", { status: 502 });
        } catch {
          return new Response("Preview unavailable", { status: 502 });
        }
      },
    },
  },
});
