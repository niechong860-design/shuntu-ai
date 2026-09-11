#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const manifestPath = path.join(repoRoot, "d1/reports/legacy-image-externalization-manifest.json");
const stagingDir = path.join(repoRoot, "d1/staging/legacy-generated-images");
const wranglerPath = path.join(repoRoot, "wrangler.jsonc");
const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const confirmed = args.has("--confirm-production-r2");
const dryRun = !execute;

main();

function main() {
  if (execute && !confirmed) {
    throw new Error("REFUSING_R2_WRITE: --execute requires --confirm-production-r2");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bucket = readR2BucketName();
  const objects = (manifest.objects ?? []).filter((object) => object.status === "NEEDS_UPLOAD");
  const validation = objects.map(validateObject);
  const bad = validation.filter((row) => !row.pass);
  if (bad.length > 0) {
    console.log(JSON.stringify({ ok: false, dryRun, bucket, failures: bad }, null, 2));
    process.exitCode = 1;
    return;
  }

  const planned = validation.map((row) => ({
    sha256: row.sha256,
    bytes: row.bytes,
    mimeType: row.mimeType,
    key: row.key,
    publicUrl: row.publicUrl,
  }));

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      execute: false,
      bucket,
      plannedUploads: planned.length,
      totalBytes: planned.reduce((sum, row) => sum + row.bytes, 0),
      sha256Verification: "PASS",
      commandsAreNotExecuted: true,
      uploadCommandShape: "npx wrangler r2 object put <bucket>/<key> --file <staging_file> --content-type <mime> --remote --force",
    }, null, 2));
    return;
  }

  for (const row of validation) {
    const result = spawnSync("npx", [
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucket}/${row.key}`,
      "--file",
      row.file,
      "--content-type",
      row.mimeType,
      "--remote",
      "--force",
    ], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) throw new Error(`R2_UPLOAD_FAILED: ${row.key}`);
  }

  console.log(JSON.stringify({ ok: true, dryRun: false, bucket, uploaded: validation.length }, null, 2));
}

function validateObject(object) {
  const file = path.join(stagingDir, object.staging_filename);
  assertInsideRepo(file, repoRoot, "legacy image staging file");
  if (!fs.existsSync(file)) {
    return { pass: false, sha256: object.sha256, reason: "missing staging file" };
  }
  const bytes = fs.statSync(file).size;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return {
    pass: sha256 === object.sha256 && bytes === object.decoded_bytes,
    sha256: object.sha256,
    bytes,
    mimeType: object.mime_type,
    key: object.fallback_proposed_r2_key,
    publicUrl: object.fallback_proposed_public_url,
    file,
    reason: sha256 !== object.sha256 ? "sha256 mismatch" : bytes !== object.decoded_bytes ? "byte length mismatch" : null,
  };
}

function readR2BucketName() {
  const text = fs.readFileSync(wranglerPath, "utf8");
  const match = text.match(/"bucket_name"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("R2_BUCKET_NOT_FOUND_IN_WRANGLER");
  return match[1];
}

function assertInsideRepo(targetPath, rootPath, label) {
  const relative = path.relative(rootPath, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`REFUSING_OUTSIDE_REPO_READ: ${label} resolved to ${targetPath}`);
  }
}
