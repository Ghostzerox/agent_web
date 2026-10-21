import { workspaceOwner, type WorkspaceOwner } from "./appRoutes";

export const WORKSPACE_SECTIONS = [
  { label: "你的空间", items: [
    { href: "/chat", label: "对话", mark: "聊", description: "专业解答、陪伴与反思" },
    { href: "/tasks", label: "任务", mark: "时", description: "行动、打卡与定时提醒" },
    { href: "/study", label: "学习", mark: "学", description: "背书、解题与助记宫殿" },
    { href: "/entertainment", label: "娱乐", mark: "游", description: "世界、故事与存档" },
    { href: "/content", label: "内容", mark: "书", description: "简报、书籍与思考问题" },
  ] },
  { label: "共用", items: [
    { href: "/inbox", label: "收件箱", mark: "信", description: "已投递的提醒与生成结果" },
    { href: "/settings", label: "设置", mark: "设", description: "模型、个人数据、表达与设备" },
  ] },
] as const;

export type ModuleLink = { href: string; label: string; description?: string };
export const MODULE_LINKS: Record<WorkspaceOwner, readonly ModuleLink[]> = {
  chat: [{ href: "/chat", label: "对话空间" }, { href: "/chat?view=tools", label: "专业工具" }],
  tasks: [
    { href: "/tasks", label: "任务首页" }, { href: "/tasks?section=actions", label: "行动与待办", description: "记录完成、跳过与截止时间" },
    { href: "/tasks?section=habits", label: "习惯打卡", description: "数量、时长与补卡" }, { href: "/tasks?section=goals", label: "目标", description: "目标与子行动" },
    { href: "/tasks?section=insights", label: "日历与统计", description: "查看行动记录和日周统计" },
    { href: "/tasks?section=reminders", label: "提醒联动", description: "显式关联已有普通提醒" }, { href: "/tasks?section=scheduled", label: "定时任务", description: "普通提醒、AI 任务及内容订阅" },
    { href: "/tasks?section=tools", label: "时间与行动工具", description: "时间预览与行动草稿" },
  ],
  study: [{ href: "/study", label: "学习首页" }, { href: "/study/memorization", label: "背书训练" }, { href: "/study/problem-solving", label: "解题训练" }, { href: "/study/memory-palaces", label: "助记宫殿" }, { href: "/study/tools", label: "学习工具" }],
  entertainment: [{ href: "/entertainment", label: "娱乐首页" }, { href: "/entertainment?view=worlds", label: "我的旅程", description: "继续已有存档，或从模板开始探索" }, { href: "/entertainment?view=creator", label: "我的世界", description: "描述世界、完善设定，再发布用于新旅程" }, { href: "/entertainment/quick-adventure", label: "轻量冒险", description: "原有规则包的配置与预览" }],
  content: [{ href: "/content", label: "内容首页" }, { href: "/content?view=briefing", label: "新闻简报", description: "订阅入口与来源检查" }, { href: "/reading", label: "书籍与阅读画像", description: "调整书籍推荐偏好" }, { href: "/reflection", label: "思考问题偏好", description: "订阅问题的目标与边界，不切换聊天模式" }, { href: "/content?view=tools", label: "内容工具", description: "来源与书目整理" }],
  inbox: [{ href: "/inbox", label: "全部投递" }, { href: "/inbox?source=personal_briefing", label: "简报" }, { href: "/inbox?source=book_recommendation", label: "书籍" }, { href: "/inbox?source=reflection_question", label: "思考问题" }],
  settings: [{ href: "/settings", label: "设置首页" }, { href: "/api-key", label: "模型服务", description: "Provider、凭据与用量" }, { href: "/memory", label: "个人数据", description: "记忆、资料与读取控制" }, { href: "/persona", label: "人格与表达" }, { href: "/proactivity", label: "主动联系" }, { href: "/voice", label: "语音" }, { href: "/notifications", label: "通知与设备" }, { href: "/plugins", label: "插件" }, { href: "/tools", label: "高级工具" }],
};

export function isWorkspaceRouteActive(current: string, target: string): boolean {
  return workspaceOwner(current) === target.slice(1);
}

/** Structural parent, not history.back(): a deep link must still have a way out. */
export function workspaceLocation(route: string, params: URLSearchParams, title: string): { label: string; parent?: ModuleLink } {
  const owner = workspaceOwner(route);
  if (!owner) return { label: title };
  const links = MODULE_LINKS[owner];
  const home = links[0];
  const here = `${route}${params.size ? `?${params}` : ""}`;
  const without = (...keys: string[]) => {
    const next = new URLSearchParams(params);
    keys.forEach((key) => next.delete(key));
    return `${route}${next.size ? `?${next}` : ""}`;
  };
  if (owner === "entertainment" && route === "/entertainment") {
    const view = params.get("view"), section = params.get("section");
    if (view === "creator" && params.has("world")) {
      const world = `/entertainment?view=creator&world=${encodeURIComponent(params.get("world")!)}&section=overview`;
      const design = section === "design-items" ? "道具设计" : section === "design-characters" ? "人物设计" : section === "design-events" ? "事件设计" : section === "draw-pools" ? "卡池配置" : null;
      if (design) return { label: design, parent: { href: params.has("design") || params.has("event") ? without("design", "event", "part", "eventPart") : world, label: params.has("design") || params.has("event") ? `${design}目录` : "世界工作台" } };
      return { label: "世界工作台", parent: links[2] };
    }
    if (params.has("session")) {
      if (view === "events" || view === "draws") return { label: view === "draws" ? "抽卡与获取" : "事件设计", parent: { href: `/entertainment?session=${encodeURIComponent(params.get("session")!)}`, label: "当前旅程" } };
      if (params.has("panel")) return { label: "旅程资料", parent: { href: without("panel"), label: "当前旅程" } };
      return { label: "当前旅程", parent: links[1] };
    }
  }
  if (route === "/tasks" && params.has("task")) return { label: "定时任务详情", parent: { href: "/tasks?section=scheduled", label: "定时任务" } };
  if (route === "/memory" && params.size) return { label: "个人数据子页", parent: { href: "/memory", label: "个人数据" } };
  const current = links.find((link) => {
    const target = new URL(link.href, "https://local.invalid");
    return target.pathname === route && [...target.searchParams].every(([key, value]) => params.get(key) === value) && (target.searchParams.size > 0 || params.size === 0);
  });
  // Prefer query-specific entries over the module root.
  const exact = links.find((link) => link.href === here) ?? current;
  return { label: exact?.label ?? title, parent: here === home.href ? undefined : home };
}

export function moduleLinkGroups(owner: WorkspaceOwner): { label: string; links: readonly ModuleLink[] }[] {
  const links = MODULE_LINKS[owner].slice(1);
  if (owner === "tasks") return [{ label: "行动与成长", links: links.slice(0, 4) }, { label: "提醒与工具", links: links.slice(4) }];
  if (owner === "settings") return [{ label: "模型与设备", links: links.filter((link) => ["/api-key", "/notifications"].includes(link.href)) }, { label: "记忆与陪伴", links: links.filter((link) => ["/memory", "/persona", "/proactivity", "/voice"].includes(link.href)) }, { label: "扩展", links: links.filter((link) => ["/plugins", "/tools"].includes(link.href)) }];
  return [{ label: "前往", links }];
}

// Ownership is not authorization; executor and plugin contracts remain unchanged.
export const MODULE_TOOL_IDS = {
  chat: ["professional.calculate", "professional.locate-evidence"], tasks: ["reflection.action-draft", "tasks.preview"],
  study: ["maintenance.import-preview", "professional.calculate", "professional.locate-evidence"], content: ["content.sources", "reading.bibliography"],
  voice: ["voice.preview"], plugins: ["plugins.inspect"],
} as const;
