export type GeneratedPreviewVariant = "canvas" | "lightbox";

const ARCHIVED_GENERATED_ORIGIN = "https://img.shuntu.cc";
const ARCHIVED_GENERATED_PREFIX = "/generated/";

export function isArchivedGeneratedImage(url: string | null | undefined): url is string {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === ARCHIVED_GENERATED_ORIGIN &&
      parsed.pathname.startsWith(ARCHIVED_GENERATED_PREFIX)
    );
  } catch {
    return false;
  }
}

export function getGeneratedPreviewUrl(
  originalUrl: string,
  variant: GeneratedPreviewVariant,
): string {
  if (!isArchivedGeneratedImage(originalUrl)) return originalUrl;

  const params = new URLSearchParams({ url: originalUrl, variant });
  return `/api/generated-preview?${params.toString()}`;
}
