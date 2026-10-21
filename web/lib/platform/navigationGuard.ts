const guards = new Map<string, string>();
let approvedUntil = 0;
let approvedDestination: string | undefined;

export function registerNavigationGuard(id: string, message: string): () => void {
  guards.set(id, message);
  return () => { guards.delete(id); };
}

export function navigationWarning(): string | null {
  return guards.size ? [...new Set(guards.values())].join("\n") : null;
}

export function isNavigationApproved(): boolean { return Date.now() < approvedUntil; }

export function requestNavigationPermission(confirm = (message: string) => window.confirm(message), destination?: string, continuation = false): boolean {
  if (continuation && destination && destination === approvedDestination && isNavigationApproved()) return true;
  const warning = navigationWarning();
  if (!warning) return true;
  if (!confirm(`${warning}\n确定离开吗？取消可继续编辑。`)) { approvedUntil = 0; approvedDestination = undefined; return false; }
  // Avoid a second beforeunload/hashchange prompt for this same approved navigation.
  approvedUntil = Date.now() + 500; approvedDestination = destination;
  return true;
}
