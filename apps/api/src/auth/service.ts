import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { config } from "../config.js";
import { AppError } from "../errors.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  createOpaqueRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";
import type {
  AccessPrincipal,
  AuthResult,
  AuthServiceContract,
  PublicUser,
  RequestContext,
  RoleCode,
} from "./types.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: PublicUser["status"];
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  roles: string[];
}

interface RefreshSessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
  status: PublicUser["status"];
}

const dummyPasswordHashPromise = hashPassword("not-a-real-password-used-for-timing-safety");

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRoleCode(value: string): value is RoleCode {
  return value === "ADMIN" || value === "LEARNER";
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    createdAt: row.created_at.toISOString(),
    displayName: row.display_name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
    id: row.id,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    roles: row.roles.filter(isRoleCode),
    status: row.status,
  };
}

async function selectUser(
  queryable: Pick<Pool | PoolClient, "query">,
  field: "email" | "id",
  value: string,
): Promise<UserRow | undefined> {
  const result = await queryable.query<UserRow>(
    `SELECT
       u.id,
       u.email,
       u.display_name,
       u.password_hash,
       u.status,
       u.email_verified_at,
       u.last_login_at,
       u.created_at,
       COALESCE(
         ARRAY_AGG(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
         ARRAY[]::TEXT[]
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.${field} = $1
     GROUP BY u.id`,
    [value],
  );
  return result.rows[0];
}

async function createRefreshSession(
  client: PoolClient,
  userId: string,
  context: RequestContext,
): Promise<{ rawToken: string; expiresAt: Date; sessionId: string }> {
  const rawToken = createOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const sessionId = randomUUID();
  const expiresAt = new Date(
    Date.now() + config.authRefreshTokenTtlDays * 24 * 60 * 60 * 1_000,
  );

  await client.query(
    `INSERT INTO refresh_sessions (
       id, user_id, token_hash, expires_at, user_agent, ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sessionId,
      userId,
      tokenHash,
      expiresAt,
      context.userAgent?.slice(0, 512) ?? null,
      context.ipAddress ?? null,
    ],
  );

  await client.query(
    `UPDATE refresh_sessions
     SET revoked_at = NOW()
     WHERE id IN (
       SELECT id
       FROM refresh_sessions
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC
       OFFSET 10
     )`,
    [userId],
  );

  return { expiresAt, rawToken, sessionId };
}

async function buildAuthResult(
  user: PublicUser,
  refreshSession: { rawToken: string; expiresAt: Date },
): Promise<AuthResult> {
  return {
    accessToken: await signAccessToken(user),
    accessTokenExpiresInSeconds: config.authAccessTokenTtlMinutes * 60,
    refreshToken: refreshSession.rawToken,
    refreshTokenExpiresAt: refreshSession.expiresAt,
    user,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class AuthService implements AuthServiceContract {
  constructor(private readonly pool: Pool) {}

  authenticateAccessToken(token: string): Promise<AccessPrincipal> {
    return verifyAccessToken(token);
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const row = await selectUser(this.pool, "id", userId);
    if (!row || row.status !== "ACTIVE") {
      throw new AppError(401, "ACCOUNT_UNAVAILABLE", "The account is no longer available.");
    }
    return toPublicUser(row);
  }

  async register(
    input: { displayName: string; email: string; password: string },
    context: RequestContext,
  ): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name)
         VALUES ($1, $2, $3, $4)`,
        [userId, email, passwordHash, displayName],
      );
      const roleAssignment = await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'LEARNER'`,
        [userId],
      );
      if (roleAssignment.rowCount !== 1) {
        throw new Error("The LEARNER role is missing. Run database migrations.");
      }

      const refreshSession = await createRefreshSession(client, userId, context);
      const row = await selectUser(client, "id", userId);
      if (!row) {
        throw new Error("Registered user could not be loaded.");
      }
      await client.query("COMMIT");
      return buildAuthResult(toPublicUser(row), refreshSession);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account already uses this email.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async login(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<AuthResult> {
    const row = await selectUser(this.pool, "email", normalizeEmail(input.email));
    if (!row) {
      await verifyPassword(await dummyPasswordHashPromise, input.password);
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const passwordIsValid = await verifyPassword(row.password_hash, input.password);
    if (!passwordIsValid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    if (row.status !== "ACTIVE") {
      throw new AppError(403, "ACCOUNT_DISABLED", "This account is not active.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();
      await client.query(
        "UPDATE users SET last_login_at = $2, updated_at = $2 WHERE id = $1",
        [row.id, now],
      );
      const refreshSession = await createRefreshSession(client, row.id, context);
      await client.query("COMMIT");
      return buildAuthResult(
        toPublicUser({ ...row, last_login_at: now }),
        refreshSession,
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const client = await this.pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const sessionResult = await client.query<RefreshSessionRow>(
        `SELECT
           rs.id,
           rs.user_id,
           rs.expires_at,
           rs.revoked_at,
           rs.replaced_by_session_id,
           u.status
         FROM refresh_sessions rs
         JOIN users u ON u.id = rs.user_id
         WHERE rs.token_hash = $1
         FOR UPDATE OF rs, u`,
        [tokenHash],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "The session is invalid or expired.");
      }

      if (session.revoked_at) {
        if (session.replaced_by_session_id) {
          await client.query(
            "UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1",
            [session.user_id],
          );
        }
        await client.query("COMMIT");
        transactionOpen = false;
        throw new AppError(401, "REFRESH_TOKEN_REUSED", "The session was revoked for safety.");
      }

      if (session.expires_at.getTime() <= Date.now() || session.status !== "ACTIVE") {
        await client.query(
          "UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1",
          [session.id],
        );
        await client.query("COMMIT");
        transactionOpen = false;
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "The session is invalid or expired.");
      }

      const userRow = await selectUser(client, "id", session.user_id);
      if (!userRow) {
        throw new AppError(401, "ACCOUNT_UNAVAILABLE", "The account is no longer available.");
      }
      const replacement = await createRefreshSession(client, session.user_id, context);
      await client.query(
        `UPDATE refresh_sessions
         SET revoked_at = NOW(), replaced_by_session_id = $2, last_used_at = NOW()
         WHERE id = $1`,
        [session.id, replacement.sessionId],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return buildAuthResult(toPublicUser(userRow), replacement);
    } catch (error) {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = COALESCE(revoked_at, NOW()), last_used_at = NOW()
       WHERE token_hash = $1`,
      [hashRefreshToken(refreshToken)],
    );
  }
}

export function createAuthService(pool: Pool): AuthServiceContract {
  return new AuthService(pool);
}

