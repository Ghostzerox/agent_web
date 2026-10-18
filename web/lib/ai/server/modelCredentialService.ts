import { CredentialCipherError, createApiKeyHint, decryptApiKey, encryptApiKey } from "@/lib/ai/server/credentialCipher";
import { fetchWithTransientDnsRetry } from "@/lib/ai/server/providerFetch";
import {
  ModelConfigError,
  normalizeBaseUrl,
  type ModelProviderConfig,
  type ModelProviderStatus,
} from "@/lib/ai/server/modelConfig";
import { getDatabase } from "@/lib/db/client";
import {
  createModelCredentialRepository,
  type ModelCredentialRepositoryPort,
} from "@/lib/repositories/modelCredentialRepository";

export type ModelCredentialInput = {
  apiKey: string;
  provider: string;
  baseUrl: string;
  model: string;
};

export type ModelCredentialPublicStatus = ModelProviderStatus & {
  source: "stored" | "none";
  provider: string | null;
  apiKeyHint: string | null;
  version: number | null;
};

export type ModelCredentialTestResult = {
  connected: true;
  modelAvailable: boolean;
};

export class ModelCredentialTestError extends Error {
  constructor(
    readonly code:
      | "PROVIDER_AUTH_FAILED"
      | "PROVIDER_RATE_LIMITED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_RESPONSE_INVALID",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelCredentialTestError";
  }
}

function unconfiguredStatus(): ModelCredentialPublicStatus {
  return { configured: false, source: "none", provider: null, baseUrl: null,
    model: null, apiKeyHint: null, version: null, missing: ["modelCredential"] };
}

function normalizeInput(input: ModelCredentialInput): ModelCredentialInput {
  return {
    apiKey: input.apiKey.trim(),
    provider: input.provider.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim(),
  };
}

export function createModelCredentialService(
  repositoryOrFactory:
    | ModelCredentialRepositoryPort
    | (() => ModelCredentialRepositoryPort),
  fetchProvider: typeof fetch = fetch,
) {
  const repository = (): ModelCredentialRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    async getStatus(): Promise<ModelCredentialPublicStatus> {
      const stored = await repository().get();
      if (!stored) return unconfiguredStatus();

      try {
        decryptApiKey(stored.encryptedApiKey);
        return {
          configured: true,
          source: "stored",
          provider: stored.provider,
          baseUrl: stored.baseUrl,
          model: stored.model,
          apiKeyHint: stored.apiKeyHint,
          version: stored.version,
          missing: [],
        };
      } catch (error) {
        if (!(error instanceof CredentialCipherError)) throw error;
        return {
          configured: false,
          source: "stored",
          provider: stored.provider,
          baseUrl: stored.baseUrl,
          model: stored.model,
          apiKeyHint: stored.apiKeyHint,
          version: stored.version,
          missing: ["CREDENTIAL_MASTER_KEY"],
        };
      }
    },

    async getConfig(): Promise<ModelProviderConfig> {
      const stored = await repository().get();
      if (!stored) throw new ModelConfigError(["modelCredential"]);

      try {
        return {
          apiKey: decryptApiKey(stored.encryptedApiKey),
          baseUrl: normalizeBaseUrl(stored.baseUrl),
          model: stored.model,
        };
      } catch (error) {
        if (error instanceof CredentialCipherError) {
          throw new ModelConfigError(["CREDENTIAL_MASTER_KEY"]);
        }
        throw error;
      }
    },

    async save(
      input: ModelCredentialInput,
    ): Promise<ModelCredentialPublicStatus> {
      const normalized = normalizeInput(input);
      const stored = await repository().save({
        provider: normalized.provider,
        baseUrl: normalized.baseUrl,
        model: normalized.model,
        encryptedApiKey: encryptApiKey(normalized.apiKey),
        apiKeyHint: createApiKeyHint(normalized.apiKey),
        encryptionKeyVersion: 1,
      });

      return {
        configured: true,
        source: "stored",
        provider: stored.provider,
        baseUrl: stored.baseUrl,
        model: stored.model,
        apiKeyHint: stored.apiKeyHint,
        version: stored.version,
        missing: [],
      };
    },

    async delete(): Promise<boolean> {
      return repository().delete();
    },

    async test(
      input: ModelCredentialInput,
      signal?: AbortSignal,
    ): Promise<ModelCredentialTestResult> {
      const normalized = normalizeInput(input);
      const timeoutSignal = AbortSignal.timeout(10_000);
      const providerSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
      let response: Response;
      try {
        response = await fetchWithTransientDnsRetry(
          fetchProvider,
          `${normalized.baseUrl}/models`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${normalized.apiKey}`,
            },
            signal: providerSignal,
          },
          providerSignal,
        );
      } catch {
        throw new ModelCredentialTestError(
          "PROVIDER_UNAVAILABLE",
          "The provider could not be reached.",
          true,
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new ModelCredentialTestError(
          "PROVIDER_AUTH_FAILED",
          "The provider rejected the API Key.",
          false,
        );
      }
      if (response.status === 429) {
        throw new ModelCredentialTestError(
          "PROVIDER_RATE_LIMITED",
          "The provider rate limit was reached.",
          true,
        );
      }
      if (!response.ok) {
        throw new ModelCredentialTestError(
          "PROVIDER_UNAVAILABLE",
          "The provider returned an unsuccessful response.",
          response.status >= 500,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ModelCredentialTestError(
          "PROVIDER_RESPONSE_INVALID",
          "The provider returned an invalid model list.",
          false,
        );
      }

      const ids =
        typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)
          ? (body as { data: unknown[] }).data
              .map((item) =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as { id?: unknown }).id === "string"
                  ? (item as { id: string }).id
                  : null,
              )
              .filter((id): id is string => id !== null)
          : null;
      if (!ids) {
        throw new ModelCredentialTestError(
          "PROVIDER_RESPONSE_INVALID",
          "The provider returned an invalid model list.",
          false,
        );
      }

      return {
        connected: true,
        modelAvailable: ids.includes(normalized.model),
      };
    },
  };
}

export function getModelCredentialService() {
  return createModelCredentialService(() =>
    createModelCredentialRepository(getDatabase()),
  );
}

export async function resolveModelProviderConfig(): Promise<ModelProviderConfig> {
  return getModelCredentialService().getConfig();
}

export async function resolveModelProviderStatus(): Promise<ModelCredentialPublicStatus> {
  return getModelCredentialService().getStatus();
}
