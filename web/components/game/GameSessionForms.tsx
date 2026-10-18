"use client";
import { useState, type ReactNode } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import type { GameCharacter } from "@/lib/api/gameSessionClient";
import type { GameCharacterController, GameSessionKind } from "@/lib/game/contracts";
import { EMPTY_WORLD, EMPTY_CHARACTER, characterForm, type WorldForm, type CharacterFormState } from "./gameForms";

export function CreateSessionForm(props: {
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

export function WorldFields(props: { value: WorldForm; onChange: (value: WorldForm) => void }) {
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

export function CharacterEditor(props: {
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
