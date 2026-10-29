import { importMissing, validateImport, type ImportCredential } from "./auth-import";
import type { D1Database } from "./auth-password";

type Target = { accountId: string; databaseId: string; databaseName: string };
export type ImportApproval = {
  target: Target;
  sourceSha256: string;
  schemaSha256: string;
  rolesSha256: string;
  expiresAt: string;
  reference: string;
  allowWrite: boolean;
  environment: "isolated-synthetic" | "production";
  productionPermit?: {
    administratorReference: string;
    rawFileSha256: string;
    backupReceiptSha256: string;
    reviewedRunnerSha256: string;
    allowCredentialRead: boolean;
    backupWindowEndsAt: string;
  };
};
export type ImportReceipt = {
  sequence: number;
  anonymousUser: string;
  action: "INSERTED" | "PRESERVED";
  at: string;
};
const productionId = "a475419e-3878-4ede-84d0-75fad8ebd5cd";
const schemaSnapshotSql =
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name IN ('profiles','user_roles') OR name LIKE 'auth_%' OR tbl_name IN ('profiles','user_roles') OR tbl_name LIKE 'auth_%' ORDER BY type,name";
const rolesSnapshotSql = "SELECT user_id,role FROM user_roles ORDER BY user_id,role";
async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function refused(code: string): never {
  throw new Error(code);
}
async function readBatch(db: D1Database, queries: readonly { sql: string; params?: unknown[] }[]) {
  const result = await db.batch<{
    results?: Record<string, unknown>[];
    success?: boolean;
  }>(queries.map(({ sql, params = [] }) => db.prepare(sql).bind(...params)));
  if (
    result.length !== queries.length ||
    result.some((row) => row.success !== true || !Array.isArray(row.results))
  )
    refused("READ_SNAPSHOT_FAILED_STOP");
  return result.map((row) => row.results!);
}
function checkExecutionWindow(approval: ImportApproval, production: boolean) {
  const now = Date.now();
  if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now)
    refused("APPROVAL_EXPIRED_STOP");
  if (production) {
    const timestamp = Date.parse(approval.productionPermit?.backupWindowEndsAt ?? "");
    if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > 3_600_000)
      refused("CURRENT_BACKUP_RESTORE_REQUIRED");
  }
}
export async function inspectImportContract(db: D1Database) {
  const tables = [
    ["profiles", ["id", "email"]],
    ["auth_credentials", ["user_id", "password_hash", "email_verified_at", "disabled_at"]],
    ["auth_identities", ["id", "user_id", "provider", "provider_user_id"]],
    ["auth_sessions", ["token_hash", "csrf_hash", "expires_at", "revoked_at"]],
  ] as const;
  // One atomic read snapshot replaces a series of remote round trips. There is
  // no cross-row cache: every import row rechecks the full schema and role set.
  const [schema, roles, ...metadata] = await readBatch(db, [
    {
      sql: schemaSnapshotSql,
    },
    { sql: rolesSnapshotSql },
    ...tables.map(([table]) => ({ sql: `PRAGMA table_info(${table})` })),
    { sql: "PRAGMA index_list(auth_identities)" },
    { sql: "PRAGMA foreign_key_list(auth_credentials)" },
    { sql: "PRAGMA foreign_key_list(auth_identities)" },
  ]);
  if (schema.some((x) => x.type === "trigger")) refused("UNREVIEWED_TRIGGER");
  for (const [index, [table, required]] of tables.entries()) {
    const columns = metadata[index];
    for (const column of required)
      if (!columns.some((x) => x.name === column && x.type === "TEXT"))
        refused("SCHEMA_COLUMN_MISMATCH");
    const key =
      table === "profiles"
        ? "id"
        : table === "auth_credentials"
          ? "user_id"
          : table === "auth_sessions"
            ? "token_hash"
            : "id";
    if (!columns.some((x) => x.name === key && x.pk === 1)) refused("SCHEMA_PRIMARY_KEY_MISMATCH");
    if (
      table === "auth_credentials" &&
      !columns.some((x) => x.name === "password_hash" && x.notnull === 1)
    )
      refused("SCHEMA_NOT_NULL_MISMATCH");
    if (
      table === "auth_identities" &&
      ["user_id", "provider", "provider_user_id"].some(
        (name) => !columns.some((x) => x.name === name && x.notnull === 1),
      )
    )
      refused("SCHEMA_NOT_NULL_MISMATCH");
  }
  const indexes = metadata[4].filter(
    (i) => i.unique === 1 && typeof i.name === "string" && /^[A-Za-z0-9_]+$/.test(i.name),
  );
  const indexColumns = indexes.length
    ? await readBatch(
        db,
        indexes.map((i) => ({ sql: `PRAGMA index_info(${i.name})` })),
      )
    : [];
  let owner = false,
    legacy = false;
  for (const [index, i] of indexes.entries()) {
    const columns = indexColumns[index].map((x) => x.name);
    if (JSON.stringify(columns) === '["provider","provider_user_id"]' && i.partial === 0)
      owner = true;
    const definition = schema.find((x) => x.name === i.name);
    if (
      JSON.stringify(columns) === '["user_id","provider"]' &&
      i.partial === 1 &&
      typeof definition?.sql === "string" &&
      /WHERE\s+provider\s*=\s*'legacy_email'\s*$/i.test(definition.sql)
    )
      legacy = true;
  }
  if (!owner || !legacy) refused("IDENTITY_UNIQUE_CONTRACT_MISMATCH");
  for (const [foreignKeys, parent, from, to] of [
    [metadata[5], "profiles", "user_id", "id"],
    [metadata[6], "auth_credentials", "user_id", "user_id"],
  ] as const) {
    if (
      !foreignKeys.some(
        (x) => x.table === parent && x.from === from && x.to === to && x.on_delete === "CASCADE",
      )
    )
      refused("SCHEMA_FOREIGN_KEY_MISMATCH");
  }
  return {
    schemaSha256: await digest(JSON.stringify(schema)),
    rolesSha256: await digest(JSON.stringify(roles)),
  };
}
export async function prepareImport(db: D1Database, records: readonly ImportCredential[]) {
  const contract = await inspectImportContract(db);
  validateImport(records);
  for (const row of records) {
    if (row.userId !== row.userId.toLowerCase()) refused("UUID_MUST_BE_CANONICAL");
    if (
      Object.keys(row).some((x) => !["userId", "email", "passwordHash", "confirmedAt"].includes(x))
    )
      refused("UNEXPECTED_SOURCE_FIELD");
    if (
      row.confirmedAt !== null &&
      (!Number.isFinite(Date.parse(row.confirmedAt)) ||
        new Date(row.confirmedAt).toISOString() !== row.confirmedAt)
    )
      refused("INVALID_VERIFICATION_TIMESTAMP");
  }
  // At most 100 read statements per atomic snapshot. Every source row is still
  // checked; batching changes transport overhead only, never conflict policy.
  for (let start = 0; start < records.length; start += 25) {
    const rows = records.slice(start, start + 25);
    const results = await readBatch(
      db,
      rows.flatMap((row) => [
        { sql: "SELECT id,email FROM profiles WHERE id=?", params: [row.userId] },
        {
          sql: "SELECT COUNT(*) n FROM profiles WHERE lower(trim(email))=? AND id<>?",
          params: [row.email.trim().toLowerCase(), row.userId],
        },
        { sql: "SELECT password_hash FROM auth_credentials WHERE user_id=?", params: [row.userId] },
        {
          sql: "SELECT user_id,provider_user_id FROM auth_identities WHERE provider='legacy_email' AND (user_id=? OR provider_user_id=?)",
          params: [row.userId, row.email.trim().toLowerCase()],
        },
      ]),
    );
    for (const [index, row] of rows.entries()) {
      const [profiles, otherProfiles, credentials, identities] = results.slice(
        index * 4,
        index * 4 + 4,
      );
      const profile = profiles[0] as { id: string; email: string | null } | undefined;
      if (!profile) refused("MISSING_PROFILE_UUID");
      if (
        profile.email?.trim() &&
        profile.email.trim().toLowerCase() !== row.email.trim().toLowerCase()
      )
        refused("PROFILE_IDENTITY_CONFLICT");
      const others = otherProfiles[0];
      if (others?.n) refused("CROSS_PROFILE_EMAIL_CONFLICT");
      const existing = credentials[0];
      if (existing && existing.password_hash !== row.passwordHash)
        refused("EXISTING_CREDENTIAL_CONFLICT");
      if (
        identities.some(
          (x) => x.user_id !== row.userId || x.provider_user_id !== row.email.trim().toLowerCase(),
        )
      )
        refused("IDENTITY_OWNER_CONFLICT");
    }
  }
  return {
    ...contract,
    sourceSha256: await digest(JSON.stringify(records)),
    sourceCount: records.length,
  };
}
export async function runApprovedImport(
  db: D1Database,
  target: Target,
  records: readonly ImportCredential[],
  approval: ImportApproval,
  receipt: (value: ImportReceipt) => Promise<void>,
) {
  // Only the reviewed CLI may supply a production binding after independently
  // verifying resource identity, source bytes, backup receipt and explicit approval.
  const production = target.databaseId === productionId;
  if (production) {
    const permit = approval.productionPermit;
    if (
      approval.environment !== "production" ||
      target.accountId !== "38a991f00d089d521a5ebbbd8313ee78" ||
      target.databaseName !== "shuntu-prod" ||
      records.length !== 691 ||
      !permit?.administratorReference ||
      !permit.allowCredentialRead ||
      ![permit.rawFileSha256, permit.backupReceiptSha256, permit.reviewedRunnerSha256].every(
        (value) => /^[a-f0-9]{64}$/.test(value),
      )
    )
      refused("PRODUCTION_EXECUTION_NOT_APPROVED");
  } else if (approval.environment !== "isolated-synthetic")
    refused("PRODUCTION_EXECUTION_NOT_APPROVED");
  if (
    target.accountId !== approval.target.accountId ||
    target.databaseId !== approval.target.databaseId ||
    target.databaseName !== approval.target.databaseName ||
    !approval.allowWrite ||
    !approval.reference ||
    Date.parse(approval.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(approval.expiresAt))
  )
    refused("TARGET_OR_APPROVAL_REFUSED");
  checkExecutionWindow(approval, production);
  // The trusted CLI must verify the actual binding identity before supplying db.
  // This library cannot derive Cloudflare resource identity from a SQL binding.
  const snapshot = Object.freeze(records.map((row) => Object.freeze({ ...row })));
  if (!production && snapshot.some((row) => !row.email.endsWith("@example.invalid")))
    refused("SYNTHETIC_SOURCE_REQUIRED");
  const plan = await prepareImport(db, snapshot);
  for (const key of ["sourceSha256", "schemaSha256", "rolesSha256"] as const)
    if (plan[key] !== approval[key]) refused("PLAN_FINGERPRINT_MISMATCH");
  let inserted = 0,
    preserved = 0;
  for (const [index, row] of snapshot.entries()) {
    checkExecutionWindow(approval, production);
    // The initial full contract verified PRAGMA columns, FKs and indexes. Their
    // authoritative CREATE SQL is included in this exact schema snapshot. Check
    // it and all roles anew for every row; no result is cached across writes.
    const [schema, roles, credentials] = await readBatch(db, [
      { sql: schemaSnapshotSql },
      { sql: rolesSnapshotSql },
      { sql: "SELECT user_id FROM auth_credentials WHERE user_id=?", params: [row.userId] },
    ]);
    if ((await digest(JSON.stringify(roles))) !== plan.rolesSha256)
      refused("ROLE_STATE_CHANGED_STOP");
    if ((await digest(JSON.stringify(schema))) !== plan.schemaSha256)
      refused("SCHEMA_STATE_CHANGED_STOP");
    const existing = credentials[0];
    // Remote reads above can take time. Refuse expired approval/backup at the
    // actual write boundary rather than only before the inspection starts.
    checkExecutionWindow(approval, production);
    try {
      await importMissing(db, [row]);
    } catch {
      refused("COMMIT_RESULT_UNCERTAIN_STOP_AND_RECONCILE");
    }
    const actual = await db
      .prepare(
        "SELECT c.password_hash,c.email_verified_at,i.provider_user_id FROM auth_credentials c JOIN auth_identities i ON i.user_id=c.user_id AND i.provider='legacy_email' WHERE c.user_id=?",
      )
      .bind(row.userId)
      .first<{
        password_hash: string;
        email_verified_at: string | null;
        provider_user_id: string;
      }>();
    if (
      !actual ||
      actual.password_hash !== row.passwordHash ||
      actual.provider_user_id !== row.email.trim().toLowerCase() ||
      (!existing && actual.email_verified_at !== row.confirmedAt)
    )
      refused("ROW_VERIFICATION_FAILED_STOP");
    if (existing) preserved++;
    else inserted++;
    try {
      await receipt({
        sequence: index + 1,
        anonymousUser: await digest(row.userId),
        action: existing ? "PRESERVED" : "INSERTED",
        at: new Date().toISOString(),
      });
    } catch {
      refused("RECEIPT_FAILED_STOP_AND_RECONCILE");
    }
  }
  const final = await inspectImportContract(db);
  if (final.rolesSha256 !== plan.rolesSha256) refused("ROLE_STATE_CHANGED_STOP");
  if (final.schemaSha256 !== plan.schemaSha256) refused("SCHEMA_STATE_CHANGED_STOP");
  return { inserted, preserved, verified: snapshot.length };
}
