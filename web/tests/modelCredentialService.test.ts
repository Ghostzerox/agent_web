import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModelCredentialService,
  ModelCredentialTestError,
} from "@/lib/ai/server/modelCredentialService";
import type { ModelCredentialRecord } from "@/lib/db/schema";
import type {
  ModelCredentialRepositoryPort,
  SaveModelCredentialInput,
} from "@/lib/repositories/modelCredentialRepository";

class MemoryCredentialRepository implements ModelCredentialRepositoryPort {
  record: ModelCredentialRecord | null = null;

  async get() {
    return this.record;
  }

  async save(input: SaveModelCredentialInput) {
    const now = new Date();
    this.record = {
      id: this.record?.id ?? "00000000-0000-4000-8000-000000000002",
      userId: "00000000-0000-4000-8000-000000000001",
      ...input,
      version: (this.record?.version ?? 0) + 1,
      createdAt: this.record?.createdAt ?? now,
      updatedAt: now,
    };
    return this.record;
  }

  async delete() {
    const existed = this.record !== null;
    this.record = null;
    return existed;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ModelCredentialService", () => {
  it("does not fall back to environment credentials before save or after deletion", async () => {
    vi.stubEnv("AI_API_KEY", "retired-secret");
    vi.stubEnv("AI_BASE_URL", "https://retired.example/v1");
    vi.stubEnv("AI_MODEL", "retired-model");
    vi.stubEnv("CREDENTIAL_MASTER_KEY", randomBytes(32).toString("base64url"));
    const fetcher = vi.fn();
    const service = createModelCredentialService(new MemoryCredentialRepository(), fetcher);
    await expect(service.getStatus()).resolves.toMatchObject({ configured: false, source: "none", missing: ["modelCredential"] });
    await expect(service.getConfig()).rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED" });
    await service.save({ apiKey: "current-secret", provider: "custom", baseUrl: "https://current.example/v1", model: "current" });
    await expect(service.getConfig()).resolves.toMatchObject({ apiKey: "current-secret", model: "current" });
    await service.delete();
    await expect(service.getStatus()).resolves.toMatchObject({ configured: false, source: "none" });
    await expect(service.getConfig()).rejects.toMatchObject({ missing: ["modelCredential"] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("encrypts a saved Key and resolves it only for server model calls", async () => {
    const repository = new MemoryCredentialRepository();
    vi.stubEnv("CREDENTIAL_MASTER_KEY", randomBytes(32).toString("base64url"));
    const service = createModelCredentialService(repository);

    const status = await service.save({
      apiKey: "sk-secret-value",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/",
      model: "deepseek-v4-flash-vision-exp",
    });

    expect(status).toMatchObject({
      configured: true,
      source: "stored",
      provider: "deepseek",
      apiKeyHint: "••••alue",
      baseUrl: "https://api.deepseek.com",
    });
    expect(JSON.stringify(status)).not.toContain("sk-secret-value");
    expect(repository.record?.encryptedApiKey).not.toContain("sk-secret-value");
    await expect(service.getConfig()).resolves.toEqual({
      apiKey: "sk-secret-value",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash-vision-exp",
    });
  });

  it("tests provider authentication and reports model availability", async () => {
    const repository = new MemoryCredentialRepository();
    const fetchProvider = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { id: "deepseek-v4-flash" },
          { id: "deepseek-v4-flash-vision-exp" },
        ],
      }),
    );
    const service = createModelCredentialService(repository, fetchProvider);

    await expect(
      service.test({
        apiKey: "sk-test-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash-vision-exp",
      }),
    ).resolves.toEqual({ connected: true, modelAvailable: true });

    expect(fetchProvider).toHaveBeenCalledWith(
      "https://api.deepseek.com/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer sk-test-value",
        }),
      }),
    );
  });

  it("retries a transient DNS failure while testing the provider", async () => {
    const repository = new MemoryCredentialRepository();
    const fetchProvider = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), {
          cause: { code: "EAI_AGAIN" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ id: "model" }] }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = createModelCredentialService(repository, fetchProvider);

    await expect(
      service.test({
        apiKey: "sk-test-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "model",
      }),
    ).resolves.toEqual({ connected: true, modelAvailable: true });

    expect(fetchProvider).toHaveBeenCalledTimes(2);
  });

  it("maps provider authentication failures without returning its body", async () => {
    const repository = new MemoryCredentialRepository();
    const service = createModelCredentialService(
      repository,
      vi.fn().mockResolvedValue(
        new Response("sensitive upstream body", { status: 401 }),
      ),
    );

    await expect(
      service.test({
        apiKey: "sk-wrong-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "model",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      retryable: false,
    } satisfies Partial<ModelCredentialTestError>);
  });
});
