import { ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  pluginCapabilityIdSchema,
  type PluginCapabilityId,
} from "@/lib/plugins/capabilityCatalog";
import { getFirstPartyPluginRegistry } from "@/lib/plugins/pluginRegistry";
import {
  createPluginCapabilityRepository,
  PluginCapabilityRepositoryError,
  type PluginCapabilityRepositoryPort,
} from "@/lib/repositories/pluginCapabilityRepository";
import {
  createPluginStorageRepository,
  PluginStorageRepositoryError,
  type PluginStorageRepositoryPort,
} from "@/lib/repositories/pluginStorageRepository";
import {
  createControlledModelCapabilityAdapter,
  createTaskDraftCapabilityAdapter,
} from "@/lib/plugins/hostCapabilityAdapters";
import {
  pluginExecutionContextSchema,
  pluginStorageRequestSchema,
  type PluginExecutionContext,
} from "@/lib/plugins/pluginApiV1";

export type { PluginExecutionContext } from "@/lib/plugins/pluginApiV1";

import type { PluginCapabilityAdapter, PreparedCapabilityCall } from "@/lib/plugins/capabilityAdapter";

export type PluginCapabilityGatewayErrorCode =
  | "CAPABILITY_CONTEXT_INVALID"
  | "CAPABILITY_INPUT_INVALID"
  | "CAPABILITY_UNAVAILABLE"
  | "CAPABILITY_ADAPTER_FAILED"
  | "CAPABILITY_AUDIT_FAILED";

export class PluginCapabilityGatewayError extends Error {
  constructor(
    readonly code: PluginCapabilityGatewayErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PluginCapabilityGatewayError";
  }
}

function errorCode(error: unknown): string {
  if (error instanceof ZodError) return "CAPABILITY_CONTEXT_INVALID";
  if (
    error instanceof PluginCapabilityGatewayError ||
    error instanceof PluginCapabilityRepositoryError ||
    error instanceof PluginStorageRepositoryError
  ) {
    return error.code;
  }
  return "CAPABILITY_ADAPTER_FAILED";
}

export class PluginCapabilityGateway {
  private readonly adapters = new Map<PluginCapabilityId, PluginCapabilityAdapter>();

  constructor(
    private readonly policy: PluginCapabilityRepositoryPort,
    adapters: readonly PluginCapabilityAdapter[],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.capabilityId)) {
        throw new Error(`Duplicate capability adapter: ${adapter.capabilityId}`);
      }
      this.adapters.set(adapter.capabilityId, adapter);
    }
  }

  async invoke(input: {
    pluginId: string;
    capabilityId: PluginCapabilityId;
    payload: unknown;
    context: PluginExecutionContext;
  }): Promise<{ requestId: string; data: unknown }> {
    const requestId = crypto.randomUUID();
    const startedAt = this.now();
    let execution: "foreground" | "background" = input.context.execution;
    let runId: string | null = input.context.runId;
    let operation = "invoke";
    let units = 0;
    let auditId: string | null = null;
    try {
      const context = pluginExecutionContextSchema.parse(input.context);
      execution = context.execution;
      runId = context.runId;
      const capabilityId = pluginCapabilityIdSchema.parse(input.capabilityId);
      const adapter = this.adapters.get(capabilityId);
      if (!adapter) {
        throw new PluginCapabilityGatewayError(
          "CAPABILITY_UNAVAILABLE",
          "This capability does not have a host adapter yet.",
        );
      }
      let prepared: PreparedCapabilityCall;
      try {
        prepared = adapter.prepare(input.payload, { pluginId: input.pluginId });
      } catch (error) {
        throw new PluginCapabilityGatewayError(
          "CAPABILITY_INPUT_INVALID",
          "The plugin capability request is invalid.",
          error,
        );
      }
      operation = prepared.operation;
      units = prepared.units;
      if (!Number.isInteger(units) || units < 1 || units > 1_000) {
        throw new PluginCapabilityGatewayError(
          "CAPABILITY_INPUT_INVALID",
          "Capability units must be an integer between 1 and 1000.",
        );
      }
      await this.policy.reserveInvocation({
        pluginId: input.pluginId,
        capabilityId,
        units,
        now: startedAt,
      });
      try {
        auditId = await this.policy.startAudit({
          requestId,
          pluginId: input.pluginId,
          capabilityId,
          operation,
          execution,
          runId,
          units,
          now: startedAt,
        });
      } catch (error) {
        throw new PluginCapabilityGatewayError(
          "CAPABILITY_AUDIT_FAILED",
          "The host could not start a capability audit record.",
          error,
        );
      }
      const data = await adapter.execute({
        pluginId: input.pluginId,
        prepared,
        now: startedAt,
      });
      const completedAt = this.now();
      await this.policy.finishAudit({
        auditId,
        outcome: "succeeded",
        errorCode: null,
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        now: completedAt,
      });
      return { requestId, data };
    } catch (error) {
      const completedAt = this.now();
      const code = errorCode(error);
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      try {
        if (auditId) {
          await this.policy.finishAudit({
            auditId,
            outcome: "failed",
            errorCode: code,
            durationMs,
            now: completedAt,
          });
        } else if (pluginCapabilityIdSchema.safeParse(input.capabilityId).success) {
          await this.policy.recordDeniedAudit({
            requestId,
            pluginId: input.pluginId,
            capabilityId: input.capabilityId,
            operation,
            execution,
            runId,
            units,
            errorCode: code,
            durationMs,
            now: completedAt,
          });
        }
      } catch (auditError) {
        if (!(error instanceof PluginCapabilityGatewayError && error.code === "CAPABILITY_AUDIT_FAILED")) {
          throw new PluginCapabilityGatewayError(
            "CAPABILITY_AUDIT_FAILED",
            "The host could not complete the capability audit record.",
            auditError,
          );
        }
      }
      if (error instanceof ZodError) {
        throw new PluginCapabilityGatewayError(
          "CAPABILITY_CONTEXT_INVALID",
          "The plugin execution context is invalid.",
          error,
        );
      }
      if (
        error instanceof PluginCapabilityGatewayError ||
        error instanceof PluginCapabilityRepositoryError ||
        error instanceof PluginStorageRepositoryError
      ) {
        throw error;
      }
      throw new PluginCapabilityGatewayError(
        "CAPABILITY_ADAPTER_FAILED",
        "The capability adapter failed.",
        error,
      );
    }
  }
}

export function createPluginStorageCapabilityAdapter(
  storage: PluginStorageRepositoryPort,
): PluginCapabilityAdapter {
  return {
    capabilityId: "storage.read-write",
    prepare(input) {
      const request = pluginStorageRequestSchema.parse(input);
      return { operation: `storage.${request.operation}`, units: 1, input: request };
    },
    async execute({ pluginId, prepared, now }) {
      const request = pluginStorageRequestSchema.parse(prepared.input);
      switch (request.operation) {
        case "get":
          return storage.get(pluginId, request.key);
        case "list":
          return storage.list(pluginId, request.prefix, request.limit);
        case "set":
          return storage.set({
            pluginId,
            key: request.key,
            value: request.value,
            expectedVersion: request.expectedVersion,
            now,
          });
        case "delete":
          return storage.delete({
            pluginId,
            key: request.key,
            expectedVersion: request.expectedVersion,
          });
      }
    },
  };
}

export function getPluginCapabilityGateway(): PluginCapabilityGateway {
  const database = getDatabase();
  const policy = createPluginCapabilityRepository(
    database,
    getFirstPartyPluginRegistry(),
  );
  const storage = createPluginStorageRepository(database);
  return new PluginCapabilityGateway(policy, [
    createControlledModelCapabilityAdapter(),
    createPluginStorageCapabilityAdapter(storage),
    createTaskDraftCapabilityAdapter(),
  ]);
}
