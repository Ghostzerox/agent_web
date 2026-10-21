"use client";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

import { useEffect, useMemo, useState } from "react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { AppLink } from "@/components/platform/AppLink";
import { createTask } from "@/lib/api/taskClient";
import {
  createProblemCase,
  createProblemReviewCard,
  createProblemTaskDraft,
  deleteProblemCase,
  getProblemCase,
  listProblemCases,
  ProblemSolvingClientError,
  requestProblemResponse,
} from "@/lib/api/problemSolvingClient";
import {
  prepareProblemImage,
  ProblemImageError,
} from "@/lib/problemSolving/imageClient";
import type {
  ProblemAttempt,
  ProblemCase,
  ProblemCaseSummary,
  ProblemStrategy,
  ReviewCard,
} from "@/lib/problemSolving/domain";
import type { ProblemTaskDraft } from "@/lib/problemSolving/service";

const STRATEGIES: Array<{ id: ProblemStrategy; label: string; detail: string }> = [
  { id: "hint", label: "先给提示", detail: "只给一个推动思考的线索" },
  { id: "guided", label: "逐步引导", detail: "每次推进一步并向你提问" },
  { id: "check", label: "检查答案", detail: "核对你的答案与推理" },
  { id: "explain", label: "完整讲解", detail: "展示完整且可复核的步骤" },
];

const SUBJECT_LABELS: Record<string, string> = {
  math: "数学",
  physics: "物理",
  chemistry: "化学",
  language: "语言",
  history: "历史",
  programming: "编程",
  other: "其他",
};

const ASSESSMENT_LABELS: Record<string, string> = {
  correct: "答案正确",
  partially_correct: "部分正确",
  incorrect: "需要修正",
  not_applicable: "本轮未判分",
};

function friendlyError(error: unknown): string {
  if (error instanceof ProblemSolvingClientError) {
    if ([
      "PLUGIN_DISABLED",
      "CAPABILITY_NOT_GRANTED",
      "PLUGIN_UPDATE_REVIEW_REQUIRED",
      "CAPABILITY_REVIEW_REQUIRED",
    ].includes(error.code)) {
      return "解题插件尚未启用，或所需能力尚未授权。请先到插件页完成启用与授权。";
    }
    return error.message;
  }
  if (error instanceof ProblemImageError) return error.message;
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function verificationLabel(attempt: ProblemAttempt): string {
  const verification = attempt.toolVerification;
  if (verification.status === "verified") return `工具核验：${verification.note}`;
  if (verification.status === "mismatch") return `工具发现不一致：${verification.note}`;
  if (verification.status === "invalid") return `工具未能完成：${verification.note}`;
  return "未做确定性工具核验：当前仅有模型分析，请自行复核关键结论。";
}

export function ProblemSolvingActivity() {
  const [cases, setCases] = useState<ProblemCaseSummary[]>([]);
  const [active, setActive] = useState<ProblemCase | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [problemText, setProblemText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; name: string; byteSize: number } | null>(null);
  const [strategy, setStrategy] = useState<ProblemStrategy>("hint");
  const [userAnswer, setUserAnswer] = useState("");
  const [latestAttempt, setLatestAttempt] = useState<ProblemAttempt | null>(null);
  const [latestCard, setLatestCard] = useState<ReviewCard | null>(null);
  const [taskDraft, setTaskDraft] = useState<ProblemTaskDraft | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  useNavigationGuard(busy || Boolean(title.trim() || problemText.trim() || image || (userAnswer.trim() && userAnswer.trim() !== latestAttempt?.userAnswer)));

  const selectedStrategy = useMemo(
    () => STRATEGIES.find((item) => item.id === strategy) ?? STRATEGIES[0],
    [strategy],
  );

  const reloadList = async () => setCases(await listProblemCases());

  useEffect(() => {
    let mounted = true;
    void listProblemCases()
      .then((items) => {
        if (mounted) setCases(items);
      })
      .catch((loadError) => {
        if (mounted) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const resetForNew = () => {
    setActive(null);
    setTitle("");
    setProblemText("");
    setImage(null);
    setLatestAttempt(null);
    setLatestCard(null);
    setTaskDraft(null);
    setNotice(null);
    setConfirmDelete(false);
  };

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setImage(await prepareProblemImage(file));
    } catch (imageError) {
      setError(friendlyError(imageError));
    } finally {
      setBusy(false);
    }
  };

  const saveCase = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await createProblemCase({
        title,
        problemText,
        image: image ? { dataUrl: image.dataUrl, name: image.name } : null,
      });
      setActive(saved.problemCase);
      setStorageVersion(saved.storageVersion);
      setLatestAttempt(null);
      await reloadList();
      setNotice("题目已保存。图片正文不会写入数据库，只保存图片元数据和后续提取的题意。");
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const openCase = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await getProblemCase(id);
      setActive(loaded.problemCase);
      setStorageVersion(loaded.storageVersion);
      setLatestAttempt(loaded.problemCase.attempts.at(-1) ?? null);
      setLatestCard(loaded.problemCase.reviewCards.at(-1) ?? null);
      setImage(null);
      setTaskDraft(null);
      setTaskCreated(false);
      setConfirmDelete(false);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  };

  const runStrategy = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestProblemResponse(active.id, {
        strategy,
        userAnswer: userAnswer.trim() || null,
        imageDataUrl: image?.dataUrl ?? null,
        expectedVersion: storageVersion,
      });
      setActive(result.problemCase);
      setStorageVersion(result.storageVersion);
      setLatestAttempt(result.attempt);
      setLatestCard(null);
      setTaskDraft(null);
      await reloadList();
    } catch (strategyError) {
      setError(friendlyError(strategyError));
    } finally {
      setBusy(false);
    }
  };

  const generateCard = async () => {
    if (!active || !latestAttempt) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createProblemReviewCard(
        active.id,
        latestAttempt.id,
        storageVersion,
      );
      setActive(result.problemCase);
      setStorageVersion(result.storageVersion);
      setLatestCard(result.card);
      setTaskDraft(null);
      await reloadList();
      setNotice("复习卡已保存到这道题的隔离学习记录。");
    } catch (cardError) {
      setError(friendlyError(cardError));
    } finally {
      setBusy(false);
    }
  };

  const prepareTask = async (card: ReviewCard) => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      setTaskDraft(await createProblemTaskDraft(active.id, card.id, storageVersion));
      setTaskCreated(false);
    } catch (draftError) {
      setError(friendlyError(draftError));
    } finally {
      setBusy(false);
    }
  };

  const confirmTask = async () => {
    if (!taskDraft) return;
    setBusy(true);
    setError(null);
    try {
      await createTask(taskDraft);
      setTaskCreated(true);
      setNotice("错题复习提醒已进入核心任务系统。");
    } catch (taskError) {
      setError(friendlyError(taskError));
    } finally {
      setBusy(false);
    }
  };

  const removeCase = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProblemCase(active.id, storageVersion);
      resetForNew();
      await reloadList();
      setNotice("题目、解题记录和复习卡已删除。");
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-zinc-500">正在读取解题插件…</p>;
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <details><summary className="mb-2 min-h-11 cursor-pointer py-2 text-sm font-semibold">切换题目与录入</summary>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs text-zinc-500">错题与练习</p><h2 className="font-semibold">题目记录</h2></div>
          <button type="button" onClick={resetForNew} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">新题</button>
        </div>
        {cases.length === 0 && <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900">还没有题目。支持文字或经过本机压缩的题目图片。</p>}
        <input aria-label="搜索题库与错因" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="题目、学科、错因标签" className="min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm" />
        {cases.filter((item) => [item.title, item.subject ? SUBJECT_LABELS[item.subject] : "", ...item.latestErrorTags].join(" ").toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase())).map((item) => (
          <button key={item.id} type="button" onClick={() => void openCase(item.id)} className={`w-full rounded-xl border p-3 text-left ${active?.id === item.id ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
            <span className="block truncate text-sm font-medium">{item.title}</span>
            <span className="mt-1 block text-xs text-zinc-500">{item.subject ? SUBJECT_LABELS[item.subject] : "待分类"} · {item.attemptCount} 次练习 · {item.reviewCardCount} 张卡</span>
            {item.latestErrorTags.length > 0 && <span className="mt-1 block truncate text-[11px] text-amber-600">错因：{item.latestErrorTags.join("、")}</span>}
          </button>
        ))}
        </details>
      </aside>

      <main className="min-w-0 space-y-4">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error} <AppLink href="/plugins" className="ml-1 underline">插件设置</AppLink></div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

        {!active ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600">文字 / 图片 → 策略 → 错因 → 复习卡</p>
            <h2 className="mt-2 text-xl font-semibold">录入一道题</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">图片只在当前解题请求中发送给模型，不保存原图。涉及重要考试或高风险结论时仍应自行核对。</p>
            <label className="mt-5 block text-sm font-medium">题目标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 dark:border-zinc-700" placeholder="例如：二次函数错题 01" /></label>
            <label className="mt-4 block text-sm font-medium">题目文字（有图片时可不填）<textarea value={problemText} onChange={(event) => setProblemText(event.target.value)} rows={8} maxLength={8000} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-3 leading-7 dark:border-zinc-700" placeholder="粘贴题干、选项和已知条件。" /></label>
            <label className="mt-4 block text-sm font-medium">题目图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-900" /></label>
            {image && <p className="mt-2 text-xs text-zinc-500">已处理：{image.name} · {(image.byteSize / 1024).toFixed(0)} KB</p>}
            <button type="button" disabled={busy || !title.trim() || (!problemText.trim() && !image)} onClick={() => void saveCase()} className="ui-button ui-button-primary mt-5 w-full">{busy ? "处理中…" : "保存并选择解题方式"}</button>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs text-zinc-500">{active.subject ? SUBJECT_LABELS[active.subject] : "待模型分类"} · {active.attempts.length} 次练习</p><h2 className="mt-1 text-xl font-semibold">{active.title}</h2></div>
              {active.image && <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-300">含图片题目</span>}
            </div>
            <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm leading-7 dark:bg-zinc-900">{active.normalizedProblem || active.problemText || "题目来自图片，首次请求时需要重新选择原图片。"}</div>
            {active.image && !active.normalizedProblem && !image && <label className="mt-3 block rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">重新选择题目图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-xs" /></label>}

            <p className="mt-4 text-sm text-[var(--workspace-muted)]">先选你需要的帮助，再提交；选择策略本身不会调用AI。</p><div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="解题帮助方式">
              {STRATEGIES.map((item) => <button key={item.id} type="button" aria-pressed={strategy === item.id} onClick={() => setStrategy(item.id)} className={`rounded-xl border p-3 text-left ${strategy === item.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-200 dark:border-zinc-800"}`}><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{item.detail}</span></button>)}
            </div>
            <label className="mt-4 block text-sm font-medium">你的答案或当前思路{strategy === "check" ? "（必填）" : "（可选）"}<textarea value={userAnswer} onChange={(event) => setUserAnswer(event.target.value)} rows={5} maxLength={6000} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-3 leading-7 dark:border-zinc-700" placeholder={strategy === "check" ? "写下答案和推理过程，再让 AI 检查。" : "写下你已经想到的部分，AI 会从这里继续。"} /></label>
            <button type="button" disabled={busy || (strategy === "check" && !userAnswer.trim()) || Boolean(active.image && !active.normalizedProblem && !image)} onClick={() => void runStrategy()} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-45">{busy ? "正在分析…" : selectedStrategy.label}</button>

            {latestAttempt && (
              <div className="mt-6 space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900">{ASSESSMENT_LABELS[latestAttempt.assessment]}</span>{latestAttempt.errorTags.map((tag) => <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{tag}</span>)}</div>
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"><MarkdownMessage content={latestAttempt.response} /></div>
                {latestAttempt.nextQuestion && <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><p className="text-xs font-medium">下一步问题</p><p className="mt-1">{latestAttempt.nextQuestion}</p></div>}
                {latestAttempt.misconception && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">错因判断：{latestAttempt.misconception}</p>}
                <p className={`rounded-xl p-3 text-xs ${latestAttempt.toolVerification.status === "mismatch" ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"}`}>{verificationLabel(latestAttempt)}</p>
                <button type="button" disabled={busy} onClick={() => void generateCard()} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:text-blue-300">把本轮错因生成复习卡</button>
              </div>
            )}

            {latestCard && (
              <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">复习卡</p><h3 className="mt-2 font-semibold">{latestCard.front}</h3><p className="mt-2 text-sm leading-6">{latestCard.back}</p><p className="mt-2 text-xs text-zinc-500">生成理由：{latestCard.reason}</p>
                {!taskDraft ? <button type="button" disabled={busy} onClick={() => void prepareTask(latestCard)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white">生成三天后复习任务草稿</button> : <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs dark:bg-black/20"><p>任务草稿：{new Date(taskDraft.schedule.runAt).toLocaleString("zh-CN")}</p><button type="button" disabled={busy || taskCreated} onClick={() => void confirmTask()} className="mt-2 rounded-lg bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">{taskCreated ? "任务已创建" : "确认创建核心任务"}</button></div>}
              </div>
            )}

            {active.reviewCards.length > 1 && <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900"><summary className="cursor-pointer font-medium">历史复习卡（{active.reviewCards.length}）</summary><div className="mt-3 space-y-3">{active.reviewCards.map((card) => <div key={card.id} className="border-t border-zinc-200 pt-3 first:border-0 first:pt-0 dark:border-zinc-800"><p className="font-medium">{card.front}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{card.back}</p></div>)}</div></details>}

            <div className="mt-6 border-t border-zinc-200 pt-4 text-right dark:border-zinc-800">{confirmDelete ? <span className="inline-flex items-center gap-2"><span className="text-xs text-red-600">解题记录与复习卡会一起删除。</span><button type="button" disabled={busy} onClick={() => void removeCase()} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white">确认删除</button><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">取消</button></span> : <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600 underline">删除当前题目</button>}</div>
          </section>
        )}
      </main>
    </div>
  );
}
