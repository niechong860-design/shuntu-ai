/**
 * Rewrite Supabase Storage public URLs to use the on-the-fly image
 * transformation endpoint, applying **quality compression only** — the
 * pixel dimensions of the original image are preserved.
 *
 *   .../storage/v1/object/public/<bucket>/<path>
 *   → .../storage/v1/render/image/public/<bucket>/<path>?quality=Q&width=<cap>
 *
 * Supabase's render endpoint requires at least one of width/height to
 * activate, so we pass a very large width cap (2400) that won't actually
 * downscale typical assets — it only acts as an upper bound for huge
 * originals. The real win is the `quality` param, which re-encodes the
 * image with a lower quality factor (default 65) and serves WebP when
 * the browser supports it.
 *
 * Non-Supabase URLs (CDN, external) are returned unchanged.
 */

export type CompressOpts = {
  /** JPEG/WebP quality 20-100. Default 65. */
  quality?: number;
  /**
   * Safety cap for the longest edge. Defaults to 2400 — large enough
   * to leave normal product / template / avatar images at their native
   * pixel size, while protecting against absurdly huge originals.
   */
  maxDim?: number;
};

export function thumbUrl(url: string | null | undefined, opts: CompressOpts = {}): string {
  if (!url) return "";
  if (/^(blob:|data:)/i.test(url)) return url;

  let transformed = url;
  if (url.includes("/storage/v1/object/public/")) {
    transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  } else if (!url.includes("/storage/v1/render/image/public/")) {
    return url;
  }

  const quality = Math.max(20, Math.min(100, opts.quality ?? 65));
  const maxDim = Math.max(256, Math.min(4096, opts.maxDim ?? 2400));

  const params = new URLSearchParams();
  params.set("quality", String(quality));
  params.set("width", String(maxDim));
  params.set("resize", "contain");

  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}${params.toString()}`;
}
