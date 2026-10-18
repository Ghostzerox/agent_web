import { requestJson } from "@/lib/api/jsonRequest";
import type { PluginCapabilityId } from "@/lib/plugins/capabilityCatalog";

export type PluginKind = "skill" | "tool" | "activity" | "connector";
export type PluginInstallationStatus = "enabled" | "disabled" | "incompatible";
export type { PluginCapabilityId };

export type PluginCatalogItem = {
  manifest: {
    schemaVersion: "1";
    id: string;
    name: string;
    description: string;
    version: string;
    pluginApiVersion: string;
    kind: PluginKind;
    source: "first-party";
    availability: "foundation" | "available";
    contributions: {
      skills: string[];
      tools: string[];
      activities: string[];
      backgroundJobs: string[];
    };
    requestedCapabilities: PluginCapabilityId[];
  };
  compatibility:
    | { status: "compatible"; hostApiVersion: string; reason: null }
    | { status: "incompatible"; hostApiVersion: string; reason: string };
  installation: {
    status: PluginInstallationStatus;
    enabled: boolean;
    installedVersion: string | null;
    version: number;
    updateAvailable: boolean;
    updatedAt: string | null;
  };
};

export class PluginClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PluginClientError";
  }
}

export type PluginCapabilityDashboard = {
  pluginId: string;
  pluginVersion: string;
  pluginEnabled: boolean;
  capabilities: Array<{
    id: PluginCapabilityId;
    name: string;
    description: string;
    risk: "compute" | "private-storage" | "core-write";
    adapterStatus: "available" | "planned";
    grant: {
      status: "granted" | "revoked";
      effective: boolean;
      version: number;
      reviewedPluginVersion: string | null;
      requiresReview: boolean;
    };
    quota: {
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
    };
  }>;
};

export type PluginCapabilityAuditItem = {
  id: string;
  requestId: string;
  pluginId: string;
  capabilityId: PluginCapabilityId;
  operation: string;
  execution: "foreground" | "background" | "authorization";
  runId: string | null;
  outcome: "started" | "succeeded" | "denied" | "failed";
  errorCode: string | null;
  units: number;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new PluginClientError(message, code, status) });
}

export function listPlugins(): Promise<PluginCatalogItem[]> {
  return request("/api/v1/plugins");
}

export function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
  expectedVersion: number,
): Promise<PluginCatalogItem> {
  return request(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/${enabled ? "enable" : "disable"}`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}

export function getPluginCapabilities(
  pluginId: string,
): Promise<PluginCapabilityDashboard> {
  return request(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/capabilities`,
  );
}

export function setPluginCapabilityGrant(
  pluginId: string,
  capabilityId: PluginCapabilityId,
  granted: boolean,
  expectedVersion: number,
): Promise<PluginCapabilityDashboard> {
  return request(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/capabilities/${encodeURIComponent(capabilityId)}/${granted ? "grant" : "revoke"}`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}

export function listPluginCapabilityAudit(
  pluginId: string,
  limit = 20,
): Promise<PluginCapabilityAuditItem[]> {
  return request(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/audit?limit=${limit}`,
  );
}
