#!/usr/bin/env node
// Validates a reviewed auth-only CSV against local snapshots. Never connects to Wrangler/D1.
// Usage: node d1/scripts/auth-migration-dry-run.mjs <source.csv> <target-profiles.csv> <target-auth.csv>
import { readFileSync } from "node:fs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function csv(path) {
  const lines = readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines.length < 1) throw new Error(`Empty CSV: ${path}`);
  const parse = (line) => {
    const cells = [];
    let cell = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += c;
    }
    if (quoted) throw new Error(`Malformed CSV quoting: ${path}`);
    cells.push(cell);
    return cells;
  };
  const headers = parse(lines[0]).map((v) => v.trim());
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line, i) => {
      const cells = parse(line);
      if (cells.length !== headers.length)
        throw new Error(`Column count mismatch at ${path}:${i + 2}`);
      return Object.fromEntries(headers.map((h, n) => [h, cells[n]]));
    });
}

const [sourcePath, profilesPath, authPath, outputMode] = process.argv.slice(2);
if (!sourcePath || !profilesPath || !authPath) {
  console.error(
    "Usage: node d1/scripts/auth-migration-dry-run.mjs <source.csv> <target-profiles.csv> <target-auth.csv>",
  );
  process.exit(2);
}
const source = csv(sourcePath),
  profiles = csv(profilesPath),
  auth = csv(authPath);
const required = ["id", "created_at", "email_verified", "identity_count"];
if (!required.every((key) => Object.hasOwn(source[0] ?? {}, key)))
  throw new Error(`Source columns must include ${required.join(", ")}`);
if (profiles.length && !["id", "email"].every((key) => Object.hasOwn(profiles[0], key)))
  throw new Error("Profiles snapshot must include id,email");
if (auth.length && !["user_id", "email"].every((key) => Object.hasOwn(auth[0], key)))
  throw new Error("Auth snapshot must include user_id,email");
const dupes = (rows, key) => {
  const seen = new Set(),
    dup = new Set();
  for (const row of rows) {
    if (seen.has(row[key])) dup.add(row[key]);
    seen.add(row[key]);
  }
  return dup;
};
const sourceDuplicates = dupes(source, "id"),
  profileMap = new Map(profiles.map((r) => [r.id, r]));
const authIds = new Set(auth.map((r) => r.user_id));
const emails = new Map();
for (const row of profiles)
  if (row.email)
    emails.set(row.email.toLowerCase(), [...(emails.get(row.email.toLowerCase()) ?? []), row.id]);
const results = source.map((row) => {
  const valid = UUID.test(row.id);
  const profile = profileMap.get(row.id);
  const targetAuth = authIds.has(row.id);
  const emailConflict =
    profile && row.email && profile.email?.toLowerCase() !== row.email.toLowerCase();
  const emailCollision =
    row.email && (emails.get(row.email.toLowerCase()) ?? []).some((id) => id !== row.id);
  const identityCount = Number(row.identity_count);
  const hasEmail = typeof row.email === "string" && row.email.trim().length > 0;
  const emailPresent = row.email_present === "t" || row.email_present === "true" || hasEmail;
  const emailVerified =
    row.email_verified === "t" || row.email_verified === "true" || !!row.email_confirmed_at;
  const identityCountValid = Number.isInteger(identityCount) && identityCount >= 0;
  let decision = "DRY_RUN_CANDIDATE";
  if (!valid || sourceDuplicates.has(row.id) || emailConflict || emailCollision || targetAuth)
    decision = "MANUAL_REVIEW";
  else if (profile) decision = "PROFILE_ALREADY_EXISTS";
  else if (!hasEmail) decision = "SOURCE_EMAIL_UNAVAILABLE";
  else if (!identityCountValid) decision = "IDENTITY_COUNT_UNAVAILABLE";
  return {
    id: row.id,
    uuid_valid: valid,
    source_duplicate: sourceDuplicates.has(row.id),
    profile_exists: !!profile,
    auth_exists: targetAuth,
    email_conflict: !!emailConflict,
    target_email_collision: !!emailCollision,
    email_present: emailPresent,
    email_verified: emailVerified,
    identity_count_valid: identityCountValid,
    currently_banned: row.currently_banned === "t" || row.currently_banned === "true",
    decision,
  };
});
const counts = results.reduce(
  (acc, row) => ((acc[row.decision] = (acc[row.decision] ?? 0) + 1), acc),
  {},
);
const report = {
  mode: "DRY_RUN_ONLY",
  source_count: source.length,
  source_unique_uuids: new Set(source.map((r) => r.id)).size,
  counts,
  results,
};
if (outputMode === "--summary") {
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
