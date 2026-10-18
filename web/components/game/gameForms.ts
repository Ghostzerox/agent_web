import type { GameCharacter, GameSessionDetail } from "@/lib/api/gameSessionClient";
import type { GameCharacterController, GameCharacterInput, GameSessionKind, GameWorldInput } from "@/lib/game/contracts";

export type WorldForm = {
  title: string;
  kind: GameSessionKind;
  name: string;
  premise: string;
  tone: string;
  rules: string;
  boundaries: string;
};

export type CharacterFormState = {
  name: string;
  role: string;
  controller: GameCharacterController;
  description: string;
  personality: string;
  goals: string;
  boundaries: string;
  attributes: string;
  maxHealth: number;
};

export const EMPTY_WORLD: WorldForm = {
  title: "",
  kind: "roleplay",
  name: "",
  premise: "",
  tone: "温暖、自然、有沉浸感",
  rules: "",
  boundaries: "不把虚构设定冒充现实事实",
};

export const EMPTY_CHARACTER: CharacterFormState = {
  name: "",
  role: "主角",
  controller: "user",
  description: "",
  personality: "",
  goals: "",
  boundaries: "",
  attributes: "力量: 0\n敏捷: 0\n意志: 0",
  maxHealth: 10,
};

export const KIND_LABELS: Record<GameSessionKind, string> = {
  roleplay: "角色扮演",
  tabletop: "AI 跑团",
  "interactive-story": "互动故事",
};

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

export function worldInput(form: WorldForm): GameWorldInput {
  return {
    name: form.name.trim(),
    premise: form.premise.trim(),
    tone: form.tone.trim(),
    rules: uniqueLines(form.rules),
    boundaries: uniqueLines(form.boundaries),
  };
}

export function characterInput(form: CharacterFormState): GameCharacterInput {
  const attributes: Record<string, number> = {};
  for (const [index, line] of uniqueLines(form.attributes).entries()) {
    const match = line.match(/^([^:：=]+)[:：=]\s*(-?\d+)$/u);
    if (!match) {
      throw new Error(`数值属性第 ${index + 1} 行格式无效，请使用“属性: 整数”。`);
    }
    const name = match[1].trim();
    const value = Number(match[2]);
    if (!/^[\p{L}\p{N}_.-]+$/u.test(name)) {
      throw new Error(`属性名“${name}”只能包含文字、数字、_、. 或 -。`);
    }
    if (name in attributes) throw new Error(`数值属性“${name}”重复。`);
    if (value < -100 || value > 100) {
      throw new Error(`数值属性“${name}”必须在 -100 到 100 之间。`);
    }
    attributes[name] = value;
  }
  return {
    name: form.name.trim(),
    role: form.role.trim(),
    controller: form.controller,
    description: form.description.trim(),
    personality: form.personality.trim(),
    goals: uniqueLines(form.goals),
    boundaries: uniqueLines(form.boundaries),
    attributes,
    maxHealth: form.maxHealth,
  };
}

export function detailWorld(detail: GameSessionDetail): WorldForm {
  return {
    title: detail.title,
    kind: detail.kind,
    name: detail.worldName,
    premise: detail.worldPremise,
    tone: detail.worldTone,
    rules: detail.worldRules.join("\n"),
    boundaries: detail.safetyBoundaries.join("\n"),
  };
}

export function characterForm(character?: GameCharacter): CharacterFormState {
  return character
    ? {
        name: character.name,
        role: character.role,
        controller: character.controller,
        description: character.description,
        personality: character.personality,
        goals: character.goals.join("\n"),
        boundaries: character.boundaries.join("\n"),
        attributes: Object.entries(character.attributes)
          .map(([name, value]) => `${name}: ${value}`)
          .join("\n"),
        maxHealth: character.maxHealth,
      }
    : { ...EMPTY_CHARACTER };
}
