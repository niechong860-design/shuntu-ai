#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const migrationsDir = path.join(repoRoot, "d1", "migrations");
const schemaPath = path.join(repoRoot, "d1", "migrations", "0001_initial.sql");
const reportsDir = path.join(repoRoot, "d1", "reports");
const defaultBackupDir = String.raw`C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`;
const defaultDirectDbPath = path.join(repoRoot, "d1", ".local", "shuntu-d1.sqlite");
const wranglerD1StateDir = path.join(repoRoot, ".wrangler", "state", "v3", "d1");
const stagingImageDir = path.join(repoRoot, "d1", "staging", "base64-images");
const externalizationManifestPath = path.join(reportsDir, "base64-externalization-manifest.json");
const externalizedNamespace = "migration/legacy-generation-task-images/v1";
const legacyImageStagingDir = path.join(repoRoot, "d1", "staging", "legacy-generated-images");
const legacyImageManifestPath = path.join(reportsDir, "legacy-image-externalization-manifest.json");
const legacyImageNamespace = "migration/legacy-generated-images/v1";
const rechargePackagesSupplementPath = path.join(repoRoot, "d1", "staging", "source-supplements", "recharge_packages.json");
const expectedRechargePackagesSupplementSha256 = "2d5e0363da2dc4c2ba5ab707f75e1788238a600dfadfd06d440428a90f30bd03";
const expectedRechargePackagesRows = 5;
const expectedLegacyBase64Rows = 14;
const expectedLegacyBase64DecodedBytes = 95_777_338;
const expectedLegacyHistoryBase64Rows = 16;
const remoteD1MaxFieldBytes = 2_000_000;
const remoteD1WarningBytes = 1_000_000;

const importOrder = [
  "profiles",
  "admin_settings",
  "global_config",
  "models_config",
  "style_templates",
  "ads",
  "announcements",
  "recharge_packages",
  "coupons",
  "generation_tasks",
  "generation_history",
  "credit_usage_logs",
  "user_orders",
  "redeem_logs",
  "user_roles",
  "inspiration_cases",
  "case_likes",
  "case_favorites",
  "case_comments",
];

const tableColumns = {
  profiles: ["id", "email", "display_name", "avatar_url", "credits", "created_at", "updated_at"],
  admin_settings: ["id", "access_password", "system_prompt", "contact_wechat", "contact_qq", "updated_at"],
  global_config: ["id", "base_url", "global_api_key", "updated_at"],
  models_config: [
    "id",
    "model_key",
    "name",
    "description",
    "cost",
    "sort_order",
    "api_url",
    "api_key",
    "request_format",
    "prompt_key",
    "fetch_url",
    "extra_params",
    "is_enabled",
    "created_at",
    "updated_at",
  ],
  style_templates: ["id", "name", "prompt", "image_url", "sort_order", "updated_at"],
  ads: ["id", "title", "link_url", "is_active", "sort_order", "created_at", "updated_at"],
  announcements: [
    "id",
    "title",
    "content",
    "type",
    "image_url",
    "link_url",
    "link_label",
    "is_pinned",
    "is_published",
    "created_at",
    "updated_at",
  ],
  recharge_packages: [
    "id",
    "title",
    "subtitle",
    "price",
    "credits",
    "features",
    "badge_text",
    "is_popular",
    "highlighted",
    "is_visible",
    "sort_order",
    "button_text",
    "purchase_url",
    "created_at",
    "updated_at",
  ],
  coupons: ["id", "code", "amount", "is_used", "used_by", "used_by_email", "used_at", "created_at", "created_by"],
  generation_tasks: [
    "id",
    "request_id",
    "user_id",
    "status",
    "model_id",
    "prompt",
    "input_params",
    "credits_required",
    "deduction_status",
    "deduction_id",
    "charged_at",
    "refunded_at",
    "result_image_url",
    "result_payload",
    "error_code",
    "error_message",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
  ],
  generation_history: ["id", "user_id", "model", "cost", "prompt", "image_url", "created_at", "generation_task_id"],
  credit_usage_logs: [
    "id",
    "user_id",
    "amount",
    "source",
    "model_key",
    "model_name",
    "generation_history_id",
    "generation_task_id",
    "idempotency_key",
    "created_at",
    "metadata",
  ],
  user_orders: [
    "id",
    "user_id",
    "out_trade_no",
    "amount",
    "credits",
    "status",
    "pay_type",
    "trade_no",
    "paid_at",
    "created_at",
    "updated_at",
  ],
  redeem_logs: ["id", "user_id", "code", "amount", "success", "error_message", "redeemed_at"],
  user_roles: ["id", "user_id", "role", "created_at"],
  inspiration_cases: [
    "id",
    "user_id",
    "title",
    "image_url",
    "prompt",
    "model_key",
    "model_name",
    "aspect_ratio",
    "size",
    "style_id",
    "tags",
    "views",
    "likes_count",
    "favorites_count",
    "is_published",
    "created_at",
    "updated_at",
  ],
  case_likes: ["case_id", "user_id", "created_at"],
  case_favorites: ["case_id", "user_id", "created_at"],
  case_comments: ["id", "case_id", "user_id", "content", "created_at"],
};

const booleanColumns = toSetMap({
  ads: ["is_active"],
  announcements: ["is_pinned", "is_published"],
  coupons: ["is_used"],
  models_config: ["is_enabled"],
  inspiration_cases: ["is_published"],
  recharge_packages: ["is_popular", "highlighted", "is_visible"],
  redeem_logs: ["success"],
});

const jsonTextColumns = toSetMap({
  credit_usage_logs: ["metadata"],
  generation_tasks: ["input_params", "result_payload"],
  inspiration_cases: ["tags"],
  models_config: ["extra_params"],
  recharge_packages: ["features"],
});

const centiCreditColumns = toSetMap({
  profiles: ["credits"],
  credit_usage_logs: ["amount"],
  generation_history: ["cost"],
  generation_tasks: ["credits_required"],
  models_config: ["cost"],
  coupons: ["amount"],
  recharge_packages: ["credits"],
  redeem_logs: ["amount"],
  user_orders: ["credits"],
});

const fenColumns = toSetMap({
  user_orders: ["amount"],
});

const uniqueChecks = [
  { table: "generation_tasks", column: "request_id", index: "generation_tasks_request_id_uidx" },
  { table: "coupons", column: "code", index: "coupons_code_uidx" },
  { table: "user_orders", column: "out_trade_no", index: "user_orders_out_trade_no_uidx" },
  { table: "credit_usage_logs", column: "idempotency_key", index: "credit_usage_logs_idempotency_key_uidx" },
  { table: "models_config", column: "model_key", index: "models_config_model_key_uidx" },
  { table: "user_roles", column: "user_id || ':' || role", index: "user_roles_user_id_role_uidx", label: "user_id + role" },
  { table: "generation_history", column: "generation_task_id", index: "generation_history_generation_task_id_uidx", nullable: true },
  { table: "credit_usage_logs", column: "generation_history_id", index: "credit_usage_logs_generation_history_id_uidx", nullable: true },
  { table: "credit_usage_logs", column: "generation_task_id", index: "credit_usage_logs_generation_task_id_uidx", nullable: true },
];

const args = parseArgs(process.argv.slice(2));
const backupDir = path.resolve(args.backupDir ?? process.env.SHUNTU_BACKUP_DIR ?? defaultBackupDir);
const reportPath = path.join(reportsDir, "migration-report.md");
const verificationJsonPath = path.join(reportsDir, "verification.json");
const useWranglerLocal = args.dbPath == null && !args.direct;
const explicitDbPath = args.dbPath ? path.resolve(args.dbPath) : defaultDirectDbPath;
const scaleStats = new Map();
const remoteCompatibilityState = createRemoteCompatibilityState();

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  assertInsideRepo(repoRoot, repoRoot, "repository root");
  fs.mkdirSync(reportsDir, { recursive: true });

  const hashVerification = verifySourceHashes(backupDir);
  if (!hashVerification.allMatch) {
    throw new Error(`SOURCE_HASH_MISMATCH: ${hashVerification.matches}/${hashVerification.total} matched. Migration stopped before D1 data generation.`);
  }

  const summary = readBackupSummary(backupDir);
  const expectedRows = Object.fromEntries(summary.tables.map((table) => [table.table, table.rows]));
  for (const row of summary.tables) {
    if (row.ok !== true) throw new Error(`SOURCE_SUMMARY_NOT_OK: ${row.table}`);
  }

  const missingRechargePackages = !fs.existsSync(path.join(backupDir, "recharge_packages.json")) &&
    !fs.existsSync(path.join(backupDir, "recharge_packages.csv"));
  const rechargePackagesSupplement = readRechargePackagesSupplement();
  if (rechargePackagesSupplement) {
    expectedRows.recharge_packages = rechargePackagesSupplement.rows.length;
  }

  const preExternalizeLocalD1Bytes = args.beforeExternalizeBytes ?? readPreExternalizeLocalD1Bytes();
  const r2PublicBaseUrl = resolveR2PublicBaseUrl();
  let externalization = null;
  if (args.externalizeBase64) {
    const generationTaskRows = readTableJson(backupDir, "generation_tasks");
    const generationHistoryRows = readTableJson(backupDir, "generation_history");
    if (expectedRows.generation_tasks !== generationTaskRows.length) {
      throw new Error(`SOURCE_ROW_COUNT_MISMATCH: generation_tasks summary=${expectedRows.generation_tasks} json=${generationTaskRows.length}`);
    }
    if (expectedRows.generation_history !== generationHistoryRows.length) {
      throw new Error(`SOURCE_ROW_COUNT_MISMATCH: generation_history summary=${expectedRows.generation_history} json=${generationHistoryRows.length}`);
    }
    externalization = prepareLegacyImageExternalization({ generationTaskRows, generationHistoryRows, r2PublicBaseUrl });
  }

  const dbPath = useWranglerLocal ? bootstrapWranglerLocalD1() : bootstrapDirectSqlite(explicitDbPath);
  assertInsideRepo(dbPath, repoRoot, "local D1 database");

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");

    const sourceAggregates = {};
    let base64Info = { count: 0, totalDecodedBytes: 0, totalTextBytes: 0, rows: [] };
    let historyBase64ImageInfo = { count: 0, oversizedCount: 0, totalDecodedBytes: 0, totalTextBytes: 0, rows: [] };
    const externalizedTables = {};
    let normalExistingR2UrlUnchangedRows = 0;

    for (const table of importOrder) {
      const rows = readTableJson(backupDir, table);
      if (expectedRows[table] !== rows.length) {
        throw new Error(`SOURCE_ROW_COUNT_MISMATCH: ${table} summary=${expectedRows[table]} json=${rows.length}`);
      }
      let importRows = rows;
      if (table === "generation_tasks") {
        base64Info = inspectGenerationTaskBase64(rows);
        validateLegacyBase64Baseline(base64Info);
        if (externalization) {
          const result = applyLegacyImageExternalization(table, rows, externalization.referencesByTarget);
          externalizedTables[table] = result;
          importRows = result.rows;
          normalExistingR2UrlUnchangedRows += countUnchangedGeneratedR2Urls(rows, importRows, "result_image_url", r2PublicBaseUrl);
        }
      }
      if (table === "generation_history") {
        historyBase64ImageInfo = inspectGenerationHistoryBase64Images(rows);
        validateLegacyHistoryBase64Baseline(historyBase64ImageInfo);
        if (externalization) {
          const result = applyLegacyImageExternalization(table, rows, externalization.referencesByTarget);
          externalizedTables[table] = result;
          importRows = result.rows;
          normalExistingR2UrlUnchangedRows += countUnchangedGeneratedR2Urls(rows, importRows, "image_url", r2PublicBaseUrl);
        }
      }
      if (isAggregatedTable(table)) {
        sourceAggregates[table] = aggregateSourceTable(table, importRows);
      }
      insertTableRows(db, table, importRows);
    }

    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

    const remoteCompatibility = finalizeRemoteCompatibility();
    const remoteD1Status = remoteCompatibility.hasBlockedFields || remoteCompatibility.hasBlockedRows
      ? "REMOTE_D1_BLOCKED"
      : "REMOTE_D1_SIZE_COMPATIBLE";

    const d1Counts = countD1Rows(db, Object.keys(expectedRows));
    const countResults = Object.keys(expectedRows).map((table) => ({
      table,
      sourceRows: expectedRows[table],
      d1Rows: d1Counts[table],
      pass: expectedRows[table] === d1Counts[table],
    }));
    const countPass = countResults.every((row) => row.pass);
    if (!countPass) {
      throw new Error("D1_COUNT_RECONCILIATION_FAILED: one or more table counts differ from _backup-summary.json.");
    }

    const d1Aggregates = aggregateD1(db);
    const aggregateResults = compareAggregates(sourceAggregates, d1Aggregates);
    if (!aggregateResults.every((row) => row.pass)) {
      throw new Error("KEY_AGGREGATE_RECONCILIATION_FAILED: source JSON and D1 aggregate checks differ.");
    }

    const uniqueResults = verifyUniqueConstraints(db);
    if (!uniqueResults.every((row) => row.pass)) {
      throw new Error("D1_UNIQUE_CONSTRAINT_VERIFICATION_FAILED: duplicate data or missing unique index found.");
    }

    const d1Base64Rows = db
      .prepare("SELECT id, length(result_image_url) AS textChars FROM generation_tasks WHERE substr(result_image_url, 1, 11) = 'data:image/' ORDER BY id")
      .all();
    const sourceBase64ById = new Map(base64Info.rows.map((row) => [row.id, row]));
    const base64Retained = d1Base64Rows.length === base64Info.count &&
      d1Base64Rows.every((row) => sourceBase64ById.get(row.id)?.textChars === row.textChars);
    const externalizedD1 = externalization ? verifyLegacyExternalizedD1Rows(db, externalization) : null;
    if (externalization && !externalizedD1.pass) {
      throw new Error(`EXTERNALIZED_D1_VERIFICATION_FAILED: ${externalizedD1.reason}`);
    }
    if (!externalization && !base64Retained) {
      throw new Error("BASE64_RETENTION_CHECK_FAILED: local D1 rows do not preserve base64 result_image_url text lengths exactly.");
    }

    const localD1Bytes = fs.statSync(dbPath).size;
    const verification = {
      generatedAt: new Date().toISOString(),
      repoRoot,
      backupDir,
      dbPath,
      mode: useWranglerLocal
        ? "wrangler d1 execute --local schema bootstrap + node:sqlite prepared import"
        : "direct node:sqlite D1-compatible local import",
      sourceSha256: hashVerification,
      summaryCreatedAt: summary.createdAt,
      rechargePackages: {
        status: rechargePackagesSupplement
          ? "SUPPLEMENTAL READ-ONLY SNAPSHOT"
          : missingRechargePackages ? "SOURCE DATA MISSING" : "SOURCE DATA PRESENT",
        snapshotPath: rechargePackagesSupplement?.path ?? null,
        snapshotSha256: rechargePackagesSupplement?.sha256 ?? null,
        rowCount: rechargePackagesSupplement?.rows.length ?? (missingRechargePackages ? "UNKNOWN" : "UNVERIFIED"),
        imported: Boolean(rechargePackagesSupplement),
      },
      base64: {
        ...base64Info,
        retainedInLocalD1: externalization ? false : base64Retained,
      },
      generationHistoryOversizedImages: {
        ...historyBase64ImageInfo,
        rows: historyBase64ImageInfo.rows.filter((row) => row.textBytes >= remoteD1MaxFieldBytes),
        count: historyBase64ImageInfo.oversizedCount,
      },
      generationHistoryBase64Images: historyBase64ImageInfo,
      externalization: externalization
        ? {
            manifestPath: legacyImageManifestPath,
            legacyTaskManifestPath: externalizationManifestPath,
            stagingDir: legacyImageStagingDir,
            namespace: legacyImageNamespace,
            r2PublicBaseUrl,
            r2PublicBaseUrlSource: r2PublicBaseUrl ? "wrangler.jsonc vars.R2_PUBLIC_BASE_URL" : "UNKNOWN",
            changedRows: Object.values(externalizedTables).reduce((sum, row) => sum + row.changedRows, 0),
            taskChangedRows: externalizedTables.generation_tasks?.changedRows ?? 0,
            historyChangedRows: externalizedTables.generation_history?.changedRows ?? 0,
            unchangedNonBase64ResultImageUrlRows: externalizedTables.generation_tasks?.unchangedRows ?? 0,
            unchangedNonOversizedHistoryImageUrlRows: externalizedTables.generation_history?.unchangedRows ?? 0,
            normalExistingR2UrlUnchangedRows,
            totalReferences: externalization.references.length,
            taskReferences: externalization.summary.taskReferences,
            historyReferences: externalization.summary.historyReferences,
            uniqueBinaryImages: externalization.summary.uniqueBinaryImages,
            sharedUniqueImages: externalization.summary.sharedUniqueImages,
            taskOnlyUniqueImages: externalization.summary.taskOnlyUniqueImages,
            historyOnlyUniqueImages: externalization.summary.historyOnlyUniqueImages,
            totalDecodedBytesAfterDedupe: externalization.summary.totalDecodedBytesAfterDedupe,
            dedupeMappings: externalization.dedupeMappings,
            d1Base64Count: externalizedD1?.generationTasksDataImageCount ?? null,
            d1HistoryBase64Count: externalizedD1?.generationHistoryDataImageCount ?? null,
            d1AllDataImageCount: externalizedD1?.allDataImageOccurrences.total ?? null,
            d1AllDataImageDetails: externalizedD1?.allDataImageOccurrences.details ?? [],
            d1ProposedUrlCount: externalizedD1?.referenceUrlMatches ?? null,
            d1HistoryOversizedImageUrlCount: externalizedD1?.generationHistoryOversizedImageUrlCount ?? null,
            d1ExternalizedReferenceCount: externalizedD1?.referenceUrlMatches ?? null,
            r2ReuseSummary: externalization.manifest.r2_reuse_summary,
            stagingFileCount: externalization.staging.fileCount,
            stagingTotalBytes: externalization.staging.totalBytes,
            stagingVerificationPass: externalization.staging.pass,
          }
        : null,
      remoteD1Status,
      remoteCompatibility,
      localD1Sizes: {
        beforeExternalizeBytes: args.externalizeBase64 ? preExternalizeLocalD1Bytes : null,
        afterExternalizeBytes: args.externalizeBase64 ? localD1Bytes : null,
        currentBytes: localD1Bytes,
      },
      counts: countResults,
      aggregates: aggregateResults,
      uniqueConstraints: uniqueResults,
      scaling: collectScaleStats(),
    };

    fs.writeFileSync(verificationJsonPath, `${JSON.stringify(verification, null, 2)}\n`);
    fs.writeFileSync(reportPath, renderMarkdownReport(verification));

    console.log(JSON.stringify({
      ok: !(remoteCompatibility.hasBlockedFields || remoteCompatibility.hasBlockedRows),
      status: remoteD1Status,
      dbPath,
      reportPath,
      verificationJsonPath,
      sourceSha256: `${hashVerification.matches}/${hashVerification.total}`,
      base64Count: base64Info.count,
      base64DecodedBytes: base64Info.totalDecodedBytes,
      historyBase64ImageCount: historyBase64ImageInfo.count,
      historyBase64DecodedBytes: historyBase64ImageInfo.totalDecodedBytes,
      historyOversizedImageCount: historyBase64ImageInfo.oversizedCount,
      rechargePackagesRows: rechargePackagesSupplement?.rows.length ?? null,
      externalizedRows: externalization ? Object.values(externalizedTables).reduce((sum, row) => sum + row.changedRows, 0) : 0,
      externalizedTaskRows: externalizedTables.generation_tasks?.changedRows ?? 0,
      externalizedHistoryRows: externalizedTables.generation_history?.changedRows ?? 0,
      uniqueLegacyImageObjects: externalization?.summary.uniqueBinaryImages ?? null,
      d1Base64Count: externalizedD1?.generationTasksDataImageCount ?? d1Base64Rows.length,
      d1HistoryBase64Count: externalizedD1?.generationHistoryDataImageCount ?? null,
      d1AllDataImageCount: externalizedD1?.allDataImageOccurrences.total ?? null,
      d1HistoryOversizedImageUrlCount: externalizedD1?.generationHistoryOversizedImageUrlCount ?? null,
      d1ExternalizedReferenceCount: externalizedD1?.referenceUrlMatches ?? null,
      remoteD1Blocked: remoteCompatibility.hasBlockedFields || remoteCompatibility.hasBlockedRows,
      countPass,
      aggregatePass: true,
      uniquePass: true,
    }, null, 2));
    if (remoteCompatibility.hasBlockedFields || remoteCompatibility.hasBlockedRows) {
      process.exitCode = 2;
    }
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const parsed = { direct: false, dbPath: null, backupDir: null, externalizeBase64: false, beforeExternalizeBytes: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--direct") {
      parsed.direct = true;
    } else if (arg === "--externalize-base64") {
      parsed.externalizeBase64 = true;
    } else if (arg === "--db-path") {
      parsed.dbPath = argv[++i];
    } else if (arg.startsWith("--db-path=")) {
      parsed.dbPath = arg.slice("--db-path=".length);
    } else if (arg === "--backup-dir") {
      parsed.backupDir = argv[++i];
    } else if (arg.startsWith("--backup-dir=")) {
      parsed.backupDir = arg.slice("--backup-dir=".length);
    } else if (arg === "--before-externalize-bytes") {
      parsed.beforeExternalizeBytes = parseByteCount(argv[++i], arg);
    } else if (arg.startsWith("--before-externalize-bytes=")) {
      parsed.beforeExternalizeBytes = parseByteCount(arg.slice("--before-externalize-bytes=".length), "--before-externalize-bytes");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function parseByteCount(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`INVALID_BYTE_COUNT: ${label}=${String(value)}`);
  }
  return parsed;
}

function toSetMap(input) {
  return Object.fromEntries(Object.entries(input).map(([table, columns]) => [table, new Set(columns)]));
}

function assertInsideRepo(targetPath, rootPath, label) {
  const relative = path.relative(rootPath, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`REFUSING_OUTSIDE_REPO_WRITE: ${label} resolved to ${targetPath}`);
  }
}

function verifySourceHashes(sourceDir) {
  const csvPath = path.join(sourceDir, "SHA256SUMS.csv");
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const [header, ...dataRows] = rows;
  const firstHeader = header?.[0]?.replace(/^\uFEFF/, "");
  const secondHeader = header?.[1]?.replace(/^\uFEFF/, "");
  if (firstHeader !== "Path" || secondHeader !== "Hash") {
    throw new Error("Invalid SHA256SUMS.csv header");
  }
  const results = [];
  for (const [filePath, expectedHash] of dataRows) {
    if (path.basename(filePath) === "SHA256SUMS.csv") continue;
    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
    const expected = expectedHash.toUpperCase();
    results.push({ path: filePath, expected, actual: actualHash, match: actualHash === expected });
  }
  const matches = results.filter((row) => row.match).length;
  return {
    total: results.length,
    matches,
    allMatch: results.length === 37 && matches === results.length,
    mismatches: results.filter((row) => !row.match),
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((line) => line.length > 1 || line[0] !== "");
}

function readBackupSummary(sourceDir) {
  const summary = JSON.parse(fs.readFileSync(path.join(sourceDir, "_backup-summary.json"), "utf8"));
  if (!Array.isArray(summary.tables)) throw new Error("Invalid _backup-summary.json: tables array missing");
  return summary;
}

function bootstrapWranglerLocalD1() {
  fs.rmSync(wranglerD1StateDir, { recursive: true, force: true });
  try {
    for (const migrationPath of readMigrationSqlFiles()) {
      runWrangler(["d1", "execute", "DB", "--local", "--file", migrationPath]);
    }
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(`LOCAL_D1_BOOTSTRAP_FAILED: wrangler d1 execute --local failed.\n${stdout}\n${stderr}`);
  }

  const sqliteFiles = findSqliteFiles(wranglerD1StateDir);
  if (sqliteFiles.length === 0) {
    throw new Error(`LOCAL_D1_BOOTSTRAP_FAILED: no SQLite file found under ${wranglerD1StateDir}`);
  }
  sqliteFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return sqliteFiles[0];
}

function runWrangler(args) {
  const options = {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 20,
  };
  if (process.platform === "win32") {
    const command = ["npx", "--yes", "wrangler", ...args].map(quoteCmdArg).join(" ");
    return execFileSync("cmd.exe", ["/d", "/s", "/c", command], options);
  }
  return execFileSync("npx", ["--yes", "wrangler", ...args], options);
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[\s&()^|<>"]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function bootstrapDirectSqlite(dbPath) {
  assertInsideRepo(dbPath, repoRoot, "direct local database");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  const db = new DatabaseSync(dbPath);
  try {
    for (const migrationPath of readMigrationSqlFiles()) {
      db.exec(fs.readFileSync(migrationPath, "utf8"));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

function readMigrationSqlFiles() {
  if (!fs.existsSync(migrationsDir)) throw new Error(`MIGRATIONS_DIR_MISSING: ${migrationsDir}`);
  return fs.readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(migrationsDir, name));
}

function findSqliteFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSqliteFiles(fullPath));
    } else if (/\.(sqlite|sqlite3|db)$/i.test(entry.name)) {
      found.push(fullPath);
    }
  }
  return found;
}

function readTableJson(sourceDir, table) {
  if (table === "recharge_packages") {
    const supplement = readRechargePackagesSupplement();
    if (!supplement) return [];
    return supplement.rows;
  }
  return JSON.parse(fs.readFileSync(path.join(sourceDir, `${table}.json`), "utf8"));
}

function readRechargePackagesSupplement() {
  if (!fs.existsSync(rechargePackagesSupplementPath)) return null;
  assertInsideRepo(rechargePackagesSupplementPath, repoRoot, "recharge_packages supplement");
  const payload = fs.readFileSync(rechargePackagesSupplementPath);
  const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
  if (sha256 !== expectedRechargePackagesSupplementSha256) {
    throw new Error(`RECHARGE_PACKAGES_SUPPLEMENT_SHA256_MISMATCH: expected ${expectedRechargePackagesSupplementSha256}, found ${sha256}`);
  }
  const rows = JSON.parse(payload.toString("utf8"));
  if (!Array.isArray(rows) || rows.length !== expectedRechargePackagesRows) {
    throw new Error(`RECHARGE_PACKAGES_SUPPLEMENT_ROW_COUNT_MISMATCH: expected ${expectedRechargePackagesRows}, found ${Array.isArray(rows) ? rows.length : "non-array"}`);
  }
  return { path: rechargePackagesSupplementPath, sha256, rows };
}

function insertTableRows(db, table, rows) {
  const columns = tableColumns[table];
  if (!columns) throw new Error(`No column mapping for table ${table}`);
  if (rows.length === 0) return;

  const columnSql = columns.map((column) => quoteIdent(column)).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(`INSERT INTO ${quoteIdent(table)} (${columnSql}) VALUES (${placeholders})`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const values = columns.map((column) => convertValue(table, column, row[column]));
      recordRemoteCompatibility(table, row, columns, values);
      statement.run(...values);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    const message = String(error?.message || error);
    if (table === "generation_tasks" && /too big|too large|SQLITE_TOOBIG|length/i.test(message)) {
      throw new Error(`BASE64_EXTERNALIZATION_REQUIRED: local D1/SQLite rejected generation_tasks.result_image_url size. ${message}`);
    }
    throw new Error(`IMPORT_FAILED: table=${table}; ${message}`);
  }
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function convertValue(table, column, value) {
  if (value === undefined) return null;
  if (booleanColumns[table]?.has(column)) return booleanToInteger(value, `${table}.${column}`);
  if (jsonTextColumns[table]?.has(column)) return jsonToText(value);
  if (centiCreditColumns[table]?.has(column)) {
    const scaled = decimalToScaledInteger(value, 2, `${table}.${column}`);
    recordScale("centi-credit", table, column, scaled);
    return scaled;
  }
  if (fenColumns[table]?.has(column)) {
    const scaled = decimalToScaledInteger(value, 2, `${table}.${column}`);
    recordScale("fen", table, column, scaled);
    return scaled;
  }
  return value;
}

function booleanToInteger(value, label) {
  if (value === null) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === 1 || value === "1" || value === "true") return 1;
  if (value === 0 || value === "0" || value === "false") return 0;
  throw new Error(`INVALID_BOOLEAN: ${label}=${String(value)}`);
}

function jsonToText(value) {
  if (value === null) return null;
  return JSON.stringify(value);
}

function decimalToScaledInteger(value, scale, label) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeDecimalString(String(value).trim(), label);
  const match = normalized.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`INVALID_DECIMAL: ${label}=${String(value)}`);

  const sign = match[1] === "-" ? -1n : 1n;
  const integerPart = BigInt(match[2]);
  const fraction = match[3] ?? "";
  const extraFraction = fraction.slice(scale);
  if (/[^0]/.test(extraFraction)) {
    throw new Error(`NON_INTEGER_SCALE_RESULT: ${label}=${String(value)} cannot scale by 10^${scale} without fractional remainder`);
  }
  const paddedFraction = fraction.slice(0, scale).padEnd(scale, "0");
  const factor = 10n ** BigInt(scale);
  const scaled = sign * ((integerPart * factor) + BigInt(paddedFraction || "0"));
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`SCALED_INTEGER_OUT_OF_SAFE_RANGE: ${label}=${String(value)}`);
  }
  return Number(scaled);
}

function normalizeDecimalString(input, label) {
  if (!/[eE]/.test(input)) return input;
  const match = input.match(/^([+-])?(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) throw new Error(`INVALID_EXPONENTIAL_DECIMAL: ${label}=${input}`);
  const sign = match[1] ?? "";
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number.parseInt(match[4], 10);
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function recordScale(kind, table, column, scaled) {
  const key = `${table}.${column}`;
  const current = scaleStats.get(key) ?? { field: key, kind, count: 0, min: null, max: null };
  current.count += 1;
  current.min = current.min === null ? scaled : Math.min(current.min, scaled);
  current.max = current.max === null ? scaled : Math.max(current.max, scaled);
  scaleStats.set(key, current);
}

function collectScaleStats() {
  return Array.from(scaleStats.values()).sort((a, b) => a.field.localeCompare(b.field));
}

function inspectGenerationTaskBase64(rows) {
  const base64Rows = [];
  for (const row of rows) {
    const value = row.result_image_url;
    if (typeof value !== "string") continue;
    const parsed = parseImageDataUrl(value);
    if (!parsed) continue;
    const decoded = Buffer.from(parsed.base64, "base64");
    base64Rows.push({
      id: row.id,
      requestId: row.request_id,
      mimeType: parsed.mimeType,
      extension: extensionForMime(parsed.mimeType),
      encodedBytes: Buffer.byteLength(parsed.base64, "utf8"),
      decodedBytes: decoded.byteLength,
      sha256: crypto.createHash("sha256").update(decoded).digest("hex"),
      textChars: value.length,
      textBytes: Buffer.byteLength(value, "utf8"),
    });
  }
  return {
    count: base64Rows.length,
    totalDecodedBytes: base64Rows.reduce((sum, row) => sum + row.decodedBytes, 0),
    totalTextBytes: base64Rows.reduce((sum, row) => sum + row.textBytes, 0),
    rows: base64Rows.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function parseImageDataUrl(value) {
  const match = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]*)$/);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
}

function extensionForMime(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error(`UNSUPPORTED_BASE64_IMAGE_MIME: ${mimeType}`);
}

function validateLegacyBase64Baseline(base64Info) {
  if (base64Info.count !== expectedLegacyBase64Rows) {
    throw new Error(`LEGACY_BASE64_COUNT_MISMATCH: expected ${expectedLegacyBase64Rows}, found ${base64Info.count}`);
  }
  if (base64Info.totalDecodedBytes !== expectedLegacyBase64DecodedBytes) {
    throw new Error(`LEGACY_BASE64_DECODED_BYTES_MISMATCH: expected ${expectedLegacyBase64DecodedBytes}, found ${base64Info.totalDecodedBytes}`);
  }
}

function inspectGenerationHistoryBase64Images(rows) {
  const base64Rows = [];
  for (const row of rows) {
    const value = row.image_url;
    if (typeof value !== "string") continue;
    const textBytes = Buffer.byteLength(value, "utf8");
    const parsed = parseImageDataUrl(value);
    if (!parsed) continue;
    let decoded = null;
    let sha256 = null;
    decoded = Buffer.from(parsed.base64, "base64");
    sha256 = crypto.createHash("sha256").update(decoded).digest("hex");
    base64Rows.push({
      id: row.id,
      generationTaskId: row.generation_task_id ?? null,
      userId: row.user_id,
      imageUrlType: `data:${parsed.mimeType};base64`,
      mimeType: parsed.mimeType,
      extension: extensionForMime(parsed.mimeType),
      encodedBytes: Buffer.byteLength(parsed.base64, "utf8"),
      decodedBytes: decoded.byteLength,
      sha256,
      textChars: value.length,
      textBytes,
    });
  }
  return {
    count: base64Rows.length,
    oversizedCount: base64Rows.filter((row) => row.textBytes >= remoteD1MaxFieldBytes).length,
    totalDecodedBytes: base64Rows.reduce((sum, row) => sum + row.decodedBytes, 0),
    totalTextBytes: base64Rows.reduce((sum, row) => sum + row.textBytes, 0),
    nonDataUrlCount: 0,
    rows: base64Rows.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function classifyImageUrl(value) {
  if (typeof value !== "string") return "NULL_OR_NON_STRING";
  if (/^https?:\/\//i.test(value)) return "http";
  if (value.startsWith("data:")) return "data-url-non-image-or-non-base64";
  return "other";
}

function validateLegacyHistoryBase64Baseline(historyInfo) {
  if (historyInfo.count !== expectedLegacyHistoryBase64Rows) {
    throw new Error(`LEGACY_HISTORY_BASE64_COUNT_MISMATCH: expected ${expectedLegacyHistoryBase64Rows}, found ${historyInfo.count}`);
  }
  if (historyInfo.nonDataUrlCount !== 0) {
    throw new Error(`LEGACY_HISTORY_NON_DATA_URL_FOUND: ${historyInfo.nonDataUrlCount} rows require manual analysis before conversion`);
  }
}

function prepareLegacyImageExternalization({ generationTaskRows, generationHistoryRows, r2PublicBaseUrl }) {
  const base64Info = inspectGenerationTaskBase64(generationTaskRows);
  validateLegacyBase64Baseline(base64Info);
  const historyInfo = inspectGenerationHistoryBase64Images(generationHistoryRows);
  validateLegacyHistoryBase64Baseline(historyInfo);

  assertInsideRepo(legacyImageStagingDir, repoRoot, "legacy image staging directory");
  fs.rmSync(legacyImageStagingDir, { recursive: true, force: true });
  fs.mkdirSync(legacyImageStagingDir, { recursive: true });

  const objectsBySha = new Map();
  const references = [];
  const taskRowsById = new Map(generationTaskRows.map((row) => [row.id, row]));
  const taskShaById = new Map();

  for (const rowInfo of base64Info.rows) {
    const sourceRow = taskRowsById.get(rowInfo.id);
    const reference = addLegacyImageReference({
      objectsBySha,
      references,
      table: "generation_tasks",
      row: sourceRow,
      column: "result_image_url",
      generationTaskId: sourceRow.id,
      requestId: sourceRow.request_id,
      r2PublicBaseUrl,
    });
    taskShaById.set(sourceRow.id, reference.sha256);
  }

  for (const rowInfo of historyInfo.rows) {
    const sourceRow = generationHistoryRows.find((row) => row.id === rowInfo.id);
    addLegacyImageReference({
      objectsBySha,
      references,
      table: "generation_history",
      row: sourceRow,
      column: "image_url",
      generationTaskId: sourceRow.generation_task_id ?? null,
      r2PublicBaseUrl,
    });
  }

  const objects = Array.from(objectsBySha.values())
    .sort((a, b) => a.sha256.localeCompare(b.sha256));
  const previousManifest = readLegacyImageManifestIfPresent();
  const previousObjectsBySha = new Map((previousManifest?.objects ?? []).map((object) => [object.sha256, object]));
  for (const object of objects) {
    applyLegacyR2Status(object, previousObjectsBySha.get(object.sha256));
    const stagingPath = path.join(legacyImageStagingDir, object.staging_filename);
    assertInsideRepo(stagingPath, repoRoot, "legacy image staging file");
    writeStagingFile(stagingPath, object._decoded, object.sha256);
    delete object._decoded;
  }

  const stagingVerification = verifyLegacyStagingFiles(objects);
  if (!stagingVerification.pass) {
    throw new Error(`LEGACY_IMAGE_STAGING_VERIFICATION_FAILED: ${stagingVerification.reason}`);
  }

  const taskHashes = new Set(references.filter((row) => row.table === "generation_tasks").map((row) => row.sha256));
  const historyHashes = new Set(references.filter((row) => row.table === "generation_history").map((row) => row.sha256));
  const sharedUniqueImages = Array.from(taskHashes).filter((sha256) => historyHashes.has(sha256)).length;
  const taskOnlyUniqueImages = Array.from(taskHashes).filter((sha256) => !historyHashes.has(sha256)).length;
  const historyOnlyUniqueImages = Array.from(historyHashes).filter((sha256) => !taskHashes.has(sha256)).length;
  const dedupeMappings = historyInfo.rows.map((row) => ({
    history_id: row.id,
    generation_task_id: row.generationTaskId,
    user_id: row.userId,
    mime_type: row.mimeType,
    encoded_bytes: row.encodedBytes,
    decoded_bytes: row.decodedBytes,
    sha256: row.sha256,
    maps_to_generation_task: row.generationTaskId != null && taskRowsById.has(row.generationTaskId),
    same_sha256: row.generationTaskId != null && taskShaById.get(row.generationTaskId) === row.sha256,
  }));

  const referencesWithUrls = objects.flatMap((object) => object.references.map((reference) => ({
    ...reference,
    sha256: object.sha256,
    status: object.status,
    final_public_url: object.final_public_url,
  })));

  const statusCounts = groupCounts(objects, "status");
  const unresolvedObjects = objects.filter((object) => !object.final_public_url);
  if (unresolvedObjects.length > 0) {
    const statuses = unresolvedObjects.map((object) => `${object.sha256}:${object.status}`).join(", ");
    throw new Error(`REMOTE_D1_BLOCKED: legacy image objects are not safe to externalize: ${statuses}`);
  }

  const manifest = {
    version: 2,
    created_at: new Date().toISOString(),
    source_backup: backupDir,
    generated_namespace: "generated/",
    fallback_namespace: legacyImageNamespace,
    r2_public_base_url: r2PublicBaseUrl ?? "UNKNOWN",
    source_scan: {
      task_references: base64Info.count,
      history_references: historyInfo.count,
      total_references: referencesWithUrls.length,
      shared_task_history_binaries: sharedUniqueImages,
      task_only_binaries: taskOnlyUniqueImages,
      history_only_binaries: historyOnlyUniqueImages,
      unique_binaries: objects.length,
      decoded_bytes_after_dedupe: objects.reduce((sum, object) => sum + object.decoded_bytes, 0),
    },
    r2_reuse_summary: {
      ALREADY_IN_R2: statusCounts.ALREADY_IN_R2 ?? 0,
      NEEDS_UPLOAD: statusCounts.NEEDS_UPLOAD ?? 0,
      AMBIGUOUS: statusCounts.AMBIGUOUS ?? 0,
      MISMATCH: statusCounts.MISMATCH ?? 0,
    },
    key_generation_rule: previousManifest?.key_generation_rule ?? null,
    relationship_audit: previousManifest?.relationship_audit ?? [],
    objects,
  };
  writeLegacyImageManifest(manifest);

  const referencesByTarget = new Map(referencesWithUrls.map((reference) => [makeReferenceKey(reference.table, reference.row_id, reference.column), reference]));
  return {
    manifest,
    base64Info,
    historyInfo,
    objects,
    objectsBySha: new Map(objects.map((object) => [object.sha256, object])),
    references: referencesWithUrls,
    referencesByTarget,
    dedupeMappings,
    statusCounts,
    staging: stagingVerification,
    summary: {
      taskReferences: base64Info.count,
      historyReferences: historyInfo.count,
      totalReferences: referencesWithUrls.length,
      uniqueBinaryImages: objects.length,
      sharedUniqueImages,
      taskOnlyUniqueImages,
      historyOnlyUniqueImages,
      totalDecodedBytesAfterDedupe: objects.reduce((sum, object) => sum + object.decoded_bytes, 0),
    },
  };
}

function addLegacyImageReference({ objectsBySha, references, table, row, column, generationTaskId, requestId, r2PublicBaseUrl }) {
  if (!row) throw new Error(`LEGACY_IMAGE_SOURCE_ROW_MISSING: ${table}.${column}`);
  const parsed = parseImageDataUrl(row[column]);
  if (!parsed) {
    throw new Error(`LEGACY_IMAGE_TARGET_NOT_DATA_URL: ${table}.${column} row ${getRowIdentifier(row)}`);
  }
  const decoded = Buffer.from(parsed.base64, "base64");
  const sha256 = crypto.createHash("sha256").update(decoded).digest("hex");
  const extension = extensionForMime(parsed.mimeType);
  const stagingFilename = `${sha256}.${extension}`;
  const fallbackProposedR2Key = `${legacyImageNamespace}/${stagingFilename}`;
  const fallbackProposedPublicUrl = r2PublicBaseUrl ? `${r2PublicBaseUrl}/${fallbackProposedR2Key}` : "UNKNOWN";
  let object = objectsBySha.get(sha256);
  if (!object) {
    object = {
      sha256,
      mime_type: parsed.mimeType,
      decoded_bytes: decoded.byteLength,
      staging_filename: stagingFilename,
      status: "NEEDS_UPLOAD",
      existing_r2_key: null,
      existing_r2_url: null,
      fallback_proposed_r2_key: fallbackProposedR2Key,
      fallback_proposed_public_url: fallbackProposedPublicUrl,
      final_r2_key: null,
      final_public_url: null,
      references: [],
      _decoded: decoded,
    };
    objectsBySha.set(sha256, object);
  } else if (object.mime_type !== parsed.mimeType || object.decoded_bytes !== decoded.byteLength) {
    throw new Error(`LEGACY_IMAGE_HASH_COLLISION_OR_METADATA_MISMATCH: ${sha256}`);
  }

  const manifestReference = {
    table,
    row_id: getRowIdentifier(row),
    column,
    generation_task_id: generationTaskId,
  };
  if (requestId != null) manifestReference.request_id = requestId;
  object.references.push(manifestReference);

  const reference = {
    ...manifestReference,
    sha256,
  };
  references.push(reference);
  return reference;
}

function readLegacyImageManifestIfPresent() {
  if (!fs.existsSync(legacyImageManifestPath)) return null;
  const text = fs.readFileSync(legacyImageManifestPath, "utf8");
  if (/data:image\//i.test(text)) {
    throw new Error("LEGACY_IMAGE_MANIFEST_FORBIDDEN_CONTENT: existing manifest contains a data URL marker");
  }
  return JSON.parse(text);
}

function applyLegacyR2Status(object, previousObject) {
  const previousStatus = previousObject?.status;
  const status = previousStatus ?? "NEEDS_UPLOAD";
  if (!["ALREADY_IN_R2", "NEEDS_UPLOAD", "AMBIGUOUS", "MISMATCH"].includes(status)) {
    throw new Error(`LEGACY_IMAGE_UNKNOWN_R2_STATUS: ${object.sha256} ${status}`);
  }

  object.status = status;
  object.existing_r2_key = previousObject?.existing_r2_key ?? null;
  object.existing_r2_url = previousObject?.existing_r2_url ?? null;
  object.fallback_proposed_r2_key = previousObject?.fallback_proposed_r2_key ?? object.fallback_proposed_r2_key;
  object.fallback_proposed_public_url = previousObject?.fallback_proposed_public_url ?? object.fallback_proposed_public_url;
  if (previousObject?.r2_reuse_audit) object.r2_reuse_audit = previousObject.r2_reuse_audit;

  if (status === "ALREADY_IN_R2") {
    if (!object.existing_r2_url || !object.existing_r2_key) {
      throw new Error(`LEGACY_IMAGE_ALREADY_IN_R2_MISSING_URL_OR_KEY: ${object.sha256}`);
    }
    object.final_r2_key = object.existing_r2_key;
    object.final_public_url = object.existing_r2_url;
    return;
  }

  if (status === "NEEDS_UPLOAD") {
    if (!object.fallback_proposed_public_url || object.fallback_proposed_public_url === "UNKNOWN") {
      throw new Error(`R2_PUBLIC_HOST_UNKNOWN: cannot externalize legacy image ${object.sha256} without a fallback public URL`);
    }
    object.final_r2_key = object.fallback_proposed_r2_key;
    object.final_public_url = object.fallback_proposed_public_url;
    return;
  }

  object.final_r2_key = null;
  object.final_public_url = null;
}

function writeLegacyImageManifest(manifest) {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (/data:image\//i.test(text) || /base64/i.test(text) || /api[_-]?key|secret|token|private[_-]?key/i.test(text)) {
    throw new Error("LEGACY_IMAGE_MANIFEST_FORBIDDEN_CONTENT: manifest would contain a data URL, base64 marker, or secret-like key");
  }
  fs.writeFileSync(legacyImageManifestPath, text);
}

function verifyLegacyStagingFiles(objects) {
  let totalBytes = 0;
  for (const object of objects) {
    const stagingPath = path.join(legacyImageStagingDir, object.staging_filename);
    if (!fs.existsSync(stagingPath)) {
      return { pass: false, reason: `missing ${object.staging_filename}` };
    }
    const bytes = fs.statSync(stagingPath).size;
    const hash = crypto.createHash("sha256").update(fs.readFileSync(stagingPath)).digest("hex");
    if (hash !== object.sha256) {
      return { pass: false, reason: `sha256 mismatch ${object.staging_filename}` };
    }
    if (!object.staging_filename.startsWith(`${object.sha256}.`)) {
      return { pass: false, reason: `filename does not start with sha256 ${object.staging_filename}` };
    }
    if (bytes !== object.decoded_bytes) {
      return { pass: false, reason: `decoded byte mismatch ${object.staging_filename}` };
    }
    totalBytes += bytes;
  }
  const fileCount = fs.readdirSync(legacyImageStagingDir).filter((name) => !name.startsWith(".")).length;
  if (fileCount !== objects.length) {
    return { pass: false, reason: `expected ${objects.length} staging files, found ${fileCount}`, fileCount, totalBytes };
  }
  return { pass: true, fileCount, totalBytes };
}

function makeReferenceKey(table, rowId, column) {
  return `${table}:${rowId}:${column}`;
}

function countUnchangedGeneratedR2Urls(sourceRows, importRows, column, r2PublicBaseUrl) {
  if (!r2PublicBaseUrl) return 0;
  const prefix = `${r2PublicBaseUrl}/generated/`;
  let count = 0;
  for (let index = 0; index < sourceRows.length; index += 1) {
    const sourceValue = sourceRows[index]?.[column];
    if (typeof sourceValue !== "string" || !sourceValue.startsWith(prefix)) continue;
    if (importRows[index]?.[column] !== sourceValue) {
      throw new Error(`NORMAL_R2_URL_MUTATED: ${column} row ${getRowIdentifier(sourceRows[index])}`);
    }
    count += 1;
  }
  return count;
}

function applyLegacyImageExternalization(table, rows, referencesByTarget) {
  let changedRows = 0;
  let unchangedRows = 0;
  const columns = table === "generation_tasks" ? ["result_image_url"] : table === "generation_history" ? ["image_url"] : [];
  const transformed = rows.map((row) => {
    let nextRow = row;
    let changed = false;
    for (const column of columns) {
      const reference = referencesByTarget.get(makeReferenceKey(table, getRowIdentifier(row), column));
      if (!reference) continue;
      if (!reference.final_public_url || reference.final_public_url === "UNKNOWN") {
        throw new Error(`REMOTE_D1_BLOCKED: cannot externalize ${table}.${column} row ${getRowIdentifier(row)} without a final public URL`);
      }
      const original = row[column];
      if (!parseImageDataUrl(original)) {
        throw new Error(`LEGACY_IMAGE_EXTERNALIZATION_TARGET_NOT_DATA_URL: ${table}.${column} row ${getRowIdentifier(row)}`);
      }
      nextRow = { ...nextRow, [column]: reference.final_public_url };
      changed = true;
    }
    if (changed) changedRows += 1;
    else unchangedRows += 1;
    return nextRow;
  });

  const expectedChangedRows = table === "generation_tasks" ? expectedLegacyBase64Rows : expectedLegacyHistoryBase64Rows;
  if (changedRows !== expectedChangedRows) {
    throw new Error(`LEGACY_IMAGE_EXTERNALIZATION_CHANGED_ROWS_MISMATCH: ${table} expected ${expectedChangedRows}, changed ${changedRows}`);
  }
  return { rows: transformed, changedRows, unchangedRows };
}

function verifyLegacyExternalizedD1Rows(db, externalization) {
  const generationTasksDataImageCount = db
    .prepare("SELECT COUNT(*) AS count FROM generation_tasks WHERE substr(result_image_url, 1, 11) = 'data:image/'")
    .get().count;
  const generationHistoryDataImageCount = db
    .prepare("SELECT COUNT(*) AS count FROM generation_history WHERE substr(image_url, 1, 11) = 'data:image/'")
    .get().count;
  const generationHistoryOversizedImageUrlCount = db
    .prepare("SELECT COUNT(*) AS count FROM generation_history WHERE image_url IS NOT NULL AND length(CAST(image_url AS BLOB)) >= ?")
    .get(remoteD1MaxFieldBytes).count;
  const allDataImageOccurrences = countD1DataImageOccurrences(db);

  let referenceUrlMatches = 0;
  for (const reference of externalization.references) {
    const row = db
      .prepare(`SELECT ${quoteIdent(reference.column)} AS value FROM ${quoteIdent(reference.table)} WHERE id = ?`)
      .get(reference.row_id);
    if (!row) {
      return {
        pass: false,
        reason: `missing ${reference.table} row ${reference.row_id}`,
        generationTasksDataImageCount,
        generationHistoryDataImageCount,
        generationHistoryOversizedImageUrlCount,
        allDataImageOccurrences,
        referenceUrlMatches,
      };
    }
    if (row.value !== reference.final_public_url) {
      return {
        pass: false,
        reason: `URL mismatch ${reference.table}.${reference.column} row ${reference.row_id}`,
        generationTasksDataImageCount,
        generationHistoryDataImageCount,
        generationHistoryOversizedImageUrlCount,
        allDataImageOccurrences,
        referenceUrlMatches,
      };
    }
    referenceUrlMatches += 1;
  }

  return {
    pass: generationTasksDataImageCount === 0 &&
      generationHistoryDataImageCount === 0 &&
      generationHistoryOversizedImageUrlCount === 0 &&
      allDataImageOccurrences.total === 0 &&
      referenceUrlMatches === externalization.references.length,
    generationTasksDataImageCount,
    generationHistoryDataImageCount,
    generationHistoryOversizedImageUrlCount,
    allDataImageOccurrences,
    referenceUrlMatches,
  };
}

function countD1DataImageOccurrences(db) {
  const details = [];
  let total = 0;
  for (const [table, columns] of Object.entries(tableColumns)) {
    for (const column of columns) {
      const count = db
        .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)} WHERE substr(CAST(${quoteIdent(column)} AS TEXT), 1, 11) = 'data:image/'`)
        .get().count;
      if (count > 0) details.push({ table, column, count });
      total += count;
    }
  }
  return { total, details };
}

function prepareBase64Externalization(generationTaskRows, r2PublicBaseUrl) {
  const base64Info = inspectGenerationTaskBase64(generationTaskRows);
  validateLegacyBase64Baseline(base64Info);
  fs.mkdirSync(stagingImageDir, { recursive: true });

  const records = [];
  for (const row of base64Info.rows) {
    assertSafeTaskId(row.id);
    const sourceRow = generationTaskRows.find((task) => task.id === row.id);
    const parsed = parseImageDataUrl(sourceRow.result_image_url);
    const decoded = Buffer.from(parsed.base64, "base64");
    const decodedHash = crypto.createHash("sha256").update(decoded).digest("hex");
    if (decodedHash !== row.sha256) {
      throw new Error(`BASE64_DECODE_HASH_UNSTABLE: task ${row.id}`);
    }

    const stagingFilename = `${row.id}.${row.extension}`;
    const stagingPath = path.join(stagingImageDir, stagingFilename);
    assertInsideRepo(stagingPath, repoRoot, "base64 staging file");
    writeStagingFile(stagingPath, decoded, decodedHash);

    const proposedR2Key = `${externalizedNamespace}/${row.id}.${row.extension}`;
    const proposedPublicUrl = r2PublicBaseUrl ? `${r2PublicBaseUrl}/${proposedR2Key}` : "UNKNOWN";
    records.push({
      task_id: row.id,
      request_id: row.requestId,
      mime_type: row.mimeType,
      encoded_bytes: row.encodedBytes,
      decoded_bytes: row.decodedBytes,
      sha256: row.sha256,
      staging_filename: stagingFilename,
      proposed_r2_key: proposedR2Key,
      proposed_public_url: proposedPublicUrl,
    });
  }

  const stagingVerification = verifyStagingFiles(records);
  if (!stagingVerification.pass) {
    throw new Error(`BASE64_STAGING_VERIFICATION_FAILED: ${stagingVerification.reason}`);
  }

  const manifest = {
    version: 1,
    created_at: new Date().toISOString(),
    source_backup: backupDir,
    r2_namespace: externalizedNamespace,
    r2_public_base_url: r2PublicBaseUrl ?? "UNKNOWN",
    records,
  };
  fs.writeFileSync(externalizationManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    records,
    recordsByTaskId: new Map(records.map((record) => [record.task_id, record])),
    staging: stagingVerification,
  };
}

function assertSafeTaskId(taskId) {
  if (!/^[0-9a-fA-F-]{36}$/.test(taskId)) {
    throw new Error(`UNSAFE_TASK_ID_FOR_FILENAME: ${taskId}`);
  }
}

function writeStagingFile(stagingPath, decoded, expectedHash) {
  if (fs.existsSync(stagingPath)) {
    const currentHash = crypto.createHash("sha256").update(fs.readFileSync(stagingPath)).digest("hex");
    if (currentHash !== expectedHash) {
      throw new Error(`STAGING_FILE_COLLISION: ${stagingPath} exists with different content`);
    }
    return;
  }
  fs.writeFileSync(stagingPath, decoded);
}

function verifyStagingFiles(records) {
  let totalBytes = 0;
  for (const record of records) {
    const stagingPath = path.join(stagingImageDir, record.staging_filename);
    if (!fs.existsSync(stagingPath)) {
      return { pass: false, reason: `missing ${record.staging_filename}` };
    }
    const bytes = fs.statSync(stagingPath).size;
    const hash = crypto.createHash("sha256").update(fs.readFileSync(stagingPath)).digest("hex");
    if (hash !== record.sha256) {
      return { pass: false, reason: `sha256 mismatch ${record.staging_filename}` };
    }
    if (bytes !== record.decoded_bytes) {
      return { pass: false, reason: `decoded byte mismatch ${record.staging_filename}` };
    }
    totalBytes += bytes;
  }
  const fileCount = fs.readdirSync(stagingImageDir).filter((name) => !name.startsWith(".")).length;
  if (fileCount !== expectedLegacyBase64Rows) {
    return { pass: false, reason: `expected ${expectedLegacyBase64Rows} staging files, found ${fileCount}`, fileCount, totalBytes };
  }
  if (totalBytes !== expectedLegacyBase64DecodedBytes) {
    return { pass: false, reason: `expected ${expectedLegacyBase64DecodedBytes} staging bytes, found ${totalBytes}`, fileCount, totalBytes };
  }
  return { pass: true, fileCount, totalBytes };
}

function applyBase64Externalization(rows, recordsByTaskId) {
  let changedRows = 0;
  let unchangedNonBase64ResultImageUrlRows = 0;
  const transformed = rows.map((row) => {
    const record = recordsByTaskId.get(row.id);
    if (!record) {
      unchangedNonBase64ResultImageUrlRows += 1;
      return row;
    }
    if (record.proposed_public_url === "UNKNOWN") {
      throw new Error(`R2_PUBLIC_HOST_UNKNOWN: cannot externalize task ${row.id} without a proposed public URL`);
    }
    const original = row.result_image_url;
    if (!parseImageDataUrl(original)) {
      throw new Error(`BASE64_EXTERNALIZATION_TARGET_NOT_DATA_URL: ${row.id}`);
    }
    changedRows += 1;
    return { ...row, result_image_url: record.proposed_public_url };
  });
  if (changedRows !== expectedLegacyBase64Rows) {
    throw new Error(`BASE64_EXTERNALIZATION_CHANGED_ROWS_MISMATCH: expected ${expectedLegacyBase64Rows}, changed ${changedRows}`);
  }
  return { rows: transformed, changedRows, unchangedNonBase64ResultImageUrlRows };
}

function verifyExternalizedD1Rows(db, records) {
  const base64Count = db.prepare("SELECT COUNT(*) AS count FROM generation_tasks WHERE result_image_url LIKE 'data:image/%;base64,%'").get().count;
  let proposedUrlCount = 0;
  for (const record of records) {
    const row = db.prepare("SELECT result_image_url FROM generation_tasks WHERE id = ?").get(record.task_id);
    if (!row) return { pass: false, reason: `missing task ${record.task_id}`, base64Count, proposedUrlCount };
    if (row.result_image_url !== record.proposed_public_url) {
      return { pass: false, reason: `URL mismatch task ${record.task_id}`, base64Count, proposedUrlCount };
    }
    proposedUrlCount += 1;
  }
  return { pass: base64Count === 0 && proposedUrlCount === expectedLegacyBase64Rows, base64Count, proposedUrlCount };
}

function resolveR2PublicBaseUrl() {
  const wranglerPath = path.join(repoRoot, "wrangler.jsonc");
  const wranglerText = fs.readFileSync(wranglerPath, "utf8");
  const match = wranglerText.match(/"R2_PUBLIC_BASE_URL"\s*:\s*"([^"]+)"/);
  if (match) return match[1].replace(/\/+$/, "");

  const archivePath = path.join(repoRoot, "src", "lib", "r2-image-archive.ts");
  if (fs.existsSync(archivePath)) {
    const archiveText = fs.readFileSync(archivePath, "utf8");
    const archiveMatch = archiveText.match(/PUBLIC_IMAGE_BASE_URL\s*=\s*"([^"]+)"/);
    if (archiveMatch) return archiveMatch[1].replace(/\/+$/, "");
  }
  return null;
}

function readPreExternalizeLocalD1Bytes() {
  if (!fs.existsSync(verificationJsonPath)) return null;
  try {
    const previous = JSON.parse(fs.readFileSync(verificationJsonPath, "utf8"));
    if (previous.localD1Sizes?.beforeExternalizeBytes != null) {
      return previous.localD1Sizes.beforeExternalizeBytes;
    }
    if (typeof previous.dbPath !== "string") return null;
    const previousDbPath = path.resolve(previous.dbPath);
    const relative = path.relative(repoRoot, previousDbPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(previousDbPath)) return null;
    return fs.statSync(previousDbPath).size;
  } catch {
    return null;
  }
}

function isAggregatedTable(table) {
  return new Set([
    "profiles",
    "credit_usage_logs",
    "generation_tasks",
    "generation_history",
    "coupons",
    "user_orders",
    "redeem_logs",
  ]).has(table);
}

function aggregateSourceTable(table, rows) {
  switch (table) {
    case "profiles":
      return {
        count: rows.length,
        sumCredits: sumScaled(rows, "credits", 2),
        minCredits: minScaled(rows, "credits", 2),
        maxCredits: maxScaled(rows, "credits", 2),
      };
    case "credit_usage_logs":
      return {
        count: rows.length,
        sumAmount: sumScaled(rows, "amount", 2),
        distinctUserId: distinctCount(rows, "user_id"),
        distinctIdempotencyKey: distinctCount(rows, "idempotency_key"),
      };
    case "generation_tasks":
      return {
        count: rows.length,
        statusCounts: groupCounts(rows, "status"),
        deductionStatusCounts: groupCounts(rows, "deduction_status"),
        distinctRequestId: distinctCount(rows, "request_id"),
        base64ResultImageUrlCount: rows.filter((row) => typeof row.result_image_url === "string" && row.result_image_url.startsWith("data:image/")).length,
      };
    case "generation_history":
      return {
        count: rows.length,
        modelCounts: groupCounts(rows, "model"),
        sumCost: sumScaled(rows, "cost", 2),
        imageUrlNull: rows.filter((row) => row.image_url === null).length,
        imageUrlNonNull: rows.filter((row) => row.image_url !== null).length,
        base64ImageUrlCount: rows.filter((row) => typeof row.image_url === "string" && row.image_url.startsWith("data:image/")).length,
      };
    case "coupons":
      return {
        count: rows.length,
        used: rows.filter((row) => row.is_used === true).length,
        unused: rows.filter((row) => row.is_used === false).length,
        sumAmount: sumScaled(rows, "amount", 2),
      };
    case "user_orders":
      return {
        count: rows.length,
        statusCounts: groupCounts(rows, "status"),
        sumAmount: sumScaled(rows, "amount", 2),
        sumCredits: sumScaled(rows, "credits", 2),
      };
    case "redeem_logs":
      return {
        count: rows.length,
        success: rows.filter((row) => row.success === true).length,
        failed: rows.filter((row) => row.success === false).length,
        sumAmount: sumScaled(rows, "amount", 2),
      };
    default:
      throw new Error(`No aggregate implementation for ${table}`);
  }
}

function sumScaled(rows, column, scale) {
  return rows.reduce((sum, row) => sum + decimalToScaledInteger(row[column], scale, `${column}`), 0);
}

function minScaled(rows, column, scale) {
  return rows.reduce((min, row) => Math.min(min, decimalToScaledInteger(row[column], scale, `${column}`)), Number.POSITIVE_INFINITY);
}

function maxScaled(rows, column, scale) {
  return rows.reduce((max, row) => Math.max(max, decimalToScaledInteger(row[column], scale, `${column}`)), Number.NEGATIVE_INFINITY);
}

function distinctCount(rows, column) {
  return new Set(rows.map((row) => row[column])).size;
}

function groupCounts(rows, column) {
  const counts = {};
  for (const row of rows) counts[row[column]] = (counts[row[column]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function countD1Rows(db, tables) {
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get().count]));
}

function aggregateD1(db) {
  return {
    profiles: db.prepare("SELECT COUNT(*) AS count, SUM(credits) AS sumCredits, MIN(credits) AS minCredits, MAX(credits) AS maxCredits FROM profiles").get(),
    credit_usage_logs: db.prepare("SELECT COUNT(*) AS count, SUM(amount) AS sumAmount, COUNT(DISTINCT user_id) AS distinctUserId, COUNT(DISTINCT idempotency_key) AS distinctIdempotencyKey FROM credit_usage_logs").get(),
    generation_tasks: {
      count: db.prepare("SELECT COUNT(*) AS count FROM generation_tasks").get().count,
      statusCounts: groupedQuery(db, "generation_tasks", "status"),
      deductionStatusCounts: groupedQuery(db, "generation_tasks", "deduction_status"),
      distinctRequestId: db.prepare("SELECT COUNT(DISTINCT request_id) AS count FROM generation_tasks").get().count,
      base64ResultImageUrlCount: db.prepare("SELECT COUNT(*) AS count FROM generation_tasks WHERE substr(result_image_url, 1, 11) = 'data:image/'").get().count,
    },
    generation_history: {
      count: db.prepare("SELECT COUNT(*) AS count FROM generation_history").get().count,
      modelCounts: groupedQuery(db, "generation_history", "model"),
      sumCost: db.prepare("SELECT SUM(cost) AS sumCost FROM generation_history").get().sumCost,
      imageUrlNull: db.prepare("SELECT COUNT(*) AS count FROM generation_history WHERE image_url IS NULL").get().count,
      imageUrlNonNull: db.prepare("SELECT COUNT(*) AS count FROM generation_history WHERE image_url IS NOT NULL").get().count,
      base64ImageUrlCount: db.prepare("SELECT COUNT(*) AS count FROM generation_history WHERE substr(image_url, 1, 11) = 'data:image/'").get().count,
    },
    coupons: db.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) AS used, SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) AS unused, SUM(amount) AS sumAmount FROM coupons").get(),
    user_orders: {
      count: db.prepare("SELECT COUNT(*) AS count FROM user_orders").get().count,
      statusCounts: groupedQuery(db, "user_orders", "status"),
      sumAmount: db.prepare("SELECT SUM(amount) AS sumAmount FROM user_orders").get().sumAmount,
      sumCredits: db.prepare("SELECT SUM(credits) AS sumCredits FROM user_orders").get().sumCredits,
    },
    redeem_logs: db.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed, SUM(amount) AS sumAmount FROM redeem_logs").get(),
  };
}

function groupedQuery(db, table, column) {
  const rows = db.prepare(`SELECT ${quoteIdent(column)} AS value, COUNT(*) AS count FROM ${quoteIdent(table)} GROUP BY ${quoteIdent(column)} ORDER BY ${quoteIdent(column)}`).all();
  return Object.fromEntries(rows.map((row) => [row.value, row.count]));
}

function compareAggregates(sourceAggregates, d1Aggregates) {
  return Object.keys(sourceAggregates).map((table) => {
    const source = normalizeAggregate(sourceAggregates[table]);
    const d1 = normalizeAggregate(d1Aggregates[table]);
    return {
      table,
      pass: JSON.stringify(source) === JSON.stringify(d1),
      source,
      d1,
    };
  });
}

function normalizeAggregate(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizeAggregate(item)]));
}

function verifyUniqueConstraints(db) {
  const indexRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
  const indexes = new Set(indexRows.map((row) => row.name));
  return uniqueChecks.map((check) => {
    const columnLabel = check.label ?? check.column;
    const duplicateSql = check.nullable
      ? `SELECT COUNT(*) AS duplicateGroups FROM (SELECT ${check.column} AS value, COUNT(*) AS c FROM ${quoteIdent(check.table)} WHERE ${check.column} IS NOT NULL GROUP BY ${check.column} HAVING COUNT(*) > 1)`
      : `SELECT COUNT(*) AS duplicateGroups FROM (SELECT ${check.column} AS value, COUNT(*) AS c FROM ${quoteIdent(check.table)} GROUP BY ${check.column} HAVING COUNT(*) > 1)`;
    const duplicateGroups = db.prepare(duplicateSql).get().duplicateGroups;
    const indexExists = indexes.has(check.index);
    return {
      table: check.table,
      column: columnLabel,
      index: check.index,
      indexExists,
      duplicateGroups,
      pass: indexExists && duplicateGroups === 0,
    };
  });
}

function createRemoteCompatibilityState() {
  return {
    fieldLimitBytes: remoteD1MaxFieldBytes,
    warningBytes: remoteD1WarningBytes,
    maxField: { bytes: 0, table: null, column: null, rowId: null },
    maxRow: { bytes: 0, table: null, rowId: null },
    blockedFields: [],
    blockedRows: [],
    warningFields: [],
    warningRows: [],
  };
}

function recordRemoteCompatibility(table, sourceRow, columns, convertedValues) {
  const rowId = getRowIdentifier(sourceRow);
  let estimatedRowBytes = 64;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const value = convertedValues[index];
    const fieldBytes = estimateD1FieldBytes(value);
    estimatedRowBytes += fieldBytes + 16;
    if (typeof value === "string") {
      const bytes = Buffer.byteLength(value, "utf8");
      if (bytes > remoteCompatibilityState.maxField.bytes) {
        remoteCompatibilityState.maxField = { table, column, bytes, rowId };
      }
      if (bytes >= remoteD1MaxFieldBytes) {
        remoteCompatibilityState.blockedFields.push({ table, column, bytes, rowId });
      } else if (bytes >= remoteD1WarningBytes) {
        remoteCompatibilityState.warningFields.push({ table, column, bytes, rowId });
      }
    }
  }

  if (estimatedRowBytes > remoteCompatibilityState.maxRow.bytes) {
    remoteCompatibilityState.maxRow = { table, bytes: estimatedRowBytes, rowId };
  }
  if (estimatedRowBytes >= remoteD1MaxFieldBytes) {
    remoteCompatibilityState.blockedRows.push({ table, bytes: estimatedRowBytes, rowId });
  } else if (estimatedRowBytes >= remoteD1WarningBytes) {
    remoteCompatibilityState.warningRows.push({ table, bytes: estimatedRowBytes, rowId });
  }
}

function estimateD1FieldBytes(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  if (typeof value === "number" || typeof value === "boolean") return 8;
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function getRowIdentifier(row) {
  if (row.id != null) return String(row.id);
  if (row.case_id != null && row.user_id != null) return `${row.case_id}:${row.user_id}`;
  if (row.user_id != null && row.role != null) return `${row.user_id}:${row.role}`;
  return "UNKNOWN";
}

function finalizeRemoteCompatibility() {
  return {
    fieldLimitBytes: remoteCompatibilityState.fieldLimitBytes,
    warningBytes: remoteCompatibilityState.warningBytes,
    maxField: remoteCompatibilityState.maxField,
    maxRow: remoteCompatibilityState.maxRow,
    blockedFields: remoteCompatibilityState.blockedFields,
    blockedRows: remoteCompatibilityState.blockedRows,
    warningFields: remoteCompatibilityState.warningFields,
    warningRows: remoteCompatibilityState.warningRows,
    hasBlockedFields: remoteCompatibilityState.blockedFields.length > 0,
    hasBlockedRows: remoteCompatibilityState.blockedRows.length > 0,
  };
}

function renderMarkdownReport(verification) {
  const lines = [];
  lines.push("# SHUNTU D1 Migration Verification Report", "");
  lines.push(`Generated at: ${verification.generatedAt}`);
  lines.push(`Repository: ${verification.repoRoot}`);
  lines.push(`Backup source: ${verification.backupDir}`);
  lines.push(`Local D1 database: ${verification.dbPath}`);
  lines.push(`Local D1 mode: ${verification.mode}`, "");

  lines.push("## Source SHA256", "");
  lines.push(`- Result: ${verification.sourceSha256.allMatch ? "PASS" : "FAIL"}`);
  lines.push(`- Matched: ${verification.sourceSha256.matches}/${verification.sourceSha256.total}`);
  lines.push("- SHA256SUMS.csv itself was excluded from recalculation.", "");

  lines.push("## recharge_packages", "");
  lines.push(`- Status: ${verification.rechargePackages.status}`);
  if (verification.rechargePackages.snapshotSha256) lines.push(`- Snapshot SHA256: ${verification.rechargePackages.snapshotSha256}`);
  lines.push(`- Source rows: ${verification.rechargePackages.rowCount}`);
  lines.push(`- Imported: ${verification.rechargePackages.imported ? "YES" : "NO"}`);
  lines.push("- No default package rows were fabricated.", "");

  lines.push("## generation_tasks base64", "");
  lines.push(`- Base64 rows: ${verification.base64.count}`);
  lines.push(`- Total decoded bytes: ${verification.base64.totalDecodedBytes}`);
  lines.push(`- Total text bytes: ${verification.base64.totalTextBytes}`);
  lines.push(`- Retained in local D1: ${verification.base64.retainedInLocalD1 ? "YES" : "NO"}`);
  if (verification.externalization) {
    lines.push(`- Externalized for remote-compatible import: YES`);
    lines.push(`- Derived changed rows: ${verification.externalization.changedRows}`);
    lines.push(`- D1 remaining data:image base64 rows: ${verification.externalization.d1Base64Count}`);
    lines.push(`- D1 proposed public URL rows: ${verification.externalization.d1ProposedUrlCount}`);
  }
  lines.push("", "| task id | request id | mime type | encoded bytes | decoded bytes | decoded sha256 | text bytes |", "| --- | --- | --- | ---: | ---: | --- | ---: |");
  for (const row of verification.base64.rows) {
    lines.push(`| ${row.id} | ${row.requestId} | ${row.mimeType} | ${row.encodedBytes} | ${row.decodedBytes} | ${row.sha256} | ${row.textBytes} |`);
  }
  lines.push("");

  if (verification.generationHistoryOversizedImages) {
    lines.push("## generation_history oversized image_url", "");
    lines.push(`- Rows >= 2MB before externalization: ${verification.generationHistoryOversizedImages.count}`);
    lines.push(`- Non data-url rows in this set: ${verification.generationHistoryOversizedImages.nonDataUrlCount}`);
    lines.push(`- Total decoded bytes: ${verification.generationHistoryOversizedImages.totalDecodedBytes}`);
    lines.push(`- Total text bytes: ${verification.generationHistoryOversizedImages.totalTextBytes}`);
    lines.push("", "| history id | generation_task_id | user_id | type | mime type | encoded bytes | decoded bytes | decoded sha256 | text bytes |", "| --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |");
    for (const row of verification.generationHistoryOversizedImages.rows) {
      lines.push(`| ${row.id} | ${row.generationTaskId ?? ""} | ${row.userId} | ${row.imageUrlType} | ${row.mimeType ?? ""} | ${row.encodedBytes ?? ""} | ${row.decodedBytes ?? ""} | ${row.sha256 ?? ""} | ${row.textBytes} |`);
    }
    lines.push("");
  }

  if (verification.externalization) {
    lines.push("## Legacy image externalization manifest", "");
    lines.push(`- Manifest: ${verification.externalization.manifestPath}`);
    lines.push(`- Staging directory: ${verification.externalization.stagingDir}`);
    lines.push(`- Staging files: ${verification.externalization.stagingFileCount}`);
    lines.push(`- Staging total bytes: ${verification.externalization.stagingTotalBytes}`);
    lines.push(`- Staging verification: ${verification.externalization.stagingVerificationPass ? "PASS" : "FAIL"}`);
    lines.push(`- Proposed R2 namespace: ${verification.externalization.namespace}`);
    lines.push(`- R2 public host: ${verification.externalization.r2PublicBaseUrl ?? "UNKNOWN"}`);
    lines.push(`- R2 host source: ${verification.externalization.r2PublicBaseUrlSource}`);
    lines.push(`- R2 reuse ALREADY_IN_R2: ${verification.externalization.r2ReuseSummary?.ALREADY_IN_R2 ?? 0}`);
    lines.push(`- R2 reuse NEEDS_UPLOAD: ${verification.externalization.r2ReuseSummary?.NEEDS_UPLOAD ?? 0}`);
    lines.push(`- R2 reuse AMBIGUOUS: ${verification.externalization.r2ReuseSummary?.AMBIGUOUS ?? 0}`);
    lines.push(`- R2 reuse MISMATCH: ${verification.externalization.r2ReuseSummary?.MISMATCH ?? 0}`);
    lines.push(`- References: ${verification.externalization.totalReferences} (${verification.externalization.taskReferences} generation_tasks, ${verification.externalization.historyReferences} generation_history)`);
    lines.push(`- Unique binaries: ${verification.externalization.uniqueBinaryImages}`);
    lines.push(`- Shared task/history binaries: ${verification.externalization.sharedUniqueImages}`);
    lines.push(`- Task-only binaries: ${verification.externalization.taskOnlyUniqueImages}`);
    lines.push(`- History-only binaries: ${verification.externalization.historyOnlyUniqueImages}`);
    lines.push(`- Decoded bytes after dedupe: ${verification.externalization.totalDecodedBytesAfterDedupe}`);
    lines.push(`- generation_tasks changed rows: ${verification.externalization.taskChangedRows}`);
    lines.push(`- generation_history changed rows: ${verification.externalization.historyChangedRows}`);
    lines.push(`- Existing generated R2 URL rows preserved: ${verification.externalization.normalExistingR2UrlUnchangedRows}`);
    lines.push(`- D1 generation_tasks data:image rows: ${verification.externalization.d1Base64Count}`);
    lines.push(`- D1 generation_history data:image rows: ${verification.externalization.d1HistoryBase64Count}`);
    lines.push(`- D1 all-table data:image rows: ${verification.externalization.d1AllDataImageCount}`);
    lines.push(`- D1 generation_history image_url >= 2MB rows: ${verification.externalization.d1HistoryOversizedImageUrlCount}`);
    lines.push("", "| history id | generation_task_id | same decoded sha256 |", "| --- | --- | --- |");
    for (const row of verification.externalization.dedupeMappings) {
      lines.push(`| ${row.history_id} | ${row.generation_task_id ?? ""} | ${row.same_sha256 ? "YES" : "NO"} |`);
    }
    lines.push("");
  }

  lines.push("## Count reconciliation", "");
  lines.push("| table | source rows | D1 rows | result |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of verification.counts) {
    lines.push(`| ${row.table} | ${row.sourceRows} | ${row.d1Rows} | ${row.pass ? "PASS" : "FAIL"} |`);
  }
  lines.push("");

  lines.push("## Key aggregate checks", "");
  lines.push("| table | result | source JSON aggregate | local D1 aggregate |");
  lines.push("| --- | --- | --- | --- |");
  for (const row of verification.aggregates) {
    lines.push(`| ${row.table} | ${row.pass ? "PASS" : "FAIL"} | \`${JSON.stringify(row.source)}\` | \`${JSON.stringify(row.d1)}\` |`);
  }
  lines.push("");

  lines.push("## Unique constraints", "");
  lines.push("| table | field | index | duplicates | result |");
  lines.push("| --- | --- | --- | ---: | --- |");
  for (const row of verification.uniqueConstraints) {
    lines.push(`| ${row.table} | ${row.column} | ${row.index}${row.indexExists ? "" : " (missing)"} | ${row.duplicateGroups} | ${row.pass ? "PASS" : "FAIL"} |`);
  }
  lines.push("");

  lines.push("## Scaling verification", "");
  lines.push("| field | kind | converted values | min | max |");
  lines.push("| --- | --- | ---: | ---: | ---: |");
  for (const row of verification.scaling) {
    lines.push(`| ${row.field} | ${row.kind} | ${row.count} | ${row.min} | ${row.max} |`);
  }
  lines.push("");

  lines.push("## D1 2MB compatibility", "");
  lines.push(`- Status: ${verification.remoteD1Status}`);
  lines.push(`- Field limit checked: < ${verification.remoteCompatibility.fieldLimitBytes} UTF-8 bytes`);
  lines.push(`- Warning threshold: >= ${verification.remoteCompatibility.warningBytes} UTF-8 bytes`);
  lines.push(`- Field exists >= limit: ${verification.remoteCompatibility.hasBlockedFields ? "YES" : "NO"}`);
  lines.push(`- Estimated row exists >= limit: ${verification.remoteCompatibility.hasBlockedRows ? "YES" : "NO"}`);
  lines.push(`- Max field: ${verification.remoteCompatibility.maxField.table}.${verification.remoteCompatibility.maxField.column} / ${verification.remoteCompatibility.maxField.bytes} bytes / row ${verification.remoteCompatibility.maxField.rowId}`);
  lines.push(`- Max conservative row estimate: ${verification.remoteCompatibility.maxRow.table} / ${verification.remoteCompatibility.maxRow.bytes} bytes / row ${verification.remoteCompatibility.maxRow.rowId}`);
  if (verification.remoteCompatibility.blockedFields.length > 0) {
    lines.push("", "### Blocked fields", "", "| table | column | bytes | row id |", "| --- | --- | ---: | --- |");
    for (const row of verification.remoteCompatibility.blockedFields) {
      lines.push(`| ${row.table} | ${row.column} | ${row.bytes} | ${row.rowId} |`);
    }
  }
  if (verification.remoteCompatibility.blockedRows.length > 0) {
    lines.push("", "### Blocked rows", "", "| table | bytes | row id |", "| --- | ---: | --- |");
    for (const row of verification.remoteCompatibility.blockedRows) {
      lines.push(`| ${row.table} | ${row.bytes} | ${row.rowId} |`);
    }
  }
  if (verification.remoteCompatibility.warningFields.length > 0) {
    lines.push("", "### Warning fields", "", "| table | column | bytes | row id |", "| --- | --- | ---: | --- |");
    for (const row of verification.remoteCompatibility.warningFields) {
      lines.push(`| ${row.table} | ${row.column} | ${row.bytes} | ${row.rowId} |`);
    }
  }
  if (verification.remoteCompatibility.warningRows.length > 0) {
    lines.push("", "### Warning rows", "", "| table | bytes | row id |", "| --- | ---: | --- |");
    for (const row of verification.remoteCompatibility.warningRows) {
      lines.push(`| ${row.table} | ${row.bytes} | ${row.rowId} |`);
    }
  }
  lines.push("");

  if (verification.localD1Sizes.beforeExternalizeBytes != null || verification.localD1Sizes.afterExternalizeBytes != null) {
    lines.push("## Local D1 sizes", "");
    lines.push(`- Before externalize SQLite bytes: ${verification.localD1Sizes.beforeExternalizeBytes ?? "UNKNOWN"}`);
    lines.push(`- After externalize SQLite bytes: ${verification.localD1Sizes.afterExternalizeBytes ?? "UNKNOWN"}`);
    lines.push("");
  }

  lines.push("## RPC / Auth notes", "");
  lines.push("- Auth was not migrated. Supabase auth UUIDs and user_id values were preserved as TEXT without regeneration.");
  lines.push("- RPCs were not implemented in this phase: consume_credits_for_generation, consume_credits_for_generation_v2, set_latest_history_image, finalize_user_generation_task_once, complete_paid_order, redeem_coupon.");
  lines.push("- Future Worker design should replace RPC behavior with D1 transactions / idempotent service functions after this local data baseline is accepted.");
  lines.push("");

  lines.push("## Prohibited operations confirmation", "");
  lines.push("- No Supabase/Lovable writes were performed by this script.");
  lines.push("- No remote D1 create/write was performed; Wrangler was used with --local only.");
  lines.push("- No R2 upload/write was performed.");
  lines.push("- No source backup files were modified.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
