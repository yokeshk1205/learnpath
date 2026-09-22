import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LearnPath product direction", () => {
  it("renders the learner-first personalized-path direction and live service states", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({
          service: "test-service",
          status: "ok",
          timestamp: "2026-08-28T00:00:00.000Z",
          version: "0.1.0",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )),
    );

    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: /start where you are. grow from there/i })).toBeInTheDocument();
    expect(screen.getByText(/guides you to the right next lesson/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Online")).toHaveLength(2));
  });

  it("shows offline status when services cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unavailable"));

    render(<LandingPage />);

    await waitFor(() => expect(screen.getAllByText("Offline")).toHaveLength(2));
  });
});
