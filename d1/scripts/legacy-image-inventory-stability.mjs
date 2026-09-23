import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const SOURCE_BACKUP = "C:/Users/21972/Desktop/shuntu-db-backup/2026-09-11_01-55-13";
const MANIFEST_PATH = path.join(REPO_ROOT, "d1/reports/legacy-image-externalization-manifest.json");
const REPORT_PATH = path.join(REPO_ROOT, "d1/reports/legacy-image-inventory-stability.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function tableRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  throw new Error("Unsupported JSON table shape");
}

function scanTable(table, column) {
  const rows = tableRows(readJson(path.join(SOURCE_BACKUP, `${table}.json`)));
  const refs = [];
  for (const row of rows) {
    const value = row[column];
    if (typeof value !== "string" || !/^data:image\/[^;]+;base64,/i.test(value)) continue;
    const match = value.match(/^data:(image\/[^;]+);base64,(.*)$/is);
    if (!match) continue;
    const decoded = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    refs.push({
      table,
      row_id: String(row.id),
      column,
      generation_task_id: table === "generation_tasks" ? String(row.id) : row.generation_task_id ?? null,
      request_id: row.request_id ?? null,
      mime: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(),
      encoded_bytes: Buffer.byteLength(value, "utf8"),
      decoded_bytes: decoded.length,
      sha256: crypto.createHash("sha256").update(decoded).digest("hex"),
    });
  }
  return refs;
}

function scanAll() {
  return [
    ...scanTable("generation_tasks", "result_image_url"),
    ...scanTable("generation_history", "image_url"),
  ].sort((a, b) => `${a.table}:${a.row_id}`.localeCompare(`${b.table}:${b.row_id}`));
}

function summarize(refs) {
  return {
    taskRefs: refs.filter((ref) => ref.table === "generation_tasks").length,
    historyRefs: refs.filter((ref) => ref.table === "generation_history").length,
    totalRefs: refs.length,
    uniqueBinaries: new Set(refs.map((ref) => ref.sha256)).size,
  };
}

const first = scanAll();
const second = scanAll();
const stable = JSON.stringify(first) === JSON.stringify(second);
if (!stable) throw new Error("LEGACY_IMAGE_INVENTORY_UNSTABLE");

const manifest = readJson(MANIFEST_PATH);
const manifestObjects = manifest.objects ?? manifest.records ?? [];
const manifestShas = new Set(manifestObjects.map((object) => object.sha256));
const currentShas = new Set(first.map((ref) => ref.sha256));
const manifestMatches = manifestObjects.length === currentShas.size && [...currentShas].every((sha) => manifestShas.has(sha));
if (!manifestMatches) throw new Error("LEGACY_IMAGE_MANIFEST_MISMATCH");

const extraUnderStringLimit = first.filter(
  (ref) => ref.table === "generation_history" && ref.encoded_bytes < 2_000_000,
);
const driftReference = extraUnderStringLimit.find((ref) => ref.sha256 === "44bd9c4aae4bdd250c635289d6dd8c362e801d999e88850da4d07a28e46f8153") ?? extraUnderStringLimit[0] ?? null;
const summary = summarize(first);

const lines = [
  "# Legacy Image Inventory Stability",
  "",
  `- source_backup: ${SOURCE_BACKUP}`,
  `- manifest: ${MANIFEST_PATH}`,
  `- stable_two_pass_scan: ${stable ? "PASS" : "FAIL"}`,
  `- task_refs: ${summary.taskRefs}`,
  `- history_refs: ${summary.historyRefs}`,
  `- total_refs: ${summary.totalRefs}`,
  `- unique_binaries: ${summary.uniqueBinaries}`,
  `- manifest_sha_match: ${manifestMatches ? "PASS" : "FAIL"}`,
  "",
  "## Drift Explanation",
  "",
  "The earlier 29 refs / 21 binaries inventory only counted legacy base64 values that tripped the remote D1 string-size risk threshold. The final inventory intentionally scans every data:image/*;base64 reference, including small legacy data URLs, because derived D1 must contain zero data:image values.",
  "",
  "## Additional Reference",
  "",
  driftReference
    ? [
        "| table | row_id | column | mime | encoded_bytes | decoded_bytes | sha256 |",
        "|---|---|---|---|---:|---:|---|",
        `| ${driftReference.table} | ${driftReference.row_id} | ${driftReference.column} | ${driftReference.mime} | ${driftReference.encoded_bytes} | ${driftReference.decoded_bytes} | ${driftReference.sha256} |`,
      ].join("\n")
    : "No under-threshold data:image reference found.",
  "",
  "Base64 bodies and full data URLs are intentionally omitted.",
  "",
];

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);

console.log(JSON.stringify({ ok: true, ...summary, stable, manifestMatches, driftReference }, null, 2));
