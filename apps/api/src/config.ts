import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  AUTH_REFRESH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("learnpath_refresh"),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://learnpath:learnpath@localhost:5432/learnpath"),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  ML_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RETENTION_BASE_LAMBDA: z.coerce.number().min(0.001).max(1).default(0.025),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const environment = environmentSchema.parse(process.env);
const developmentOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const webOrigins = Array.from(
  new Set([
    environment.WEB_ORIGIN,
    ...(environment.NODE_ENV === "production" ? [] : developmentOrigins),
  ]),
);

export const config = {
  authAccessTokenSecret: environment.AUTH_ACCESS_TOKEN_SECRET,
  authAccessTokenTtlMinutes: environment.AUTH_ACCESS_TOKEN_TTL_MINUTES,
  authRefreshCookieName: environment.AUTH_REFRESH_COOKIE_NAME,
  authRefreshTokenTtlDays: environment.AUTH_REFRESH_TOKEN_TTL_DAYS,
  databaseSsl: environment.DATABASE_SSL === "true",
  databaseUrl: environment.DATABASE_URL,
  mlServiceTimeoutMs: environment.ML_SERVICE_TIMEOUT_MS,
  mlServiceUrl: environment.ML_SERVICE_URL.replace(/\/$/, ""),
  nodeEnvironment: environment.NODE_ENV,
  port: environment.API_PORT,
  retentionBaseLambda: environment.RETENTION_BASE_LAMBDA,
  webOrigins,
} as const;
