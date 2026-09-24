import pg from "pg";
import { databaseFailureHint, getDatabaseConfig } from "../config/database.mjs";

let client;
try {
  client = new pg.Client(getDatabaseConfig());
  await client.connect();
  // Deliberately read-only: neither creates tables nor changes learner data.
  const result = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS migrated");
  console.log("PostgreSQL connection OK.");
  if (!result.rows[0].migrated) console.log("Fresh database: run npm run db:migrate before starting LearnPath.");
} catch (error) {
  console.error(client ? databaseFailureHint(error.code) : error.message);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => undefined);
}
