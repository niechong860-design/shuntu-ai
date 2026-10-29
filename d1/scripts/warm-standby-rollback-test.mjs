#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const { resolveDatabasePrimary, shouldAllowWarmStandbyReadFallback } =
  await import("../../src/lib/database-primary.ts");
const { runReplicationBatch } = await import("../../src/lib/replication-runtime.ts");

assert.equal(resolveDatabasePrimary({}), "d1");
assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "d1" }), "d1");
assert.throws(
  () => resolveDatabasePrimary({ DATABASE_PRIMARY: "lovable" }),
  /LEGACY_LOVABLE_DATABASE_DISABLED/,
);
assert.throws(
  () => resolveDatabasePrimary({ DATABASE_PRIMARY: "dual" }),
  /UNSUPPORTED_DATABASE_PRIMARY/,
);
assert.equal(
  shouldAllowWarmStandbyReadFallback({
    primary: "d1",
    className: "critical_business",
    d1Error: new Error("synthetic"),
  }),
  false,
);
assert.deepEqual(await runReplicationBatch({}), {
  scanned: 0,
  synced: 0,
  failed: 0,
  deferred: 0,
  disabled: true,
});
assert.match(
  fs.readFileSync(path.join(repoRoot, "src/lib/database-primary.ts"), "utf8"),
  /D1 is the only supported production authority/,
);
assert.match(
  fs.readFileSync(path.join(repoRoot, "src/lib/replication-runtime.ts"), "utf8"),
  /disabled: true/,
);
console.log(
  JSON.stringify(
    {
      ok: true,
      databasePrimaryDefault: resolveDatabasePrimary({}),
      legacyAuthorityRejected: true,
      warmStandbyFallbackDisabled: true,
      replicationRuntimeDisabled: true,
    },
    null,
    2,
  ),
);
