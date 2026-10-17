"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { GamePlayPanel } from "@/components/game/GamePlayPanel";
import { GameCheckpointPanel } from "@/components/game/GameCheckpointPanel";
import { AppLink } from "@/components/platform/AppLink";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { FIRST_PARTY_PLUGIN_ACTIVITIES } from "@/lib/plugins/activityRegistry";
import { EXPLORATION_PRESET } from "@/lib/game/exploration/preset";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";
import {
  createGameCharacter,
  createGameSession,
  deleteGameCharacter,
  deleteGameSession,
  getGameSession,
  listGameSessions,
  updateGameCharacter,
  updateGameSession,
  type GameCharacter,
  type GameSessionDetail,
  type GameSessionSummary,
} from "@/lib/api/gameSessionClient";
import type {
  GameCharacterController,
  GameCharacterInput,
  GameSessionKind,
  GameWorldInput,
} from "@/lib/game/contracts";

type WorldForm = {
  title: string;
  kind: GameSessionKind;
  name: string;
  premise: string;
  tone: string;
  rules: string;
  boundaries: string;
};

type CharacterFormState = {
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

const EMPTY_WORLD: WorldForm = {
  title: "",
  kind: "roleplay",
  name: "",
  premise: "",
  tone: "温暖、自然、有沉浸感",
  rules: "",
  boundaries: "不把虚构设定冒充现实事实",
};

const EMPTY_CHARACTER: CharacterFormState = {
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

const KIND_LABELS: Record<GameSessionKind, string> = {
  roleplay: "角色扮演",
  tabletop: "AI 跑团",
  "interactive-story": "互动故事",
};

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

function worldInput(form: WorldForm): GameWorldInput {
  return {
    name: form.name.trim(),
    premise: form.premise.trim(),
    tone: form.tone.trim(),
    rules: uniqueLines(form.rules),
    boundaries: uniqueLines(form.boundaries),
  };
}

function characterInput(form: CharacterFormState): GameCharacterInput {
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

function detailWorld(detail: GameSessionDetail): WorldForm {
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

function characterForm(character?: GameCharacter): CharacterFormState {
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

function summary(detail: GameSessionDetail): GameSessionSummary {
  return detail;
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export function GameSessionManager() {
  const [sessions, setSessions] = useState<GameSessionSummary[]>([]);
  const [detail, setDetail] = useState<GameSessionDetail | null>(null);
  const [world, setWorld] = useState<WorldForm>({ ...EMPTY_WORLD });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [explorationDraft, setExplorationDraft] = useState(false);
  useNavigationGuard(busy || Boolean(detail && !creating && JSON.stringify(world) !== JSON.stringify(detailWorld(detail))));

  const installDetail = (next: GameSessionDetail) => {
    setDetail(next);
    setWorld(detailWorld(next));
    setCreating(false);
    setSessions((current) => {
      const nextSummary = summary(next);
      const remaining = current.filter((item) => item.id !== next.id);
      return [nextSummary, ...remaining];
    });
  };

  const loadDetail = async (id: string) => {
    setError(null);
    const loaded = await getGameSession(id);
    installDetail(loaded);
  };

  useEffect(() => {
    let active = true;
    void listGameSessions()
      .then(async (loaded) => {
        if (!active) return;
        setSessions(loaded);
        const requestedId = currentAppSearchParams().get("session");
        const selected = loaded.find((session) => session.id === requestedId) ?? loaded[0];
        if (selected) {
          const first = await getGameSession(selected.id);
          if (active) {
            setDetail(first);
            setWorld(detailWorld(first));
          }
        } else {
          setCreating(true);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const startNew = () => {
    if (!requestNavigationPermission()) return;
    setExplorationDraft(false);
    setCreating(true);
    setDetail(null);
    setWorld({ ...EMPTY_WORLD });
    setError(null);
    setNotice(null);
  };

  const create = async (sessionWorld: WorldForm, character: CharacterFormState) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await createGameSession({
        title: sessionWorld.title.trim(),
        kind: sessionWorld.kind,
        world: worldInput(sessionWorld),
        initialCharacter: characterInput(character),
      });
      installDetail(next);
      setNotice("游戏会话、世界设定和首张角色卡已保存。虚构内容不会进入普通记忆。");
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setBusy(false);
    }
  };

  const saveWorld = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateGameSession(detail.id, {
        title: world.title.trim(),
        kind: world.kind,
        world: worldInput(world),
        expectedVersion: detail.version,
      });
      installDetail(next);
      setNotice("世界设定已保存。");
    } catch (saveError) {
      setError(friendlyError(saveError));
      await recoverConflict(saveError);
    } finally {
      setBusy(false);
    }
  };

  const recoverConflict = async (mutationError: unknown) => {
    if (!detail || !mutationError || typeof mutationError !== "object") return;
    const code = "code" in mutationError ? String(mutationError.code) : "";
    if (!code.endsWith("VERSION_CONFLICT")) return;
    const latest = await getGameSession(detail.id);
    installDetail(latest);
    setError("其他设备已修改这份设定，页面已刷新，请检查后重试。");
  };

  const removeSession = async () => {
    if (!detail || !window.confirm("删除这个游戏会话及其角色卡？此操作不可撤销。")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteGameSession(detail.id, detail.version);
      const remaining = sessions.filter((item) => item.id !== detail.id);
      setSessions(remaining);
      if (remaining[0]) await loadDetail(remaining[0].id);
      else startNew();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
      await recoverConflict(deleteError);
    } finally {
      setBusy(false);
    }
  };

  const mutateCharacter = async (
    action: () => Promise<GameSessionDetail>,
    message: string,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      installDetail(await action());
      setNotice(message);
      return true;
    } catch (mutationError) {
      setError(friendlyError(mutationError));
      await recoverConflict(mutationError);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-6xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取游戏会话…</p>;
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button type="button" disabled={busy} onClick={() => setExplorationDraft((open) => !open)} className="mb-2 w-full rounded-xl border border-violet-300 px-4 py-2.5 text-sm font-medium text-violet-700 dark:text-violet-300">大世界探索 · 雾港</button>
        <button type="button" onClick={startNew} className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-600">+ 新建游戏会话</button>
        <div className="mt-3 space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          {FIRST_PARTY_PLUGIN_ACTIVITIES.filter((activity) => activity.route.startsWith("/entertainment/")).map((activity) => (
            <AppLink key={activity.id} href={activity.route} className="block rounded-xl border border-violet-200 px-3 py-2 text-center text-xs font-medium text-violet-700 dark:border-violet-900 dark:text-violet-300">{activity.label}</AppLink>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {sessions.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">还没有游戏会话</p>
          ) : sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => { if (requestNavigationPermission()) void loadDetail(session.id); }}
              className={`w-full rounded-xl px-3 py-3 text-left ${detail?.id === session.id && !creating ? "bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
            >
              <span className="block truncate text-sm font-medium">{session.title}</span>
              <span className="mt-1 block text-xs text-zinc-500">{KIND_LABELS[session.kind]} · {session.worldName}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 dark:border-violet-900 dark:from-violet-950/40 dark:to-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Entertainment</p>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">可探索、可分支的叙事世界</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">世界、角色、剧情、规则检定和检查点属于独立 GameSession。历史分支不会被删除，也不会进入普通对话或长期记忆。</p>
            </div>
            <span className="rounded-full border border-violet-300 bg-white/80 px-3 py-1 text-xs font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">独立存储</span>
          </div>
        </section>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

        {explorationDraft && <section aria-label="探索模板确认" className="space-y-3 rounded-2xl border border-violet-300 bg-[var(--workspace-surface)] p-5">
          <h3 className="text-lg font-semibold">雾港与旧灯岬 · 新的探索存档</h3><p className="text-sm leading-6 text-zinc-500">六处相连地点、装备与交易、三位可结识角色、地方 / 人物 / 世界事件与多结局故事弧。普通动作无需 AI；自由对话可选调用模型。不会转换或覆盖旧故事。</p>
          <p className="text-xs text-zinc-500">模板 {EXPLORATION_PRESET.templateVersion} · {EXPLORATION_PRESET.hostContract}。创建后点击“开启雾港探索”；玩家的过往和关键决定仍由你控制。</p>
          <div className="flex gap-2"><button className="rounded-lg bg-violet-700 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => {
            if (!requestNavigationPermission()) return;
            if (!window.confirm("确认创建独立的雾港探索存档？不会改动已有故事或现实记忆。")) return;
            setBusy(true); setError(null);
            void createGameSession({ title: EXPLORATION_PRESET.title, kind: EXPLORATION_PRESET.kind, world: EXPLORATION_PRESET.world, initialCharacter: EXPLORATION_PRESET.initialCharacter }).then((next) => { installDetail(next); setExplorationDraft(false); setNotice("探索存档已创建，请点击开启雾港探索。"); }).catch((error: unknown) => setError(friendlyError(error))).finally(() => setBusy(false));
          }}>确认创建探索存档</button><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setExplorationDraft(false)}>取消</button></div>
        </section>}

        {creating ? (
          <CreateSessionForm busy={busy} onSubmit={create} />
        ) : detail ? (
          <>
            <GamePlayPanel
              key={detail.id}
              detail={detail}
              onChange={installDetail}
              onError={setError}
              onNotice={setNotice}
            />
            <details className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4"><summary className="flex items-center font-medium">检查点与恢复</summary><div className="mt-3">
              <GameCheckpointPanel detail={detail} onChange={installDetail} onError={setError} onNotice={setNotice} />
            </div></details>
            <details className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4"><summary className="flex items-center font-medium">世界设定与角色卡</summary><div className="mt-3 space-y-5">
            <form onSubmit={saveWorld} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">世界设定</h3>
                  <p className="text-xs text-zinc-500">设定版本 {detail.version} · 状态：{detail.status === "active" ? "进行中" : detail.status === "paused" ? "已暂停" : detail.status === "archived" ? "已归档" : "准备中"}</p>
                  {detail.turns.some((turn) => turn.stateSnapshot.exploration) && <p className="mt-2 text-xs text-zinc-500">探索地图、NPC 与规则固定在模板版本；这里修改的是会话说明和基础玩家卡，不追溯改写探索起点或已有分支。若要使用新的初始人物，请新建存档后在开启前编辑。</p>}
                </div>
                <button type="button" onClick={() => void removeSession()} disabled={busy} className="text-xs font-medium text-red-600 disabled:opacity-50">删除会话</button>
              </div>
              <WorldFields value={world} onChange={setWorld} />
              <button type="submit" disabled={busy} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">{busy ? "保存中…" : "保存世界设定"}</button>
            </form>

            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <h3 className="text-lg font-semibold">角色卡</h3>
                <p className="mt-1 text-sm text-zinc-500">控制者决定未来由用户、AI 或双方共同扮演；它不授予任何模型或工具权限。首回合后角色数值已进入分支快照，修改角色卡不会追溯改写已有分支；从故事开头重新分支时会使用最新角色卡。</p>
              </div>
              {detail.characters.map((character) => (
                <CharacterEditor
                  key={`${character.id}:${character.version}`}
                  character={character}
                  busy={busy}
                  onSave={(form) => mutateCharacter(
                    () => updateGameCharacter(detail.id, character.id, {
                      ...characterInput(form),
                      expectedSessionVersion: detail.version,
                      expectedCharacterVersion: character.version,
                    }),
                    `角色卡“${form.name.trim()}”已更新。`,
                  )}
                  onDelete={() => {
                    if (!window.confirm(`删除角色“${character.name}”？`)) return Promise.resolve();
                    return mutateCharacter(
                      () => deleteGameCharacter(
                        detail.id,
                        character.id,
                        detail.version,
                        character.version,
                      ),
                      `角色“${character.name}”已删除。`,
                    );
                  }}
                />
              ))}
              <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <h4 className="mb-3 text-sm font-semibold">添加角色</h4>
                <CharacterEditor
                  busy={busy}
                  onSave={(form) => mutateCharacter(
                    () => createGameCharacter(detail.id, {
                      ...characterInput(form),
                      expectedSessionVersion: detail.version,
                    }),
                    `角色“${form.name.trim()}”已添加。`,
                  )}
                />
              </div>
            </section>
            </div></details>
          </>
        ) : null}
      </main>
    </div>
  );
}

function CreateSessionForm(props: {
  busy: boolean;
  onSubmit: (world: WorldForm, character: CharacterFormState) => Promise<void>;
}) {
  const [world, setWorld] = useState<WorldForm>({ ...EMPTY_WORLD });
  const [character, setCharacter] = useState<CharacterFormState>({ ...EMPTY_CHARACTER });
  useNavigationGuard(props.busy || JSON.stringify(world) !== JSON.stringify(EMPTY_WORLD) || JSON.stringify(character) !== JSON.stringify(EMPTY_CHARACTER));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void props.onSubmit(world, character);
      }}
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div><h3 className="text-lg font-semibold">创建游戏会话</h3><p className="mt-1 text-sm text-zinc-500">先定义世界和一张初始角色卡；之后仍可修改或添加角色。</p></div>
      <WorldFields value={world} onChange={setWorld} />
      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h4 className="mb-3 text-sm font-semibold">初始角色卡</h4>
        <CharacterFields value={character} onChange={setCharacter} />
      </div>
      <button type="submit" disabled={props.busy} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{props.busy ? "创建中…" : "创建独立游戏会话"}</button>
    </form>
  );
}

function WorldFields(props: { value: WorldForm; onChange: (value: WorldForm) => void }) {
  const set = <K extends keyof WorldForm>(key: K, value: WorldForm[K]) => props.onChange({ ...props.value, [key]: value });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="会话名称"><input required maxLength={120} value={props.value.title} onChange={(event) => set("title", event.target.value)} className={inputClass} placeholder="例如：雾港来信" /></Field>
        <Field label="玩法类型"><select value={props.value.kind} onChange={(event) => set("kind", event.target.value as GameSessionKind)} className={inputClass}><option value="roleplay">角色扮演</option><option value="tabletop">AI 跑团</option><option value="interactive-story">互动故事</option></select></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="世界名称"><input required maxLength={120} value={props.value.name} onChange={(event) => set("name", event.target.value)} className={inputClass} placeholder="例如：雾港" /></Field>
        <Field label="叙事语调"><input required maxLength={500} value={props.value.tone} onChange={(event) => set("tone", event.target.value)} className={inputClass} /></Field>
      </div>
      <Field label="世界前提"><textarea required rows={4} maxLength={4_000} value={props.value.premise} onChange={(event) => set("premise", event.target.value)} className={inputClass} placeholder="时代、地点、核心冲突，以及玩家进入故事时已经成立的事实。" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <LinesField label="世界规则" hint="每行一条，例如：魔法需要支付记忆代价" value={props.value.rules} onChange={(value) => set("rules", value)} />
        <LinesField label="内容边界" hint="每行一条；明确不希望故事出现的内容" value={props.value.boundaries} onChange={(value) => set("boundaries", value)} />
      </div>
    </div>
  );
}

function CharacterEditor(props: {
  character?: GameCharacter;
  busy: boolean;
  onSave: (form: CharacterFormState) => Promise<boolean>;
  onDelete?: () => Promise<unknown>;
}) {
  const [form, setForm] = useState(() => characterForm(props.character));
  useNavigationGuard(props.busy || JSON.stringify(form) !== JSON.stringify(characterForm(props.character)));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void props.onSave(form).then((saved) => {
          if (saved && !props.character) setForm({ ...EMPTY_CHARACTER });
        });
      }}
      className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <CharacterFields value={form} onChange={setForm} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={props.busy} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">{props.character ? "保存角色卡" : "添加角色"}</button>
        {props.onDelete && <button type="button" onClick={() => void props.onDelete?.()} disabled={props.busy} className="text-xs font-medium text-red-600 disabled:opacity-50">删除角色</button>}
      </div>
    </form>
  );
}

function CharacterFields(props: { value: CharacterFormState; onChange: (value: CharacterFormState) => void }) {
  const set = <K extends keyof CharacterFormState>(key: K, value: CharacterFormState[K]) => props.onChange({ ...props.value, [key]: value });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="角色名称"><input required maxLength={120} value={props.value.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
        <Field label="身份/职责"><input required maxLength={120} value={props.value.role} onChange={(event) => set("role", event.target.value)} className={inputClass} /></Field>
        <Field label="控制者"><select value={props.value.controller} onChange={(event) => set("controller", event.target.value as GameCharacterController)} className={inputClass}><option value="user">用户</option><option value="ai">AI</option><option value="shared">共同</option></select></Field>
      </div>
      <Field label="角色简介"><textarea required rows={3} maxLength={2_000} value={props.value.description} onChange={(event) => set("description", event.target.value)} className={inputClass} placeholder="外观、背景、能力和当前处境。" /></Field>
      <Field label="性格与表达"><textarea rows={2} maxLength={1_200} value={props.value.personality} onChange={(event) => set("personality", event.target.value)} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <LinesField label="角色目标" hint="每行一个目标" value={props.value.goals} onChange={(value) => set("goals", value)} />
        <LinesField label="角色边界" hint="每行一条角色专属边界" value={props.value.boundaries} onChange={(value) => set("boundaries", value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="数值属性"><textarea required rows={3} value={props.value.attributes} onChange={(event) => set("attributes", event.target.value)} className={inputClass} placeholder="每行一个，例如：力量: 2" /><span className="mt-1 block text-xs font-normal text-zinc-500">格式为“属性: 整数”，最多 20 项，范围 -100～100。</span></Field>
        <Field label="生命上限"><input required type="number" min={1} max={1_000_000} value={props.value.maxHealth} onChange={(event) => set("maxHealth", Number(event.target.value))} className={inputClass} /></Field>
      </div>
    </div>
  );
}

const inputClass = "mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950";

function Field(props: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{props.label}{props.children}</label>;
}

function LinesField(props: { label: string; hint: string; value: string; onChange: (value: string) => void }) {
  return <Field label={props.label}><textarea rows={3} value={props.value} onChange={(event) => props.onChange(event.target.value)} className={inputClass} placeholder={props.hint} /><span className="mt-1 block text-xs font-normal text-zinc-500">每行一项，最多 20 项。</span></Field>;
}
