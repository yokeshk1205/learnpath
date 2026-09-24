import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "../config/environment.mjs";

export function initializeEnvironment(directory = projectRoot) {
  if ([".env.local", ".env"].some((name) => existsSync(resolve(directory, name)))) return false;
  const template = readFileSync(resolve(directory, ".env.example"), "utf8");
  const configured = template.replace(/^AUTH_ACCESS_TOKEN_SECRET=.*$/m,
    `AUTH_ACCESS_TOKEN_SECRET=${randomBytes(48).toString("hex")}`);
  // Never overwrite a local configuration, even if another process created it.
  writeFileSync(resolve(directory, ".env"), configured, { flag: "wx", mode: 0o600 });
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(initializeEnvironment() ? "Created .env with a new random authentication secret." : "Existing .env/.env.local preserved; no credentials were changed.");
  console.log("Set DATABASE_URL to your local PostgreSQL connection. Then run npm run setup:python, npm run db:check, and npm run db:migrate. See docs/local-setup.md.");
}
