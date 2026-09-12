#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const backupDir = String.raw`C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`;
const reportsDir = path.join(repoRoot, "d1", "reports");
const manifestPath = path.join(reportsDir, "legacy-image-externalization-manifest.json");
const auditReportPath = path.join(reportsDir, "legacy-image-r2-reuse-audit.md");
const stagingDir = path.join(repoRoot, "d1", "staging", "legacy-generated-images");
const r2PublicBaseUrl = "https://img.shuntu.cc";
const generatedPrefix = "generated/";
const fallbackNamespace = "migration/legacy-generated-images/v1";
const expectedTaskRefs = 14;
const expectedHistoryRefs = 16;

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  assertInsideRepo(reportsDir, repoRoot, "reports dir");
  assertInsideRepo(stagingDir, repoRoot, "legacy image staging dir");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const tasks = readJson(path.join(backupDir, "generation_tasks.json"));
  const histories = readJson(path.join(backupDir, "generation_history.json"));
  const taskRowsById = new Map(tasks.map((row) => [row.id, row]));
  const historiesByTaskId = groupBy(histories.filter((row) => row.generation_task_id), "generation_task_id");
  const previousManifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const previousManifestSummary = summarizeExistingManifest(previousManifest);

  const legacy = buildLegacyObjects({ tasks, histories });
  if (legacy.taskReferences !== expectedTaskRefs || legacy.historyReferences !== expectedHistoryRefs) {
    throw new Error(`LEGACY_REFERENCE_COUNT_CHANGED: expected tasks=${expectedTaskRefs}, history=${expectedHistoryRefs}; found tasks=${legacy.taskReferences}, history=${legacy.historyReferences}`);
  }

  const previousMismatch = previousManifestSummary
    ? previousManifestSummary.totalReferences !== legacy.references.length || previousManifestSummary.uniqueBinaries !== legacy.objects.length
    : null;
  if (previousMismatch) {
    console.warn(JSON.stringify({
      warning: "EXISTING_MANIFEST_REFERENCE_COUNT_DIFFERED_FROM_FULL_DATA_URL_SCAN",
      previous: previousManifestSummary,
      current: { totalReferences: legacy.references.length, uniqueBinaries: legacy.objects.length },
    }));
  }

  verifyAndWriteStaging(legacy.objects);
  const relationshipAudit = buildRelationshipAudit({ histories, taskRowsById });

  const objects = [];
  for (const object of legacy.objects) {
    const candidates = buildCandidateUrls({ object, taskRowsById, historiesByTaskId });
    const audit = await verifyCandidates(object, candidates);
    objects.push({
      sha256: object.sha256,
      mime_type: object.mime_type,
      decoded_bytes: object.decoded_bytes,
      staging_filename: object.staging_filename,
      status: audit.status,
      existing_r2_key: audit.existing_r2_key,
      existing_r2_url: audit.existing_r2_url,
      fallback_proposed_r2_key: object.fallback_proposed_r2_key,
      fallback_proposed_public_url: object.fallback_proposed_public_url,
      r2_reuse_audit: {
        candidate_count: candidates.length,
        checked_count: audit.checked_count,
        readable_candidate_count: audit.readable_candidate_count,
        mismatch_count: audit.mismatch_count,
        ambiguous_count: audit.ambiguous_count,
        method: "public HTTPS HEAD, then GET only when HEAD indicated an existing generated object",
        candidates: audit.candidates,
      },
      references: object.references,
    });
  }

  const statusCounts = countBy(objects, "status");
  const manifest = {
    version: 2,
    created_at: new Date().toISOString(),
    source_backup: backupDir,
    r2_public_base_url: r2PublicBaseUrl,
    generated_namespace: generatedPrefix,
    fallback_namespace: fallbackNamespace,
    source_scan: {
      task_references: legacy.taskReferences,
      history_references: legacy.historyReferences,
      total_references: legacy.references.length,
      shared_task_history_binaries: legacy.sharedTaskHistoryBinaries,
      task_only_binaries: legacy.taskOnlyBinaries,
      history_only_binaries: legacy.historyOnlyBinaries,
      unique_binaries: legacy.objects.length,
      decoded_bytes_after_dedupe: legacy.objects.reduce((sum, row) => sum + row.decoded_bytes, 0),
      previous_manifest_mismatch: previousMismatch,
      previous_manifest_summary: previousManifestSummary,
    },
    r2_reuse_summary: {
      ALREADY_IN_R2: statusCounts.ALREADY_IN_R2 ?? 0,
      NEEDS_UPLOAD: statusCounts.NEEDS_UPLOAD ?? 0,
      AMBIGUOUS: statusCounts.AMBIGUOUS ?? 0,
      MISMATCH: statusCounts.MISMATCH ?? 0,
    },
    key_generation_rule: {
      source_file: "src/lib/r2-image-archive.ts",
      function: "getArchiveKey(taskId, extension, now)",
      pattern: "generated/<UTC year>/<UTC month>/<safe taskId>.<extension>",
      date_source: "archive execution time; candidate audit used task/history created/completed/updated UTC months where available",
    },
    relationship_audit: relationshipAudit,
    objects,
  };

  writeManifest(manifest);
  fs.writeFileSync(auditReportPath, renderReport(manifest));
  console.log(JSON.stringify({
    ok: true,
    manifestPath,
    auditReportPath,
    previousManifestMismatch: previousMismatch,
    taskReferences: legacy.taskReferences,
    historyReferences: legacy.historyReferences,
    totalReferences: legacy.references.length,
    uniqueBinaries: legacy.objects.length,
    stagingTotalBytes: legacy.objects.reduce((sum, row) => sum + row.decoded_bytes, 0),
    r2ReuseSummary: manifest.r2_reuse_summary,
  }, null, 2));
}

function assertInsideRepo(targetPath, rootPath, label) {
  const relative = path.relative(rootPath, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`REFUSING_OUTSIDE_REPO_WRITE: ${label} resolved to ${targetPath}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildLegacyObjects({ tasks, histories }) {
  const objectsBySha = new Map();
  const references = [];
  let taskReferences = 0;
  let historyReferences = 0;

  for (const row of tasks) {
    const parsed = parseImageData(row.result_image_url);
    if (!parsed) continue;
    taskReferences += 1;
    addReference(objectsBySha, references, parsed, {
      table: "generation_tasks",
      row_id: row.id,
      column: "result_image_url",
      generation_task_id: row.id,
      request_id: row.request_id,
    });
  }

  for (const row of histories) {
    const parsed = parseImageData(row.image_url);
    if (!parsed) continue;
    historyReferences += 1;
    addReference(objectsBySha, references, parsed, {
      table: "generation_history",
      row_id: row.id,
      column: "image_url",
      generation_task_id: row.generation_task_id ?? null,
    });
  }

  const objects = Array.from(objectsBySha.values()).sort((a, b) => a.sha256.localeCompare(b.sha256));
  const taskHashes = new Set(references.filter((row) => row.table === "generation_tasks").map((row) => row.sha256));
  const historyHashes = new Set(references.filter((row) => row.table === "generation_history").map((row) => row.sha256));
  return {
    taskReferences,
    historyReferences,
    references,
    objects,
    sharedTaskHistoryBinaries: Array.from(taskHashes).filter((sha) => historyHashes.has(sha)).length,
    taskOnlyBinaries: Array.from(taskHashes).filter((sha) => !historyHashes.has(sha)).length,
    historyOnlyBinaries: Array.from(historyHashes).filter((sha) => !taskHashes.has(sha)).length,
  };
}

function parseImageData(value) {
  const match = typeof value === "string" && value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]*)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const extension = extensionForMime(mimeType);
  const encodedBytes = Buffer.byteLength(match[2], "utf8");
  const decoded = Buffer.from(match[2], "base64");
  const sha256 = crypto.createHash("sha256").update(decoded).digest("hex");
  return { mimeType, extension, encodedBytes, decodedBytes: decoded.byteLength, sha256, decoded };
}

function extensionForMime(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error(`UNSUPPORTED_IMAGE_MIME: ${mimeType}`);
}

function addReference(objectsBySha, references, parsed, reference) {
  const stagingFilename = `${parsed.sha256}.${parsed.extension}`;
  const fallbackKey = `${fallbackNamespace}/${stagingFilename}`;
  let object = objectsBySha.get(parsed.sha256);
  if (!object) {
    object = {
      sha256: parsed.sha256,
      mime_type: parsed.mimeType,
      decoded_bytes: parsed.decodedBytes,
      staging_filename: stagingFilename,
      fallback_proposed_r2_key: fallbackKey,
      fallback_proposed_public_url: `${r2PublicBaseUrl}/${fallbackKey}`,
      references: [],
      decoded: parsed.decoded,
    };
    objectsBySha.set(parsed.sha256, object);
  } else if (object.mime_type !== parsed.mimeType || object.decoded_bytes !== parsed.decodedBytes) {
    throw new Error(`LEGACY_IMAGE_METADATA_MISMATCH_FOR_SHA: ${parsed.sha256}`);
  }
  object.references.push(reference);
  references.push({ ...reference, sha256: parsed.sha256, encoded_bytes: parsed.encodedBytes, decoded_bytes: parsed.decodedBytes });
}

function verifyAndWriteStaging(objects) {
  for (const object of objects) {
    const stagingPath = path.join(stagingDir, object.staging_filename);
    assertInsideRepo(stagingPath, repoRoot, "legacy staging image");
    if (fs.existsSync(stagingPath)) {
      const current = fs.readFileSync(stagingPath);
      const sha = crypto.createHash("sha256").update(current).digest("hex");
      if (sha !== object.sha256 || current.byteLength !== object.decoded_bytes) {
        throw new Error(`STAGING_FILE_COLLISION: ${object.staging_filename}`);
      }
    } else {
      fs.writeFileSync(stagingPath, object.decoded);
    }
    const written = fs.readFileSync(stagingPath);
    const writtenSha = crypto.createHash("sha256").update(written).digest("hex");
    if (writtenSha !== object.sha256 || written.byteLength !== object.decoded_bytes) {
      throw new Error(`STAGING_FILE_VERIFICATION_FAILED: ${object.staging_filename}`);
    }
    delete object.decoded;
  }
}

function buildRelationshipAudit({ histories, taskRowsById }) {
  return histories
    .filter((row) => parseImageData(row.image_url))
    .map((history) => {
      const task = history.generation_task_id ? taskRowsById.get(history.generation_task_id) : null;
      return {
        history_id: history.id,
        generation_task_id: history.generation_task_id ?? null,
        task_exists: Boolean(task),
        task_result_image_url_type: classifyUrl(task?.result_image_url),
        history_image_url_type: classifyUrl(history.image_url),
      };
    })
    .sort((a, b) => a.history_id.localeCompare(b.history_id));
}

function classifyUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "NONE";
  if (parseImageData(value)) return "DATA_IMAGE";
  if (value.startsWith(`${r2PublicBaseUrl}/${generatedPrefix}`)) return "R2_GENERATED_URL";
  if (/^https?:\/\//i.test(value)) return "HTTP_URL";
  return "OTHER";
}

function buildCandidateUrls({ object, taskRowsById, historiesByTaskId }) {
  const candidates = new Map();
  for (const reference of object.references) {
    if (reference.table === "generation_tasks") {
      const task = taskRowsById.get(reference.row_id);
      addGeneratedUrlCandidate(candidates, task?.result_image_url, "task_result_image_url_relation");
      for (const history of historiesByTaskId.get(reference.row_id) ?? []) {
        addGeneratedUrlCandidate(candidates, history.image_url, "history_image_url_relation");
      }
      addDeterministicKeyCandidates(candidates, reference.row_id, object.mime_type, collectTaskDates(task), "generated_key_rule_task_id");
    }
    if (reference.table === "generation_history" && reference.generation_task_id) {
      const task = taskRowsById.get(reference.generation_task_id);
      addGeneratedUrlCandidate(candidates, task?.result_image_url, "task_result_image_url_relation");
      addDeterministicKeyCandidates(candidates, reference.generation_task_id, object.mime_type, collectTaskDates(task), "generated_key_rule_generation_task_id");
    }
  }
  return Array.from(candidates.values()).sort((a, b) => a.url.localeCompare(b.url));
}

function addGeneratedUrlCandidate(candidates, value, source) {
  if (typeof value !== "string" || !value.startsWith(`${r2PublicBaseUrl}/${generatedPrefix}`)) return;
  const url = value;
  const key = new URL(url).pathname.slice(1);
  candidates.set(url, { url, key, source });
}

function addDeterministicKeyCandidates(candidates, taskId, mimeType, dates, source) {
  if (!taskId || dates.length === 0) return;
  const extension = extensionForMime(mimeType);
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const date of dates) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = `${generatedPrefix}${parsed.getUTCFullYear()}/${String(parsed.getUTCMonth() + 1).padStart(2, "0")}/${safeTaskId}.${extension}`;
    const url = `${r2PublicBaseUrl}/${key}`;
    candidates.set(url, { url, key, source });
  }
}

function collectTaskDates(task) {
  if (!task) return [];
  return unique([task.created_at, task.started_at, task.completed_at, task.updated_at].filter(Boolean));
}

async function verifyCandidates(object, candidates) {
  const checks = [];
  let readable = 0;
  let mismatch = 0;
  let ambiguous = 0;
  for (const candidate of candidates) {
    const check = { key: candidate.key, url: candidate.url, source: candidate.source, head_status: null, result: "NOT_FOUND" };
    try {
      const head = await fetch(candidate.url, { method: "HEAD", redirect: "follow" });
      check.head_status = head.status;
      if (head.status === 404) {
        checks.push(check);
        continue;
      }
      if (!head.ok) {
        check.result = "AMBIGUOUS";
        ambiguous += 1;
        checks.push(check);
        continue;
      }
      readable += 1;
      const response = await fetch(candidate.url, { method: "GET", redirect: "follow" });
      check.get_status = response.status;
      if (!response.ok) {
        check.result = "AMBIGUOUS";
        ambiguous += 1;
        checks.push(check);
        continue;
      }
      const body = Buffer.from(await response.arrayBuffer());
      check.bytes = body.byteLength;
      check.sha256 = crypto.createHash("sha256").update(body).digest("hex");
      if (check.sha256 === object.sha256) {
        check.result = "MATCH";
        checks.push(check);
        return {
          status: "ALREADY_IN_R2",
          existing_r2_key: candidate.key,
          existing_r2_url: candidate.url,
          checked_count: checks.length,
          readable_candidate_count: readable,
          mismatch_count: mismatch,
          ambiguous_count: ambiguous,
          candidates: checks,
        };
      }
      check.result = "MISMATCH";
      mismatch += 1;
      checks.push(check);
    } catch (error) {
      check.result = "AMBIGUOUS";
      check.error_name = error?.name ?? "Error";
      ambiguous += 1;
      checks.push(check);
    }
  }

  const status = mismatch > 0 ? "MISMATCH" : ambiguous > 0 ? "AMBIGUOUS" : "NEEDS_UPLOAD";
  return {
    status,
    existing_r2_key: null,
    existing_r2_url: null,
    checked_count: checks.length,
    readable_candidate_count: readable,
    mismatch_count: mismatch,
    ambiguous_count: ambiguous,
    candidates: checks,
  };
}

function summarizeExistingManifest(manifest) {
  if (!manifest?.objects) return null;
  return {
    version: manifest.version ?? null,
    totalReferences: manifest.objects.reduce((sum, object) => sum + (object.references?.length ?? 0), 0),
    uniqueBinaries: manifest.objects.length,
  };
}

function writeManifest(manifest) {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (/data:image\//i.test(text) || /base64/i.test(text) || /api[_-]?key|secret|token|private[_-]?key/i.test(text)) {
    throw new Error("LEGACY_MANIFEST_FORBIDDEN_CONTENT");
  }
  fs.writeFileSync(manifestPath, text);
}

function renderReport(manifest) {
  const lines = [];
  lines.push("# SHUNTU Legacy Image R2 Reuse Audit", "");
  lines.push(`Generated at: ${manifest.created_at}`);
  lines.push(`Source backup: ${manifest.source_backup}`);
  lines.push(`Public host: ${manifest.r2_public_base_url}`);
  lines.push(`Generated namespace: ${manifest.generated_namespace}`);
  lines.push(`Fallback namespace: ${manifest.fallback_namespace}`, "");
  lines.push("## Source Scan", "");
  lines.push(`- generation_tasks references: ${manifest.source_scan.task_references}`);
  lines.push(`- generation_history references: ${manifest.source_scan.history_references}`);
  lines.push(`- total references: ${manifest.source_scan.total_references}`);
  lines.push(`- unique binaries: ${manifest.source_scan.unique_binaries}`);
  lines.push(`- shared task/history binaries: ${manifest.source_scan.shared_task_history_binaries}`);
  lines.push(`- task-only binaries: ${manifest.source_scan.task_only_binaries}`);
  lines.push(`- history-only binaries: ${manifest.source_scan.history_only_binaries}`);
  lines.push(`- decoded bytes after dedupe: ${manifest.source_scan.decoded_bytes_after_dedupe}`);
  if (manifest.source_scan.previous_manifest_mismatch) {
    lines.push(`- Previous manifest mismatch explicitly reported: YES (${manifest.source_scan.previous_manifest_summary.totalReferences} refs -> ${manifest.source_scan.total_references} refs)`);
  }
  lines.push("", "## Existing R2 Reuse", "");
  lines.push(`- ALREADY_IN_R2: ${manifest.r2_reuse_summary.ALREADY_IN_R2}`);
  lines.push(`- NEEDS_UPLOAD: ${manifest.r2_reuse_summary.NEEDS_UPLOAD}`);
  lines.push(`- AMBIGUOUS: ${manifest.r2_reuse_summary.AMBIGUOUS}`);
  lines.push(`- MISMATCH: ${manifest.r2_reuse_summary.MISMATCH}`);
  lines.push("", "## Key Rule", "");
  lines.push(`- ${manifest.key_generation_rule.source_file} / ${manifest.key_generation_rule.function}`);
  lines.push(`- ${manifest.key_generation_rule.pattern}`);
  lines.push(`- ${manifest.key_generation_rule.date_source}`);
  lines.push("", "## Object Classification", "");
  lines.push("| sha256 | status | existing key | fallback key | refs | candidates checked |", "| --- | --- | --- | --- | ---: | ---: |");
  for (const object of manifest.objects) {
    lines.push(`| ${object.sha256} | ${object.status} | ${object.existing_r2_key ?? ""} | ${object.fallback_proposed_r2_key} | ${object.references.length} | ${object.r2_reuse_audit.checked_count} |`);
  }
  lines.push("", "## Relationship Audit", "");
  lines.push("| history id | generation_task_id | task URL type | history URL type |", "| --- | --- | --- | --- |");
  for (const row of manifest.relationship_audit) {
    lines.push(`| ${row.history_id} | ${row.generation_task_id ?? ""} | ${row.task_result_image_url_type} | ${row.history_image_url_type} |`);
  }
  lines.push("", "## Prohibited Operations", "");
  lines.push("- No R2 PUT, DELETE, COPY, or MOVE was performed.");
  lines.push("- Public HTTPS HEAD was used for candidates; GET was used only for candidate objects that appeared to exist.");
  lines.push("- No remote D1, Supabase, Lovable, Auth, Storage, Provider, Canvas, or payment mutation was performed.");
  return `${lines.join("\n")}\n`;
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function unique(values) {
  return Array.from(new Set(values));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}
