/**
 * Rewrite Supabase Storage public URLs to use the on-the-fly image
 * transformation endpoint, so thumbnails load much faster.
 *
 *   .../storage/v1/object/public/<bucket>/<path>
 *   → .../storage/v1/render/image/public/<bucket>/<path>?width=W&quality=Q&resize=contain
 *
 * Non-Supabase URLs (CDN, external) are returned unchanged.
 */

export type ThumbOpts = {
  width?: number;
  height?: number;
  quality?: number; // 20-100, default 70
  resize?: "cover" | "contain" | "fill";
};

export function thumbUrl(url: string | null | undefined, opts: ThumbOpts = {}): string {
  if (!url) return "";
  // Don't transform blobs / data URIs / local previews.
  if (/^(blob:|data:)/i.test(url)) return url;

  const { width, height, quality = 70, resize = "cover" } = opts;
  if (!width && !height) return url;

  let transformed = url;
  if (url.includes("/storage/v1/object/public/")) {
    transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  } else if (!url.includes("/storage/v1/render/image/public/")) {
    // Unknown host — return as is.
    return url;
  }

  const params = new URLSearchParams();
  if (width) params.set("width", String(Math.round(width)));
  if (height) params.set("height", String(Math.round(height)));
  params.set("quality", String(Math.max(20, Math.min(100, quality))));
  params.set("resize", resize);

  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}${params.toString()}`;
}
