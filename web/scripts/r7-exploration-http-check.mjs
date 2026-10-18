// Run only inside a disposable Web + empty PostgreSQL container pair; no model calls.
import assert from "node:assert/strict";
if (process.env.R7_ALLOW_ISOLATED_HTTP !== "1") throw new Error("Disposable-container opt-in is required.");
const base = "http://127.0.0.1:3000";
let assertions = 0;
const check = (condition) => { assert.ok(condition); assertions++; };
async function api(path, method = "GET", input, status = 200) {
  const response = await fetch(`${base}/api/v1/${path}`, { method, headers: { "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) });
  assert.equal(response.status, status); assertions++;
  return (await response.json()).data;
}
check((await api("game-sessions")).length === 0);
let current = await api("game-sessions", "POST", { title: "R7 disposable HTTP check", kind: "interactive-story",
  world: { name: "潮汐群岛 · 雾港", premise: "隔离合成验收，不是用户故事", tone: "轻数值行旅", rules: ["exploration.v1 / fog-harbor@1.0.0"], boundaries: ["虚构不进入现实记忆"] }, initialCharacter: null }, 201);
const id = current.id;
current = await api(`game-sessions/${id}/status`, "PATCH", { status: "active", expectedVersion: current.version });
const state = () => current.turns.find((turn) => turn.id === current.activeLeafTurnId).stateSnapshot.exploration;
const turnInput = (action, parentTurnId = current.activeLeafTurnId) => ({ content: "R7 synthetic action", parentTurnId, expectedVersion: current.version, requestId: crypto.randomUUID(), explorationAction: action });
const run = async (action, parent) => { const input = turnInput(action, parent); current = await api(`game-sessions/${id}/turns`, "POST", input, 201); return input; };
const start = await run({ action: "start", templateId: "fog-harbor", templateVersion: "1.0.0" }, null); const root = current.activeLeafTurnId;
check(state().locationId === "harbor");
const earlyExport = await api(`game-sessions/${id}/export`, "POST", { format: "json" });
check(!earlyExport.content.includes("母亲留下的信") && !earlyExport.content.includes("守望者盟约："));
current = await api(`game-sessions/${id}/turns`, "POST", start, 201); check(current.turns.length === 1);
await api(`game-sessions/${id}/turns`, "POST", turnInput({ action: "move", targetId: "tower" }), 422);
await api(`game-sessions/${id}/turns`, "POST", { ...turnInput({ action: "wait" }), expectedVersion: 1 }, 409);
await run({ action: "move", targetId: "market" });
const buy = await run({ action: "trade", instanceId: "merchant-tea", targetId: "merchant", direction: "buy", quantity: 3 });
check(state().coins === 6); const boughtLeaf = current.activeLeafTurnId;
current = await api(`game-sessions/${id}/turns`, "POST", buy, 201); check(current.activeLeafTurnId === boughtLeaf);
current = await api(`game-sessions/${id}/checkpoints`, "POST", { name: "交易后", note: "隔离测试", expectedVersion: current.version }, 201);
const checkpoint = current.checkpoints[0].id;
const route = [
  ["move", "market"], ["move", "tower"], ["investigate", "beacon"], ["ask", "keeper", "repair"], ["promise", "keeper"],
  ["move", "market"], ["move", "archive"], ["investigate", "chart"], ["move", "market"], ["move", "harbor"],
  ["move", "marsh"], ["investigate", "wreck"], ["move", "shrine"], ["investigate", "inscription"],
  ["move", "marsh"], ["move", "harbor"], ["move", "market"], ["move", "tower"], ["ask", "keeper", "oath"],
  ["help", "keeper"], ["negotiate", "keeper"],
];
for (const [index, [action, targetId, topicId]] of route.entries()) await run({ action, targetId, ...(topicId ? { topicId } : {}) }, index === 0 ? root : undefined);
await run({ action: "choose", eventId: "lantern-accord", choiceId: "prepare" });
await run({ action: "choose", eventId: "lantern-accord", choiceId: "public" });
check(state().view.epics[0].ending === "开放的灯火"); check(state().characters.keeper.locationId === "harbor");
check(!state().instances.some((item) => item.definitionId === "lens"));
check(state().coins === 14); // the sibling trade never affected this branch
await api(`game-sessions/${id}/turns`, "POST", turnInput({ action: "choose", eventId: "lantern-accord", choiceId: "public" }), 422);
const result = await api(`game-sessions/${id}/exploration/history`, "POST", { parentTurnId: current.activeLeafTurnId, q: "公共" });
check(result.entries.length > 0 && result.entries.every((entry) => entry.sourceTurnId));
const other = await api(`game-sessions/${id}/exploration/history`, "POST", { parentTurnId: boughtLeaf, q: "公共" });
check(other.entries.length === 0);
const exported = JSON.parse((await api(`game-sessions/${id}/export`, "POST", { format: "json" })).content);
check(exported.schemaVersion === 3 && exported.session.turns.length === current.turns.length);
current = await api(`game-sessions/${id}/checkpoints/${checkpoint}/restore`, "POST", { expectedVersion: current.version });
check(current.activeLeafTurnId === boughtLeaf && state().coins === 6 && state().locationId === "market");
check(state().view.epics.length === 0);
check(current.turns.every((turn) => turn.model === "host-exploration/v1"));
const actions = await api("actions"); check(actions.items.length === 0);
console.log(JSON.stringify({ status: "passed", assertions, persistedTurns: current.turns.length, modelCalls: 0, productionDatabaseTouched: false }));
