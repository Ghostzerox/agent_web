import { FIRST_PARTY_PLUGIN_ACTIVITIES } from "./activityRegistry";
import { FIRST_PARTY_PLUGIN_API_RANGE } from "@/lib/plugins/pluginApiV1";

const manifestDefinitions = [
  {
    schemaVersion: "1",
    id: "study.memorization",
    name: "背书训练",
    description:
      "把学习材料拆成可校对的知识单元，进行复述评分、薄弱点记录和间隔复习。",
    version: "1.0.0",
    pluginApiVersion: FIRST_PARTY_PLUGIN_API_RANGE,
    kind: "activity",
    source: "first-party",
    availability: "available",
    contributions: {
      skills: ["memorization.feedback"],
      tools: [],
      backgroundJobs: [],
    },
    requestedCapabilities: [
      "model.generate",
      "storage.read-write",
      "task.create-draft",
    ],
  },
  {
    schemaVersion: "1",
    id: "study.problem-solving",
    name: "解题训练",
    description:
      "支持文字/图片题目、提示、逐步引导、答案检查、错因记录和复习卡。",
    version: "1.0.0",
    pluginApiVersion: FIRST_PARTY_PLUGIN_API_RANGE,
    kind: "activity",
    source: "first-party",
    availability: "available",
    contributions: {
      skills: ["problem-solving.guidance"],
      tools: [],
      backgroundJobs: [],
    },
    requestedCapabilities: [
      "model.generate",
      "storage.read-write",
      "task.create-draft",
    ],
  },
  {
    schemaVersion: "1",
    id: "entertainment.quick-adventure",
    name: "轻量冒险规则包",
    description:
      "选择世界与角色专长，预览轻量 d20 冒险设定，确认后创建独立游戏会话。",
    version: "1.0.0",
    pluginApiVersion: FIRST_PARTY_PLUGIN_API_RANGE,
    kind: "activity",
    source: "first-party",
    availability: "available",
    contributions: {
      skills: [],
      tools: [],
      backgroundJobs: [],
    },
    requestedCapabilities: ["storage.read-write"],
  },
] as const;

export const FIRST_PARTY_PLUGIN_MANIFESTS: readonly unknown[] = manifestDefinitions.map((manifest) => ({
  ...manifest,
  contributions: { ...manifest.contributions, activities: FIRST_PARTY_PLUGIN_ACTIVITIES.filter((activity) => activity.pluginId === manifest.id).map((activity) => activity.id) },
}));
