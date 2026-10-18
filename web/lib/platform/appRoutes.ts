/** Current page ownership, not permission grants. Hosts keep their own static page loaders. */
export const MODULE_ROUTE_PATHS = {
  chat: ["/chat"],
  tasks: ["/tasks"],
  study: ["/study", "/study/memorization", "/study/problem-solving", "/study/memory-palaces", "/study/tools"],
  entertainment: ["/entertainment", "/entertainment/quick-adventure"],
  content: ["/content", "/reading", "/reflection"],
  inbox: ["/inbox"],
  settings: ["/settings", "/memory", "/api-key", "/persona", "/proactivity", "/voice", "/notifications", "/plugins", "/tools"],
} as const;

export type WorkspaceOwner = keyof typeof MODULE_ROUTE_PATHS;
export type AppRoute = "/" | typeof MODULE_ROUTE_PATHS[WorkspaceOwner][number];

export function workspaceOwner(path: string): WorkspaceOwner | null {
  for (const [owner, routes] of Object.entries(MODULE_ROUTE_PATHS)) {
    if (routes.some((route) => route === path) || path.startsWith(`/${owner}/`)) return owner as WorkspaceOwner;
  }
  return null;
}
