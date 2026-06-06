import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "credit_usage_logs",
  "profiles",
  "generation_tasks",
  "generation_history",
  "coupons",
  "redeem_logs",
];

const PAGE_SIZE = 1000;

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const timestamp = formatTimestamp(new Date());
const backupDir = path.join(
  process.cwd(),
  "backups",
  "shuntu-db",
  timestamp,
);

await mkdir(backupDir, { recursive: true });

const results = [];

for (const table of TABLES) {
  try {
    const rows = await readAllRows(table);
    await writeTableBackup(table, rows);

    results.push({ table, rows: rows.length, ok: true });
    console.log(`${table}: exported ${rows.length} rows`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    results.push({ table, rows: 0, ok: false, error: reason });
    console.error(`${table}: failed - ${reason}`);
  }
}

const failed = results.filter((result) => !result.ok);

await writeFile(
  path.join(backupDir, "_backup-summary.json"),
  `${JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      tables: results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (failed.length > 0) {
  console.error(`Backup finished with ${failed.length} failed table(s).`);
  process.exitCode = 1;
} else {
  console.log("Backup finished successfully.");
}

console.log(`Output directory: ${backupDir}`);

async function readAllRows(table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to);

    if (error) {
      throw error;
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      return rows;
    }

    from += PAGE_SIZE;
  }
}

async function writeTableBackup(table, rows) {
  const jsonPath = path.join(backupDir, `${table}.json`);
  const csvPath = path.join(backupDir, `${table}.csv`);

  await writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await writeFile(csvPath, toCsv(rows), "utf8");
}

function toCsv(rows) {
  const columns = collectColumns(rows);
  const lines = [columns.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function collectColumns(rows) {
  const columns = new Set();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }

  return [...columns];
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
