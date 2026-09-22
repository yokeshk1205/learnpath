import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "../errors.js";
import type { AccessPrincipal, PublicUser, RoleCode } from "./types.js";

const accessTokenSecret = new TextEncoder().encode(config.authAccessTokenSecret);
const issuer = "learnpath-api";
const audience = "learnpath-web";

const claimsSchema = z.object({
  email: z.string().email(),
  roles: z.array(z.enum(["ADMIN", "LEARNER"])),
  sub: z.string().uuid(),
});

export function createOpaqueRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(user: PublicUser): Promise<string> {
  return new SignJWT({ email: user.email, roles: user.roles })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.authAccessTokenTtlMinutes}m`)
    .sign(accessTokenSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessPrincipal> {
  try {
    const { payload } = await jwtVerify(token, accessTokenSecret, { audience, issuer });
    const claims = claimsSchema.parse(payload);

    return {
      email: claims.email,
      roles: claims.roles as RoleCode[],
      userId: claims.sub,
    };
  } catch {
    throw new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.");
  }
}

