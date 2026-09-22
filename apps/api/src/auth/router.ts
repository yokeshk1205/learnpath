import type { CookieOptions, Request, Response } from "express";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuthentication } from "./middleware.js";
import type { AuthResult, AuthServiceContract, RequestContext } from "./types.js";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128, "Password cannot exceed 128 characters.");

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const authRateLimiter = rateLimit({
  handler: (_request, response) => {
    response.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." },
    });
  },
  legacyHeaders: false,
  limit: 10,
  skip: () => config.nodeEnvironment === "test",
  standardHeaders: "draft-8",
  windowMs: 15 * 60 * 1_000,
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "The submitted data is invalid.", {
      fields: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

function requestContext(request: Request): RequestContext {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  };
}

function refreshCookieOptions(expires?: Date): CookieOptions {
  return {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.nodeEnvironment === "production",
  };
}

function setRefreshCookie(response: Response, result: AuthResult): void {
  response.cookie(
    config.authRefreshCookieName,
    result.refreshToken,
    refreshCookieOptions(result.refreshTokenExpiresAt),
  );
}

function authResponse(result: AuthResult) {
  return {
    accessToken: result.accessToken,
    accessTokenExpiresInSeconds: result.accessTokenExpiresInSeconds,
    user: result.user,
  };
}

function enforceTrustedOrigin(request: Request): void {
  const origin = request.get("origin");
  if (origin && !config.webOrigins.includes(origin)) {
    throw new AppError(403, "UNTRUSTED_ORIGIN", "The request origin is not allowed.");
  }
}

export function createAuthRouter(authService: AuthServiceContract): Router {
  const router = Router();

  router.post("/register", authRateLimiter, async (request, response) => {
    enforceTrustedOrigin(request);
    const input = parseBody(registerSchema, request.body);
    const result = await authService.register(input, requestContext(request));
    setRefreshCookie(response, result);
    response.set("Cache-Control", "no-store").status(201).json(authResponse(result));
  });

  router.post("/login", authRateLimiter, async (request, response) => {
    enforceTrustedOrigin(request);
    const input = parseBody(loginSchema, request.body);
    const result = await authService.login(input, requestContext(request));
    setRefreshCookie(response, result);
    response.set("Cache-Control", "no-store").json(authResponse(result));
  });

  router.post("/refresh", async (request, response) => {
    enforceTrustedOrigin(request);
    const refreshToken = request.cookies[config.authRefreshCookieName] as string | undefined;
    if (!refreshToken) {
      throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "A valid session is required.");
    }
    const result = await authService.refresh(refreshToken, requestContext(request));
    setRefreshCookie(response, result);
    response.set("Cache-Control", "no-store").json(authResponse(result));
  });

  router.post("/logout", async (request, response) => {
    enforceTrustedOrigin(request);
    const refreshToken = request.cookies[config.authRefreshCookieName] as string | undefined;
    await authService.logout(refreshToken);
    response.clearCookie(config.authRefreshCookieName, refreshCookieOptions());
    response.status(204).send();
  });

  router.get("/me", requireAuthentication(authService), async (request, response) => {
    const user = await authService.getCurrentUser(request.auth!.userId);
    response.set("Cache-Control", "no-store").json({ user });
  });

  return router;
}
