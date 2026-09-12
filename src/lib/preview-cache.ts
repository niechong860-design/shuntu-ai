import { supabase } from "@/integrations/supabase/client";

const MAX_ENTRIES = 50;
const PREVIEW_VERSION = "v1";

type PreviewCacheEntry = {
  userId: string;
  historyId: string;
  blobUrl: string;
  touchedAt: number;
};

const entries = new Map<string, PreviewCacheEntry>();
const inFlight = new Map<string, Promise<string>>();
const userGenerations = new Map<string, number>();
let touchCounter = 0;
let cacheEpoch = 0;

function getKey(userId: string, historyId: string) {
  return `${userId}:${PREVIEW_VERSION}:${historyId}`;
}

function touch(entry: PreviewCacheEntry) {
  entry.touchedAt = ++touchCounter;
  entries.delete(getKey(entry.userId, entry.historyId));
  entries.set(getKey(entry.userId, entry.historyId), entry);
}

function evictIfNeeded() {
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) return;
    const entry = entries.get(oldest);
    entries.delete(oldest);
    if (entry) URL.revokeObjectURL(entry.blobUrl);
  }
}

export function getCachedPreview(userId: string, historyId: string): string | null {
  const key = getKey(userId, historyId);
  const entry = entries.get(key);
  if (!entry) return null;
  touch(entry);
  return entry.blobUrl;
}

export async function loadHistoryPreview(userId: string, historyId: string): Promise<string> {
  const cached = getCachedPreview(userId, historyId);
  if (cached) return cached;

  const key = getKey(userId, historyId);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const generation = userGenerations.get(userId) ?? 0;
  const epoch = cacheEpoch;
  const request = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Missing session");

    const response = await fetch(`/api/history-thumbnail/${encodeURIComponent(historyId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Preview request failed: ${response.status}`);
    const blob = await response.blob();
    if (!blob.size || blob.type !== "image/jpeg") throw new Error("Preview response was not JPEG");

    const blobUrl = URL.createObjectURL(blob);
    if ((userGenerations.get(userId) ?? 0) !== generation || cacheEpoch !== epoch) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Preview cache scope changed");
    }

    entries.set(key, { userId, historyId, blobUrl, touchedAt: ++touchCounter });
    evictIfNeeded();
    return blobUrl;
  })();
  inFlight.set(key, request);
  void request.then(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }, () => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  return request;
}

export function clearPreviewCacheForUser(userId: string) {
  userGenerations.set(userId, (userGenerations.get(userId) ?? 0) + 1);
  for (const [key, entry] of entries) {
    if (entry.userId !== userId) continue;
    entries.delete(key);
    URL.revokeObjectURL(entry.blobUrl);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(`${userId}:`)) inFlight.delete(key);
  }
}

export function clearAllPreviewCache() {
  cacheEpoch += 1;
  for (const entry of entries.values()) URL.revokeObjectURL(entry.blobUrl);
  entries.clear();
  inFlight.clear();
  userGenerations.clear();
}
