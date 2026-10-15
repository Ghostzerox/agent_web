export const WORKSPACE_SECTIONS = [
  { label: "对话与探索", items: [
    { href: "/chat", label: "对话空间", mark: "聊", description: "自动 · 专业 · 陪伴 · 反思" },
    { href: "/study", label: "学习模式", mark: "学", description: "背诵、解题与复习" },
    { href: "/entertainment", label: "娱乐模式", mark: "游", description: "角色扮演与 AI 跑团" },
    { href: "/tools", label: "工具工作台", mark: "具", description: "计算、证据定位与草稿预览" },
  ] },
  { label: "日常与内容", items: [
    { href: "/tasks", label: "任务与提醒", mark: "时", description: "定时安排" },
    { href: "/inbox", label: "收件箱", mark: "信", description: "提醒与生成结果" },
    { href: "/reading", label: "阅读画像", mark: "书", description: "书籍推荐偏好" },
    { href: "/reflection", label: "思考问题", mark: "思", description: "反思内容偏好，不切换对话" },
  ] },
  { label: "你的设置", items: [
    { href: "/persona", label: "人格设置", mark: "人", description: "表达风格" },
    { href: "/memory", label: "记忆", mark: "记", description: "长期信息与候选审核" },
    { href: "/proactivity", label: "主动问候", mark: "伴", description: "你掌控联系的频率" },
    { href: "/voice", label: "语音设置", mark: "音", description: "音线与试听" },
    { href: "/notifications", label: "通知设置", mark: "铃", description: "设备与安静时段" },
    { href: "/api-key", label: "模型服务配置", mark: "模", description: "Provider、凭据与用量" },
    { href: "/plugins", label: "活动插件", mark: "扩", description: "启用与授权" },
  ] },
] as const;

export function isWorkspaceRouteActive(current: string, target: string): boolean {
  return current === target || current.startsWith(`${target}/`);
}
