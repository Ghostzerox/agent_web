import type { PluginCapabilityId } from "./capabilityCatalog";

export type PreparedCapabilityCall = {
  operation: string;
  units: number;
  input: unknown;
};

export interface PluginCapabilityAdapter {
  readonly capabilityId: PluginCapabilityId;
  prepare(input: unknown, context: { pluginId: string }): PreparedCapabilityCall;
  execute(input: {
    pluginId: string;
    prepared: PreparedCapabilityCall;
    now: Date;
  }): Promise<unknown>;
}
