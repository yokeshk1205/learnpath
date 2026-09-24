import "./environment.mjs";

export function getDatabaseConfig(environment = process.env) {
  const connectionString = environment.DATABASE_URL;
  let url;
  try { url = new URL(connectionString); } catch { /* Report instructions, never a credential-bearing URI. */ }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname || !url.username || url.pathname.length <= 1) {
    throw new Error("Set DATABASE_URL in the repository .env (or .env.local) to your PostgreSQL connection, including user, host, port and database name. See docs/local-setup.md.");
  }
  const ssl = environment.DATABASE_SSL ?? "false";
  if (!["true", "false"].includes(ssl)) throw new Error("DATABASE_SSL must be true or false.");
  return {
    connectionString,
    connectionTimeoutMillis: 5_000,
    ssl: ssl === "true" ? { rejectUnauthorized: true } : false,
  };
}

export function databaseFailureHint(code) {
  if (code === "28P01" || code === "28000") return "PostgreSQL rejected the login. Check the local username/password in DATABASE_URL.";
  if (code === "3D000") return "The configured database does not exist. Create it using docs/local-setup.md, then run migrations.";
  if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)) return "Cannot reach PostgreSQL. Start your installed PostgreSQL service and check DATABASE_URL host/port.";
  return "Database connection failed. Check PostgreSQL is running, DATABASE_URL and DATABASE_SSL, and the server logs. See docs/local-setup.md.";
}
