// Private host registry. UI imports templateCatalog.ts instead, never this module.
import { fogHarbor } from "./templates/fog-harbor/world";
import { createWorldTemplateRegistry } from "./templateRegistry";

export { fogHarbor } from "./templates/fog-harbor/world"; // Existing host/test imports stay compatible.
export type { WorldTemplate, WorldCondition, WorldEffect } from "./templateTypes";

const registry = createWorldTemplateRegistry([fogHarbor]);
export const getWorldTemplate = registry.resolve;
