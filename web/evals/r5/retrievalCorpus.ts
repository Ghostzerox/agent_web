import type { KnowledgeCandidate } from "@/lib/knowledge/retrieval";
export const evalUuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const EVAL_OWNER = evalUuid(1); export const EVAL_COLLECTION = evalUuid(2);
// Hand-authored synthetic facts and gold query/source assignments, not model labels.
export const TOPICS = [
  ["缓存有效期", "缓存的有效期为三十分钟，超期后刷新读取。"],
  ["增量备份", "增量备份仅保存自上次备份后发生变化的数据。"],
  ["回滚规则", "恢复旧版本前需要校验备份，不能直接清空数据卷。"],
  ["任务延期", "任务推迟时保留原始截止日期，并记录延期原因。"],
  ["费用预算", "每月成本预算分为固定费用与可变开销。"],
  ["背诵训练", "记忆训练应先尝试主动回忆，再对照原文检查。"],
  ["通货膨胀", "物价上涨会削弱固定名义收入的实际购买力。"],
  ["检索增强生成", "检索增强生成先查询可信资料，再将证据交给模型生成。"],
  ["应用程序接口", "应用程序接口约定请求参数、返回格式与错误类型。"],
  ["中央处理器", "中央处理器执行指令并协调计算任务。"],
  ["随机存取存储器", "内存断电后通常无法保留正在处理的数据。"],
  ["图形处理器", "图形处理器适合大量相似计算的并行执行。"],
  ["二氧化碳", "二氧化碳是一种温室气体，不等同于空气中的全部碳。"],
  ["北京时间", "中国标准时间为协调世界时加八小时。"],
  ["同比统计", "同比表示与去年同期相比，不是与上一个月相比。"],
  ["资料删除", "移除文档时应同时删除其派生分段。"],
  ["勾股定理", "直角三角形的两条直角边平方和等于斜边平方。"],
  ["机会成本", "选择某个方案所放弃的其他方案中最高收益称为机会成本。"],
  ["间隔复习", "把复习分散到不同日期通常优于一次集中重复。"],
  ["牛顿第一定律", "物体不受外力时保持静止或匀速直线运动。"],
] as const;
export type EvalRecord = KnowledgeCandidate & { rootVersion: number | null; sourceKind: "knowledge-document" | "conversation-message"; eligibleCollection: boolean };
export function retrievalCorpus(scale = 1): EvalRecord[] {
  const rows: EvalRecord[] = [];
  for (let documentIndex = 0; documentIndex < 100 * scale; documentIndex++) {
    const topic = TOPICS[documentIndex];
    for (let chunk = 0; chunk < 10; chunk++) {
      let content = chunk === 0 && topic ? topic[1] : `档案材料编号 doc${documentIndex}seg${chunk}，此段仅记录常规归档清单与非答案性说明。`;
      const record: EvalRecord = { ownerId: EVAL_OWNER, collectionId: EVAL_COLLECTION, module: "professional", documentId: evalUuid(100 + documentIndex), chunkId: evalUuid(10000 + documentIndex * 10 + chunk), title: topic?.[0] ?? `归档文件${documentIndex}`, heading: chunk ? "归档清单" : topic?.[0] ?? "摘要", content, version: 1, rootVersion: 1, contentHash: "a".repeat(64), chunkHash: "b".repeat(64), startLine: chunk * 2 + 1, endLine: chunk * 2 + 2, sourceKind: "knowledge-document", eligibleCollection: true };
      if (documentIndex >= 80 && documentIndex < 88) { content = `旧口令旧版证据 oldproof${documentIndex}`; record.rootVersion = documentIndex < 84 ? 2 : null; }
      if (documentIndex >= 88 && documentIndex < 92) { content = `其他用户隐私 ownersecret${documentIndex}`; record.ownerId = evalUuid(999); }
      if (documentIndex >= 92 && documentIndex < 96) { content = `未选集合隐私 collectionsecret${documentIndex}`; record.collectionId = evalUuid(998); record.eligibleCollection = false; }
      if (documentIndex >= 96 && documentIndex < 98) { content = `游戏虚构秘密 gamesecret${documentIndex}`; record.module = "game"; }
      if (documentIndex >= 98 && documentIndex < 100) { content = `兄弟分支私密 branchsecret${documentIndex}`; record.sourceKind = "conversation-message"; }
      rows.push({ ...record, content });
    }
  }
  return rows;
}
export type RetrievalCase = { id: string; group: "direct" | "paraphrase" | "bilingual" | "multi-source" | "no-answer" | "stale-deleted" | "isolation"; query: string; gold: string[]; split: "development" | "acceptance" };
const gold = (...topics: number[]) => topics.map((topic) => evalUuid(10000 + topic * 10));
export function retrievalCases(): RetrievalCase[] {
  const cases: Omit<RetrievalCase, "split">[] = [];
  const direct = ["缓存有效期是多久", "增量备份保存什么", "回滚规则是什么", "任务延期需要保留什么", "费用预算怎样分类", "背诵训练先做什么", "通货膨胀影响购买力吗", "检索增强生成的步骤", "应用程序接口约定什么", "中央处理器负责什么", "随机存取存储器断电", "图形处理器适合何种执行", "二氧化碳与温室气体", "北京时间是哪个时区", "同比统计怎样比较", "资料删除涉及哪些内容"];
  direct.forEach((query, index) => cases.push({ id: `direct-${index + 1}`, group: "direct", query, gold: gold(index) }));
  const paraphrases: Array<[string, number]> = [["cache 的生存时间", 0], ["数据副本只记录发生变化的数据", 1], ["恢复旧版本时需要校验什么", 2], ["任务延后要记录什么", 3], ["每月开销包含哪几部分", 4], ["背书应先主动回忆还是先看原文", 5], ["物价上涨对实际购买力有什么影响", 6], ["移除文档时需要处理派生分段吗", 15], ["最长的那条边怎样根据短的两条边算出长度", 16], ["做了这个选择，最好的另一个选择的收益叫什么", 17], ["今天背一点，过几天再练是否更划算", 18], ["没有人推也没有摩擦，东西会自己慢下来吗", 19]];
  paraphrases.forEach(([query, topic], index) => cases.push({ id: `paraphrase-${index + 1}`, group: "paraphrase", query, gold: gold(topic) }));
  [ ["TTL", 0], ["RAG", 7], ["API", 8], ["CPU", 9], ["RAM", 10], ["GPU", 11], ["CO2", 12], ["中国标准时间", 13] ].forEach(([query, topic], index) => cases.push({ id: `bilingual-${index + 1}`, group: "bilingual", query: String(query), gold: gold(Number(topic)) }));
  [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]].forEach(([a, b], index) => cases.push({ id: `multi-${index + 1}`, group: "multi-source", query: `${TOPICS[a][0]}和${TOPICS[b][0]}`, gold: gold(a, b) }));
  ["木星卫星数量", "玻璃熔点", "火星人口", "远古恐龙灭绝日期", "深海鲸鱼迁徙路线", "张教授的私人电话", "紫色蘑菇识别", "猫咪疫苗预约地址", "铀矿储量", "月球旅馆房价", "白垩纪珊瑚化石", "量子纠缠实验装置"].forEach((query, index) => cases.push({ id: `no-answer-${index + 1}`, group: "no-answer", query, gold: [] }));
  for (let index = 80; index < 88; index++) cases.push({ id: `stale-${index}`, group: "stale-deleted", query: `oldproof${index}`, gold: [] });
  for (let index = 88; index < 96; index++) cases.push({ id: `isolation-${index}`, group: "isolation", query: `${index < 92 ? "ownersecret" : "collectionsecret"}${index}`, gold: [] });
  for (let index = 96; index < 100; index++) for (const variant of ["", "隐私"]) cases.push({ id: `isolation-${index}-${variant || "exact"}`, group: "isolation", query: `${index < 98 ? "gamesecret" : "branchsecret"}${index} ${variant}`, gold: [] });
  return cases.map((item, index) => ({ ...item, split: index % 4 === 0 ? "development" : "acceptance" }));
}
