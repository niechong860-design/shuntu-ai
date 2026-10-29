import { createFileRoute } from "@tanstack/react-router";
import { getCloudflareEnv, getGeneratedR2KeyFromPublicUrl } from "@/lib/r2-image-preview";

const ALLOWED_ORIGIN = "https://img.shuntu.cc";
const ALLOWED_PATH_PREFIX = "/generated/";
const FALLBACK_FILENAME = "shuntu-generated-image.png";

function getSafeFilename(url: URL) {
  const rawName = url.pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    decoded = rawName;
  }
  const safe = decoded.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe || FALLBACK_FILENAME;
}

function getAllowedImageUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("url") ?? requestUrl.searchParams.get("imageUrl");
  if (!value) return null;

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return null;
  }

  if (target.origin !== ALLOWED_ORIGIN || !target.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    return null;
  }

  return target;
}

export const Route = createFileRoute("/api/download-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = getAllowedImageUrl(request);
        if (!target) {
          return new Response("Forbidden", { status: 403 });
        }

        const filename = getSafeFilename(target);
        const commonHeaders = (contentType: string, size?: number) => {
          const headers = new Headers({
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, max-age=0, no-store",
            // Downloads must always use the archived R2 object, never a preview variant.
            "X-Shuntu-Image-Source": "original",
          });
          if (Number.isFinite(size)) headers.set("Content-Length", String(size));
          return headers;
        };

        // Read the object directly from R2 when the Worker binding is available. This
        // preserves the exact provider bytes and bypasses any CDN/image transformation.
        const key = getGeneratedR2KeyFromPublicUrl(target.href);
        const bucket = getCloudflareEnv().SHUNTU_GENERATED_IMAGES;
        if (key && bucket?.get) {
          try {
            const object = await bucket.get(key);
            if (object?.body) {
              const metadata = object.httpMetadata?.contentType ?? "application/octet-stream";
              const size = (object as { size?: number }).size;
              return new Response(object.body, {
                status: 200,
                headers: commonHeaders(metadata, size),
              });
            }
          } catch {
            // Fall back to the public URL for legacy/local environments.
          }
        }

        // Local development and legacy deployments may not expose the binding yet.
        // The URL is still restricted to the public generated-image host/path.
        const upstream = await fetch(target.href);
        if (!upstream.ok || !upstream.body) {
          return new Response("Download source unavailable", { status: upstream.status || 502 });
        }
        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        const contentLength = Number(upstream.headers.get("content-length"));
        return new Response(upstream.body, {
          status: 200,
          headers: commonHeaders(contentType, contentLength),
        });
      },
    },
  },
});
