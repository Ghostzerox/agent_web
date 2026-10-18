// Private host registry. UI imports templateCatalog.ts instead, never this module.
import { fogHarbor } from "./templates/fog-harbor/world";
import { createWorldTemplateRegistry } from "./templateRegistry";

const registry = createWorldTemplateRegistry([fogHarbor]);
export const getWorldTemplate = registry.resolve;
