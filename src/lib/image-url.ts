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

/**
 * Build a small history-list thumbnail URL from a Supabase Storage URL.
 * - width ~480px, quality 62 → typically 30–120KB WebP (browser-negotiated)
 * - Non-Supabase URLs are returned unchanged (no transform endpoint available).
 */
export function historyThumbUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(blob:|data:)/i.test(url)) return url;
  if (!url.includes("/storage/v1/object/public/") && !url.includes("/storage/v1/render/image/public/")) {
    return url;
  }
  const transformed = url.includes("/storage/v1/object/public/")
    ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
    : url;
  const params = new URLSearchParams();
  params.set("width", "480");
  params.set("quality", "62");
  params.set("resize", "contain");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}${params.toString()}`;

/**
 * Preload a batch of image URLs into the browser cache during idle time,
 * before they enter the viewport. This eliminates the "blank tile" flash
 * when the user starts scrolling.
 *
 * Uses `<link rel="preload" as="image">` so the browser treats them as
 * critical resources but with low priority (won't compete with the LCP).
 * Scheduled via `requestIdleCallback` so it doesn't delay first paint.
 */
const preloadedSet = new Set<string>();

export function preloadImages(urls: Array<string | null | undefined>) {
  if (typeof document === "undefined") return;
  const fresh = urls.filter((u): u is string => !!u && !preloadedSet.has(u));
  if (fresh.length === 0) return;

  const schedule =
    (typeof window !== "undefined" && (window as any).requestIdleCallback) ||
    ((cb: () => void) => setTimeout(cb, 200));

  schedule(() => {
    for (const url of fresh) {
      if (preloadedSet.has(url)) continue;
      preloadedSet.add(url);
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      (link as any).fetchPriority = "low";
      document.head.appendChild(link);
    }
  });
}
