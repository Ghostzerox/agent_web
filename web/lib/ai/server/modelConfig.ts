export type ModelProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ModelProviderStatus = {
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  missing: string[];
};

export class ModelConfigError extends Error {
  readonly code = "MODEL_NOT_CONFIGURED";

  constructor(readonly missing: string[]) {
    super(`Model configuration is missing: ${missing.join(", ")}.`);
    this.name = "ModelConfigError";
  }
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Base URL must be an absolute URL.");
  }

  const allowInsecure = process.env.AI_ALLOW_INSECURE_HTTP === "true";
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new Error(
      "Base URL must use HTTPS unless AI_ALLOW_INSECURE_HTTP=true.",
    );
  }

  if (url.username || url.password) {
    throw new Error("Base URL must not contain embedded credentials.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
