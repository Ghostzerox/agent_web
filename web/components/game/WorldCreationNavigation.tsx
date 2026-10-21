"use client";
import { AppLink } from "@/components/platform/AppLink";
import { WORLD_SECTION_LABELS } from "@/lib/game/worlds/blueprint";
import type { WorldSection } from "@/lib/game/worlds/contracts";
import styles from "./worldCreation.module.css";

export const creatorLink = (id?: string, section = "brief") => `/entertainment?view=creator${id ? `&world=${encodeURIComponent(id)}&section=${section}` : ""}`;
const groups = [
  { label: "世界设定", sections: ["brief", "overview", "ranks", "itemRules", "opening"] },
  { label: "区域与地图", sections: ["region"] },
  { label: "人物与社会", sections: ["characters", "lore", "design-characters"] },
  { label: "道具与事件", sections: ["items", "hook", "design-items", "design-events", "draw-pools"] },
  { label: "检查与发布", sections: ["preview", "conflicts", "authorNotes"] },
];
const labels: Record<string, string> = { ...WORLD_SECTION_LABELS, brief: "创作描述", "design-items": "道具设计", "design-characters": "人物设计", "design-events": "事件设计", "draw-pools": "卡池配置", preview: "预览与发布" };
export function WorldCreationNavigation({ id, section, onSelect }: { id: string; section: string; onSelect: (section: string) => void }) {
  return <nav aria-label="世界创作局部导航" className={styles.navigation}>
    <label className={styles.mobileIndex}>当前分区<select className="ui-field" value={section} onChange={(event) => onSelect(event.target.value)}>{groups.map((group) => <optgroup key={group.label} label={group.label}>{group.sections.map((key) => <option key={key} value={key}>{labels[key]}</option>)}</optgroup>)}</select></label>
    <div className={styles.desktopIndex}>{groups.map((group) => <details key={group.label} open={group.sections.includes(section)}><summary>{group.label}</summary><div>{group.sections.map((key) => <AppLink key={key} href={creatorLink(id, key)} aria-current={section === key ? "page" : undefined} onClick={(event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onSelect(key);
    }}>{labels[key]}</AppLink>)}</div></details>)}</div>
  </nav>;
}
export function issueSection(issue: string): WorldSection {
  if (/待解决冲突/u.test(issue)) return "conflicts";
  if (/初始交互/u.test(issue)) return "hook";
  if (/地图|地点|路径|起点|连通|区域/u.test(issue)) return "region";
  if (/人物/u.test(issue)) return "characters";
  if (/史料|知情/u.test(issue)) return "lore";
  if (/等级|字典/u.test(issue)) return "ranks";
  if (/道具|物品|装备|属性|实例/u.test(issue)) return "items";
  return "overview";
}
