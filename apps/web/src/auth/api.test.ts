import { afterEach, describe, expect, it, vi } from "vitest";

import { loginRequest, registerRequest } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authentication API client", () => {
  it("uses credentialed requests without persisting the access token", async () => {
    const payload = {
      accessToken: "memory-only-token",
      accessTokenExpiresInSeconds: 900,
      user: {
        createdAt: "2026-08-28T00:00:00.000Z",
        displayName: "Ada",
        email: "ada@example.com",
        emailVerifiedAt: null,
        id: "6f48dc49-943a-4e6d-aee9-543588698108",
        lastLoginAt: null,
        roles: ["LEARNER"],
        status: "ACTIVE",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    const result = await loginRequest({ email: "ada@example.com", password: "secure-password" });

    expect(result.accessToken).toBe("memory-only-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("surfaces safe field-aware API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            details: { fields: { password: ["Password is too short."] } },
            message: "The submitted data is invalid.",
          },
        }),
        { headers: { "Content-Type": "application/json" }, status: 400 },
      ),
    );

    await expect(
      registerRequest({ displayName: "Ada", email: "ada@example.com", password: "short" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { password: ["Password is too short."] },
      status: 400,
    });
  });
});
