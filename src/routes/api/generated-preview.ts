import { createFileRoute } from "@tanstack/react-router";

const IMAGE_ORIGIN = "https://img.shuntu.cc";
const GENERATED_PREFIX = "/generated/";

const PREVIEW_VARIANTS = {
  canvas: { width: 1400, quality: 80 },
  lightbox: { width: 2200, quality: 82 },
} as const;

type PreviewVariant = keyof typeof PREVIEW_VARIANTS;

type CloudflareImageOptions = {
  image: { width: number; fit: "scale-down"; format: "webp"; quality: number };
};

function getTrustedImageUrl(value: string | null): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== IMAGE_ORIGIN ||
      !url.pathname.startsWith(GENERATED_PREFIX) ||
      url.search ||
      url.hash ||
      url.pathname.split("/").some((part) => part === "." || part === "..")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function getPreviewVariant(value: string | null): PreviewVariant | null {
  return value === "canvas" || value === "lightbox" ? value : null;
}

export const Route = createFileRoute("/api/generated-preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const original = getTrustedImageUrl(requestUrl.searchParams.get("url"));
        const variant = getPreviewVariant(requestUrl.searchParams.get("variant"));

        if (!original || !variant) {
          return new Response("Invalid preview request", { status: 400 });
        }

        const options = PREVIEW_VARIANTS[variant];
        let transformed: Response;
        try {
          transformed = await fetch(original.href, {
            cf: {
              image: {
                width: options.width,
                fit: "scale-down",
                format: "webp",
                quality: options.quality,
              },
            },
            headers: { Accept: "image/webp,image/*,*/*;q=0.8" },
          } as RequestInit & { cf: CloudflareImageOptions });
        } catch {
          return new Response("Preview image transformation failed", {
            status: 502,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        if (!transformed.ok || !transformed.body) {
          return new Response("Preview unavailable", { status: transformed.status || 502 });
        }

        const contentType = transformed.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
        if (contentType !== "image/webp") {
          return new Response("Preview transform returned an unexpected format", { status: 502 });
        }

        return new Response(transformed.body, {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
          },
        });
      },
    },
  },
});
