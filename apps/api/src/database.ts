import pg from "pg";

import { config } from "./config.js";
import { logger } from "./logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionTimeoutMillis: 3_000,
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
});

pool.on("error", (error) => {
  logger.error({ error }, "Unexpected error from an idle PostgreSQL client");
});

export async function probeDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
