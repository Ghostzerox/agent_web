export const MEMORY_VIEWS = ["personal", "candidates", "knowledge", "navigation", "controls"] as const;
export type MemoryView = typeof MEMORY_VIEWS[number] | "learning";
export const MEMORY_VIEW_LINKS = [
  { href: "/memory", label: "长期记忆" }, { href: "/memory?view=candidates", label: "候选审核" },
  { href: "/memory?view=knowledge", label: "知识资料" }, { href: "/memory?view=navigation", label: "AI 记忆导航" }, { href: "/memory?view=controls", label: "读取控制与导出" },
];
export function resolveMemoryView(params: URLSearchParams): { view: MemoryView; error?: undefined } | { view?: undefined; error: string } {
  const fail = { error: "记忆链接参数无效或冲突。请使用下方明确入口重新打开；没有读取其他记忆域。" };
  if (["document", "version", "line", "palace", "view"].some((key) => params.getAll(key).length > 1)) return fail;
  if (params.has("document")) {
    if (params.has("palace") || params.has("view") || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(params.get("document") ?? "") || !/^[1-9]\d*$/u.test(params.get("version") ?? "") || (params.has("line") && !/^[1-9]\d*$/u.test(params.get("line") ?? ""))) return fail;
    return { view: "knowledge" };
  }
  if (params.has("version") || params.has("line")) return fail;
  if (params.has("palace")) return params.get("palace") === "learning" && !params.has("view") ? { view: "learning" } : fail;
  const view = params.get("view") ?? "personal";
  return MEMORY_VIEWS.includes(view as typeof MEMORY_VIEWS[number]) ? { view: view as MemoryView } : fail;
}
