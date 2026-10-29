import { normalizeEmail, type D1Database } from "./auth-password";

export type ImportCredential = {
  userId: string;
  email: string;
  passwordHash: string;
  confirmedAt: string | null;
};
export function validateImport(records: readonly ImportCredential[]) {
  const ids = new Set<string>(),
    emails = new Set<string>();
  for (const row of records) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.userId))
      throw new Error("INVALID_UUID");
    const email = normalizeEmail(row.email);
    if (ids.has(row.userId.toLowerCase())) throw new Error("DUPLICATE_UUID");
    if (emails.has(email)) throw new Error("DUPLICATE_EMAIL");
    if (!/^\$2[aby]\$(0[4-9]|1[0-5])\$[./A-Za-z0-9]{53}$/.test(row.passwordHash))
      throw new Error("INVALID_HASH_FORMAT");
    ids.add(row.userId.toLowerCase());
    emails.add(email);
  }
}
// DB is supplied by the caller. This library contains no network client,
// Cloudflare account, production identifier, CLI or implicit resource lookup.
// A single atomic D1 batch per identity permits safe restart after any receipt.
export async function importMissing(
  db: D1Database,
  records: readonly ImportCredential[],
  afterReceipt?: (count: number) => void,
) {
  validateImport(records);
  let processed = 0;
  for (const row of records) {
    const email = normalizeEmail(row.email);
    // NOT NULL failures abort this batch on a racing conflict. Never overwrite
    // an existing hash: the UPDATE expression keeps it or rejects the batch.
    await db.batch([
      db
        .prepare(
          "INSERT INTO auth_credentials(user_id,password_hash,email_verified_at) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM profiles WHERE id=? AND (email IS NULL OR trim(email)='' OR lower(trim(email))=?)) AND NOT EXISTS(SELECT 1 FROM profiles WHERE lower(trim(email))=? AND id<>?) THEN ? ELSE NULL END,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=CASE WHEN auth_credentials.password_hash=excluded.password_hash THEN auth_credentials.password_hash ELSE NULL END",
        )
        .bind(row.userId, row.userId, email, email, row.userId, row.passwordHash, row.confirmedAt),
      db
        .prepare(
          "INSERT INTO auth_identities(id,user_id,provider,provider_user_id) VALUES(?,?,'legacy_email',CASE WHEN NOT EXISTS(SELECT 1 FROM auth_identities WHERE provider='legacy_email' AND user_id=? AND provider_user_id<>?) THEN ? ELSE NULL END) ON CONFLICT(provider,provider_user_id) DO UPDATE SET user_id=CASE WHEN auth_identities.user_id=excluded.user_id THEN auth_identities.user_id ELSE NULL END",
        )
        .bind("legacy-email:" + row.userId, row.userId, row.userId, email, email),
    ]);
    processed++;
    afterReceipt?.(processed);
  }
  return { processed };
}
