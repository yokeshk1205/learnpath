export type RoleCode = "ADMIN" | "LEARNER";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleCode[];
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessPrincipal {
  userId: string;
  email: string;
  roles: RoleCode[];
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: PublicUser;
}

export interface AuthServiceContract {
  authenticateAccessToken(token: string): Promise<AccessPrincipal>;
  getCurrentUser(userId: string): Promise<PublicUser>;
  login(input: { email: string; password: string }, context: RequestContext): Promise<AuthResult>;
  logout(refreshToken: string | undefined): Promise<void>;
  refresh(refreshToken: string, context: RequestContext): Promise<AuthResult>;
  register(
    input: { displayName: string; email: string; password: string },
    context: RequestContext,
  ): Promise<AuthResult>;
}

