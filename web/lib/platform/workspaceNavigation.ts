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

export type WorkspaceOwner = "chat" | "tasks" | "study" | "entertainment" | "content" | "inbox" | "settings";
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
  entertainment: [{ href: "/entertainment", label: "娱乐首页" }, { href: "/entertainment?view=worlds", label: "世界与存档", description: "选择探索模板，继续已有故事" }, { href: "/entertainment/quick-adventure", label: "轻量冒险", description: "原有规则包的配置与预览" }],
  content: [{ href: "/content", label: "内容首页" }, { href: "/content?view=briefing", label: "新闻简报", description: "订阅入口与来源检查" }, { href: "/reading", label: "书籍与阅读画像", description: "调整书籍推荐偏好" }, { href: "/reflection", label: "思考问题偏好", description: "订阅问题的目标与边界，不切换聊天模式" }, { href: "/content?view=tools", label: "内容工具", description: "来源与书目整理" }],
  inbox: [{ href: "/inbox", label: "全部投递" }, { href: "/inbox?source=personal_briefing", label: "简报" }, { href: "/inbox?source=book_recommendation", label: "书籍" }, { href: "/inbox?source=reflection_question", label: "思考问题" }],
  settings: [{ href: "/settings", label: "设置首页" }, { href: "/api-key", label: "模型服务", description: "Provider、凭据与用量" }, { href: "/memory", label: "个人数据", description: "记忆、资料与读取控制" }, { href: "/persona", label: "人格与表达" }, { href: "/proactivity", label: "主动联系" }, { href: "/voice", label: "语音" }, { href: "/notifications", label: "通知与设备" }, { href: "/plugins", label: "插件" }, { href: "/tools", label: "高级工具" }],
};

export function workspaceOwner(path: string, params = new URLSearchParams()): WorkspaceOwner | null {
  if (path === "/memory" && params.getAll("palace").length === 1 && params.get("palace") === "learning" && !params.has("document") && !params.has("view")) return "study";
  if (["/reading", "/reflection"].includes(path)) return "content";
  if (["/memory", "/api-key", "/persona", "/proactivity", "/voice", "/notifications", "/plugins", "/tools"].includes(path)) return "settings";
  return (WORKSPACE_SECTIONS.flatMap((section) => [...section.items]).find((item) => path === item.href || path.startsWith(`${item.href}/`))?.href.slice(1) as WorkspaceOwner | undefined) ?? null;
}
export function isWorkspaceRouteActive(current: string, target: string, params = new URLSearchParams()): boolean {
  return workspaceOwner(current, params) === target.slice(1);
}

// Ownership is not authorization; executor and plugin contracts remain unchanged.
export const MODULE_TOOL_IDS = {
  chat: ["professional.calculate", "professional.locate-evidence"], tasks: ["reflection.action-draft", "tasks.preview"],
  study: ["maintenance.import-preview", "professional.calculate", "professional.locate-evidence"], content: ["content.sources", "reading.bibliography"],
  voice: ["voice.preview"], plugins: ["plugins.inspect"],
} as const;
