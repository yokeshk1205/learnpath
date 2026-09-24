import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One connection/configuration regardless of an npm workspace's working directory.
// Explicit process settings win; private local settings override the base file.
export function loadEnvironment(directory = projectRoot, environment = process.env) {
  const files = [".env.local", ".env"].map((name) => resolve(directory, name)).filter(existsSync);
  if (files.length) {
    const result = dotenv.config({ path: files, processEnv: environment, override: false, quiet: true });
    if (result.error) throw new Error("Could not read LearnPath environment configuration.");
  }
  return environment;
}

// Tests must opt into a connection explicitly, never inherit a personal database.
if (process.env.NODE_ENV !== "test") loadEnvironment();
