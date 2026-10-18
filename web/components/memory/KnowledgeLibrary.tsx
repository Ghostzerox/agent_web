"use client";

import { useEffect, useState, type FormEvent } from "react";
import { knowledgeClient as client, type KnowledgeCollection, type KnowledgeDocument, type KnowledgeDocumentSummary } from "@/lib/api/knowledgeClient";
import { documentInputSchema, KNOWLEDGE_MODULE_LABELS, KNOWLEDGE_MODULES, type DocumentInput } from "@/lib/knowledge/documents";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { getFileExportAdapter } from "@/lib/platform/fileExport";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { AppLink } from "@/components/platform/AppLink";
import { knowledgeCitationUrl } from "@/lib/knowledge/citations";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/retrieval";

const blank: DocumentInput = { title: "", sourceKey: "", format: "markdown", content: "", sourceUrl: "", fileName: "" };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const buttonClass = "rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700";
const documentDraft = (document: KnowledgeDocument): DocumentInput => ({ title: document.title, sourceKey: document.sourceKey, format: document.format, content: document.content, sourceUrl: document.sourceUrl, fileName: document.fileName });

export function KnowledgeLibrary() {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [selected, setSelected] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [opened, setOpened] = useState<KnowledgeDocument | null>(null);
  const [draft, setDraft] = useState<DocumentInput>(blank);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newModule, setNewModule] = useState<typeof KNOWLEDGE_MODULES[number]>("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<KnowledgeRetrievalResult | null>(null);
  const [sourceLine, setSourceLine] = useState<number | null>(null);
  const [sourceQuery, setSourceQuery] = useState(() => typeof window === "undefined" ? "" : currentAppSearchParams().toString());
  const dirty = JSON.stringify(draft) !== JSON.stringify(opened ? documentDraft(opened) : blank);
  const collection = collections.find((value) => value.id === selected);
  const collectionDirty = Boolean(collection && (collection.title !== collectionTitle || collection.description !== collectionDescription));
  useNavigationGuard(dirty || collectionDirty || Boolean(newTitle.trim()) || busy);

  useEffect(() => {
    const readSource = () => { const next = currentAppSearchParams().toString(); if (next === sourceQuery) return; setSourceQuery(next); setOpened(null); setDraft(blank); setSourceLine(null); setError(""); setLoading(true); };
    let active = true;
    const afterNavigation = () => window.setTimeout(() => { if (active) readSource(); }, 0);
    window.addEventListener("hashchange", afterNavigation);
    return () => { active = false; window.removeEventListener("hashchange", afterNavigation); };
  }, [sourceQuery]);

  useEffect(() => {
    let active = true;
    void client.collections().then(async (loaded) => {
      if (!active) return;
      setCollections(loaded);
      const params = currentAppSearchParams();
      const documentId = params.get("document"); const requestedVersion = Number(params.get("version"));
      if (documentId) {
        if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw new Error("引用缺少有效版本；请从资料列表打开原文。");
        const source = await client.document(documentId, requestedVersion);
        if (!active) return;
        const parent = loaded.find((value) => value.id === source.collectionId);
        if (!parent) throw new Error("引用所在集合已不可用。");
        setSelected(parent.id); setCollectionTitle(parent.title); setCollectionDescription(parent.description); setOpened(source); setDraft(documentDraft(source)); setSourceLine(Number(params.get("line")) || 1);
        const docs = await client.documents(parent.id); if (active) setDocuments(docs);
        return;
      }
      const first = loaded[0];
      if (first) { setSelected(first.id); setCollectionTitle(first.title); setCollectionDescription(first.description); const docs = await client.documents(first.id); if (active) setDocuments(docs); }
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "读取知识库失败"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceQuery]);

  const act = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setStatus("");
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : "知识库操作失败"); } finally { setBusy(false); }
  };
  const reload = async (id: string) => {
    const loaded = await client.collections();
    const next = loaded.find((value) => value.id === id);
    setCollections(loaded);
    if (next) { setSelected(next.id); setCollectionTitle(next.title); setCollectionDescription(next.description); setDocuments(await client.documents(next.id)); }
    else { setSelected(""); setCollectionTitle(""); setCollectionDescription(""); setDocuments([]); }
  };
  const canDiscard = () => !(dirty || collectionDirty) || window.confirm("有未保存的文档或集合修改，确定放弃并切换吗？");
  const selectCollection = (id: string) => {
    if (!canDiscard()) return;
    void act(async () => { await reload(id); setOpened(null); setDraft(blank); setSourceLine(null); setSearchResult(null); });
  };
  const openDocument = (id: string) => {
    if (dirty && !window.confirm("放弃未保存的文档修改？")) return;
    void act(async () => { const document = await client.document(id); setOpened(document); setDraft(documentDraft(document)); setSourceLine(null); });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const parsed = documentInputSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "请检查文档输入。"); return; }
    void act(async () => {
      const saved = opened ? await client.update(opened.id, { ...parsed.data, expectedVersion: opened.version }) : await client.save(selected, parsed.data);
      const document = await client.document(saved.id);
      setOpened(document); setDraft(documentDraft(document)); await reload(selected);
      setStatus(saved.duplicate ? "相同来源与内容已存在，没有重复导入。" : "文档与来源分段已保存；不会自动发送给 AI。");
    });
  };
  const importFile = (file: File | undefined) => {
    if (!file) return;
    if (dirty && !window.confirm("用本地文件替换当前未保存文档？")) return;
    void act(async () => {
      if (!/\.(txt|md|markdown)$/iu.test(file.name) || file.size > 300_000) throw new Error("只支持不超过 300 KB 的 UTF-8 .txt/.md/.markdown 文件。");
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error("文件不是有效 UTF-8 文本，请转换编码后重试。"); }
      const input = documentInputSchema.parse({ ...blank, title: file.name.replace(/\.[^.]+$/u, "").slice(0, 200), sourceKey: file.name.slice(0, 120), fileName: file.name.slice(0, 200), format: /\.txt$/iu.test(file.name) ? "text" : "markdown", content });
      setOpened(null); setDraft(input); setStatus("文件已在本地读取，请检查后点击保存导入。");
    });
  };

  return <section aria-labelledby="knowledge-title" className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
    <div><h2 id="knowledge-title" className="text-lg font-semibold">知识资料库</h2><p className="mt-1 text-xs leading-5 text-zinc-500">资料与个人事实分开保存。可在此离线检索，或在聊天中显式选择同模式集合。网址仅作来源记录，不抓取网页；词项检索不等于向量检索。</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}<span className="block text-xs">未保存的文档仍在编辑框中；冲突时请先导出草稿，再重新打开最新版本。</span></p>}
    {status && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{status}</p>}
    {loading ? <p className="text-sm text-zinc-500">正在读取知识集合…</p> : <button type="button" className={buttonClass} disabled={busy} onClick={() => { if (canDiscard()) void act(async () => { const loaded = await client.collections(); await reload(selected || loaded[0]?.id || ""); }); }}>刷新集合与列表</button>}
    <fieldset disabled={busy || loading} className="space-y-4 disabled:opacity-60">
      <form className="grid gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (!canDiscard()) return; void act(async () => { const created = await client.createCollection({ title: newTitle, description: "", module: newModule }); setNewTitle(""); setOpened(null); setDraft(blank); await reload(created.id); setStatus("知识集合已创建。"); }); }}>
        <label className="text-sm">新集合名称<input required maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className={inputClass} /></label>
        <label className="text-sm">资料所属模式<select value={newModule} onChange={(event) => setNewModule(event.target.value as typeof newModule)} className={inputClass}>{KNOWLEDGE_MODULES.map((id) => <option key={id} value={id}>{KNOWLEDGE_MODULE_LABELS[id]}</option>)}</select></label>
        <button type="submit" disabled={!newTitle.trim()} className={`${buttonClass} self-end`}>创建知识集合</button>
      </form>
      <label className="block text-sm">当前知识集合<select value={selected} onChange={(event) => selectCollection(event.target.value)} className={inputClass}><option value="">请选择集合</option>{collections.map((value) => <option key={value.id} value={value.id}>{value.title} · {KNOWLEDGE_MODULE_LABELS[value.module]}</option>)}</select></label>
      {collection && <>
        <form className="space-y-2 rounded-xl border border-blue-200 p-3 dark:border-blue-900" onSubmit={(event) => { event.preventDefault(); void act(async () => { setSearchResult(await client.search({ consumer: collection.module, collectionIds: [collection.id], query: searchQuery })); }); }}>
          <label className="block text-sm">检索本集合<input required maxLength={500} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className={inputClass} /></label><button type="submit" disabled={!searchQuery.trim()} className={buttonClass}>检索资料（不调用模型）</button>
          {searchResult && <div role="status" className="space-y-2 text-xs"><p>{searchResult.status === "completed" ? `命中 ${searchResult.hits.length} 段` : searchResult.status === "too-broad" ? "候选过多，请缩小集合或增加关键词" : "资料库暂无相关依据"} · 约 {searchResult.estimatedTokens} Token · {searchResult.durationMs.toFixed(1)} ms</p>{searchResult.fallback && <p>分段不可用，本次使用同范围原文降级检索；可打开原文检查/重建分段，未自动联网。</p>}{searchResult.hits.map((hit) => <div key={hit.chunkId} className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900"><AppLink href={knowledgeCitationUrl({ documentId: hit.documentId, version: hit.version, startLine: hit.startLine })} className="underline">{hit.title} · v{hit.version} · 行 {hit.startLine}–{hit.endLine}</AppLink><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{hit.content}</pre></div>)}</div>}
        </form>
        <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">集合 v{collection.version} · {documents.length}/100 篇；所属模式创建后不可直接修改。</p>
          <label className="block text-sm">集合名称<input value={collectionTitle} maxLength={120} onChange={(event) => setCollectionTitle(event.target.value)} className={inputClass} /></label>
          <label className="block text-sm">集合说明<input value={collectionDescription} maxLength={500} onChange={(event) => setCollectionDescription(event.target.value)} className={inputClass} /></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!collectionTitle.trim() || !collectionDirty} className={buttonClass} onClick={() => void act(async () => { await client.updateCollection(collection.id, { title: collectionTitle, description: collectionDescription, expectedVersion: collection.version }); await reload(selected); setStatus("集合信息已更新。"); })}>保存集合信息</button>
          <button type="button" className={`${buttonClass} text-red-700`} onClick={() => { if (window.confirm(`永久删除集合“${collection.title}”和其中全部文档/分段？旧备份和已导出文件不会自动擦除。`)) void act(async () => { await client.deleteCollection(collection.id, collection.version); setOpened(null); setDraft(blank); await reload(""); setStatus("集合及全部文档/分段已删除。"); }); }}>删除整个集合</button></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2"><h3 className="font-medium">集合文档</h3>{documents.length === 0 && <p className="text-sm text-zinc-500">还没有文档，粘贴或选择本地文件后保存。</p>}{documents.map((document) => <button type="button" key={document.id} onClick={() => openDocument(document.id)} className={`${buttonClass} block w-full break-words text-left ${opened?.id === document.id ? "bg-blue-50 dark:bg-blue-950" : ""}`}>{document.title}<span className="mt-1 block text-xs text-zinc-500">v{document.version} · {document.sourceKey}</span></button>)}</div>
          <form onSubmit={save} className="min-w-0 space-y-3">
            {opened?.indexUnavailable && <p role="status" className="text-xs text-amber-700">分段索引暂不可用，已读取指定版本原文；行高亮和分段重建需等待索引表恢复，不影响原文查看。</p>}
            <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => { if (!dirty || window.confirm("放弃当前未保存文档？")) { setOpened(null); setDraft(blank); } }}>新文档</button><label className={`${buttonClass} cursor-pointer`}>选择本地文本文件<input aria-label="选择本地文本文件" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="sr-only" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
            <label className="block text-sm">文档标题<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">来源标识<input required disabled={Boolean(opened)} maxLength={120} value={draft.sourceKey} placeholder="同集合内唯一，如 textbook-chapter-1" onChange={(event) => setDraft({ ...draft, sourceKey: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">文本格式<select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as DocumentInput["format"] })} className={inputClass}><option value="markdown">Markdown</option><option value="text">纯文本</option></select></label>
            <label className="block text-sm">来源网址（可空，不会访问）<input maxLength={2000} value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">文档正文<textarea required rows={12} maxLength={100000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className={`${inputClass} resize-y font-mono`} /></label>
            <p className="text-xs text-zinc-500">最多 100,000 字符/300 KB，最多 256 段；按保存后的 LF 行号定位，不执行 HTML。导入失败不会留下半篇文档，更正替换旧分段。</p>
            <div className="flex flex-wrap gap-2"><button type="submit" disabled={!draft.title.trim() || !draft.sourceKey.trim() || !draft.content.trim()} className={`${buttonClass} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950`}>{opened ? "保存文档更正" : "保存导入"}</button>
              <button type="button" className={buttonClass} disabled={!draft.content} onClick={() => void act(async () => { await getFileExportAdapter().export({ filename: `knowledge-draft.${draft.format === "markdown" ? "md" : "txt"}`, mediaType: "text/plain", content: draft.content, directory: "knowledge-exports", shareTitle: "知识文档导出", shareText: "此文件可能包含私人资料，请谨慎分享。", dialogTitle: "导出文档" }); setStatus("已导出当前正文；集合与版本元数据仍保存在服务端。"); })}>导出当前正文</button>
              {opened && <button type="button" className={`${buttonClass} text-red-700`} onClick={() => { if (window.confirm("永久删除这篇文档及全部分段？")) void act(async () => { await client.delete(opened.id, opened.version); setOpened(null); setDraft(blank); await reload(selected); setStatus("文档及全部分段已删除。"); }); }}>删除文档</button>}
              {opened && <button type="button" className={buttonClass} onClick={() => void act(async () => { const result = await client.rebuild(opened.id, opened.version); setOpened(await client.document(opened.id, opened.version)); setStatus(result.rebuilt ? `已按原文重建${result.chunks}段；原文版本、宫殿和其他文档未修改。` : "分段完整，无需重建；来源ID和版本保持不变。"); })}>检查并按需重建分段</button>}
            </div>
            {opened && <details open={sourceLine !== null} className="space-y-2 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900"><summary className="cursor-pointer">查看已保存版本与来源定位（{opened.chunks.length} 段）</summary><p className="mt-2 break-all">文档 {opened.id} · v{opened.version} · {opened.contentHash}</p>{opened.chunks.map((segment) => <div key={segment.id} className={`mt-3 border-t pt-2 ${sourceLine && sourceLine >= segment.startLine && sourceLine <= segment.endLine ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-zinc-200 dark:border-zinc-800"}`}><p>{segment.heading || "正文"} · 原文行 {segment.startLine}–{segment.endLine} · v{segment.documentVersion}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{segment.content}</pre></div>)}</details>}
          </form>
        </div>
      </>}
    </fieldset>
  </section>;
}
