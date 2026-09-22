export type RoleCode = "ADMIN" | "LEARNER";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleCode[];
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthPayload {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  user: AuthUser;
}

interface ErrorPayload {
  error?: {
    code?: string;
    details?: { fields?: Record<string, string[]> };
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
    throw new ApiError(
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "The request could not be completed.",
      payload.error?.details?.fields,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function loginRequest(input: { email: string; password: string }): Promise<AuthPayload> {
  return apiRequest<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function registerRequest(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthPayload> {
  return apiRequest<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function refreshRequest(): Promise<AuthPayload> {
  return apiRequest<AuthPayload>("/auth/refresh", { method: "POST" });
}

export function logoutRequest(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function currentUserRequest(accessToken: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
