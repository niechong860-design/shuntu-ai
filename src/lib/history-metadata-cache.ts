export type HistoryItem = {
  id: string;
  userId?: string | null;
  model: string;
  prompt: string | null;
  finalPrompt: string | null;
  styleName: string | null;
  aspectRatio: string | null;
  createdAt: string;
  thumbnailUrl: string | null;
  originalImageUrl: string;
  modelKey?: string | null;
  generationTaskId?: string | null;
  inputParams?: Record<string, unknown> | null;
  cost: number;
  authorName?: string | null;
  authorEmail?: string | null;
  // legacy
  image_url: string;
  created_at: string;
};
export type HistoryMetadataPage = {
  items: HistoryItem[];
  total?: number;
  limit: number;
  offset: number;
  maxKeep?: number;
  maxDays?: number;
  isAdmin?: boolean;
};

const CACHE_TTL_MS = 60_000;
const firstPageCache = new Map<string, { cachedAt: number; page: HistoryMetadataPage }>();

export function getCachedHistoryFirstPage(userId: string): HistoryMetadataPage | null {
  const entry = firstPageCache.get(userId);
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.page;
}

export function setCachedHistoryFirstPage(userId: string, page: HistoryMetadataPage) {
  firstPageCache.set(userId, { cachedAt: Date.now(), page });
}
