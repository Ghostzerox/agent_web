import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthApi } from "@/lib/api/healthApi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health API", () => {
  it("reports healthy when database and model configuration are ready", async () => {
    const response = await createHealthApi({
      checkDatabase: async () => undefined,
      getModelStatus: () => ({
        configured: true,
        baseUrl: "https://provider.example",
        model: "test-model",
        missing: [],
      }),
      now: () => new Date("2026-09-06T00:00:00.000Z"),
    }).check();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        status: "healthy",
        timestamp: "2026-09-06T00:00:00.000Z",
        checks: { database: "ready", modelProvider: "configured" },
      },
    });
  });

  it("keeps the service ready but degraded when only the model is missing", async () => {
    const response = await createHealthApi({
      checkDatabase: async () => undefined,
      getModelStatus: () => ({
        configured: false,
        baseUrl: null,
        model: null,
        missing: ["modelCredential"],
      }),
      now: () => new Date(0),
    }).check();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "degraded",
        checks: { database: "ready", modelProvider: "not_configured" },
      },
    });
  });

  it("returns 503 without leaking database errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createHealthApi({
      checkDatabase: async () => {
        throw new Error("postgresql://secret:password@private-host/database");
      },
      getModelStatus: () => ({
        configured: true,
        baseUrl: "https://provider.example",
        model: "test-model",
        missing: [],
      }),
      now: () => new Date(0),
    }).check();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data).toMatchObject({
      status: "unhealthy",
      checks: { database: "unavailable" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("returns 503 without leaking credential status errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createHealthApi({
      checkDatabase: async () => undefined,
      getModelStatus: async () => {
        throw new Error("credential secret detail");
      },
      now: () => new Date(0),
    }).check();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data).toMatchObject({
      status: "unhealthy",
      checks: {
        database: "unavailable",
        modelProvider: "not_configured",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
