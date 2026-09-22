import "dotenv/config";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const { Client } = pg;
const migrationsDirectory = path.resolve(process.cwd(), "database/migrations");
const isStatusOnly = process.argv.includes("--status");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.");
}

const client = new Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
});

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const appliedResult = await client.query<{ version: string; checksum: string }>(
    "SELECT version, checksum FROM schema_migrations ORDER BY version",
  );
  const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

  for (const file of migrationFiles) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existingChecksum = applied.get(file);

    if (existingChecksum && existingChecksum !== checksum) {
      throw new Error(`Applied migration ${file} has been modified.`);
    }

    if (isStatusOnly) {
      console.log(`${existingChecksum ? "applied" : "pending"}\t${file}`);
      continue;
    }

    if (existingChecksum) {
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
        [file, checksum],
      );
      await client.query("COMMIT");
      console.log(`applied\t${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  if (!isStatusOnly) {
    console.log("Database migrations are current.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });

