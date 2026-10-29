type CreateOnlyBucket = {
  put: (
    key: string,
    bytes: ArrayBuffer,
    options: {
      onlyIf: { etagDoesNotMatch: string };
      httpMetadata: { contentType: string; cacheControl: string };
    },
  ) => Promise<unknown>;
};

// R2 evaluates this precondition atomically. A preceding HEAD/GET cannot
// protect against concurrent requests, and a rejected upload must not delete.
export async function createR2Object(
  bucket: CreateOnlyBucket,
  key: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<boolean> {
  const object = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return object !== null;
}
