export type HistoryMetadataItem = {
  id: string;
  [key: string]: unknown;
};

export type HistoryMetadataPage = {
  items: any[];
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
