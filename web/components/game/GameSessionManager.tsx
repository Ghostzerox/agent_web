"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { GamePlayPanel } from "@/components/game/GamePlayPanel";
import { GameCheckpointPanel } from "@/components/game/GameCheckpointPanel";
import { AppLink } from "@/components/platform/AppLink";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { FIRST_PARTY_PLUGIN_ACTIVITIES } from "@/lib/plugins/activityRegistry";
import { explorationSessionInput } from "@/lib/game/exploration/templateCatalog";
import { ExplorationTemplatePicker } from "./ExplorationTemplatePicker";
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
  type GameSessionDetail,
  type GameSessionSummary,
} from "@/lib/api/gameSessionClient";
import { EMPTY_WORLD, KIND_LABELS, worldInput, characterInput, detailWorld, type WorldForm, type CharacterFormState } from "./gameForms";
import { CreateSessionForm, WorldFields, CharacterEditor } from "./GameSessionForms";

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
      const nextSummary = next;
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
        <details open><summary className="mb-3 min-h-11 cursor-pointer py-2 text-sm font-semibold">世界列表与创建入口</summary>
        <button type="button" disabled={busy} onClick={() => setExplorationDraft((open) => !open)} className="mb-2 w-full rounded-xl border border-violet-300 px-4 py-2.5 text-sm font-medium text-violet-700 dark:text-violet-300">大世界探索 · 选择模板</button>
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
        </details>
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

        {explorationDraft && <ExplorationTemplatePicker busy={busy} onCancel={() => setExplorationDraft(false)} onCreate={(template) => {
          if (!requestNavigationPermission()) return;
          if (!window.confirm(`确认创建「${template.title}」的独立存档？不会改动已有故事或现实记忆。`)) return;
          setBusy(true); setError(null);
          void createGameSession(explorationSessionInput(template)).then((next) => {
            installDetail(next); setExplorationDraft(false); setNotice("探索存档已创建，请点击“开启探索世界”。");
          }).catch((error: unknown) => setError(friendlyError(error))).finally(() => setBusy(false));
        }} />}

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
