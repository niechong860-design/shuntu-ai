import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../d1/scripts/auth-migration-dry-run.mjs", import.meta.url));
const uuid = "61080148-8000-4000-8000-000000000001";

function csv(headers, rows) {
  return (
    [headers.join(","), ...rows.map((row) => headers.map((key) => row[key] ?? "").join(","))].join(
      "\n",
    ) + "\n"
  );
}

test("auth migration dry-run preserves UUID and only returns a candidate after constraints pass", () => {
  const directory = mkdtempSync(join(tmpdir(), "shuntu-auth-dry-run-"));
  try {
    const source = join(directory, "source.csv");
    const profiles = join(directory, "profiles.csv");
    const auth = join(directory, "auth.csv");
    writeFileSync(
      source,
      csv(
        [
          "id",
          "email",
          "email_present",
          "email_verified",
          "created_at",
          "identity_count",
          "currently_banned",
        ],
        [
          {
            id: uuid,
            email: "candidate@example.invalid",
            email_present: "true",
            email_verified: "true",
            created_at: "2026-01-01",
            identity_count: "1",
            currently_banned: "false",
          },
        ],
      ),
    );
    writeFileSync(profiles, csv(["id", "email"], []));
    writeFileSync(auth, csv(["user_id", "email"], []));
    const result = spawnSync(process.execPath, [script, source, profiles, auth], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.results[0].id, uuid);
    assert.equal(report.results[0].decision, "DRY_RUN_CANDIDATE");
    assert.equal(report.mode, "DRY_RUN_ONLY");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
