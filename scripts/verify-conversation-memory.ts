import assert from "node:assert/strict";
import { buildEpisodeBridgeSummary, CONVERSATION_IDLE_TIMEOUT_MS, conversationIdleExpired, isExplicitPlanningResume } from "../supabase/functions/_shared/conversation-policy.ts";
import { historicalMemoryLines } from "../supabase/functions/_shared/plan-context.ts";

const lastMessage = "2026-07-11T13:48:00.000Z";
assert.equal(conversationIdleExpired(lastMessage, new Date("2026-07-11T17:47:59.000Z")), false);
assert.equal(conversationIdleExpired(lastMessage, new Date("2026-07-11T17:48:00.000Z")), true);
assert.equal(CONVERSATION_IDLE_TIMEOUT_MS, 4 * 60 * 60 * 1000);
assert.equal(isExplicitPlanningResume("Olá"), false);
assert.equal(isExplicitPlanningResume("Vamos continuar o planejamento de onde paramos"), true);
assert.equal(isExplicitPlanningResume("Pode seguir com o plano"), true);

const bridgeSummary = buildEpisodeBridgeSummary(null, [
  { id: "1", author: "user", text: "A prioridade e reduzir refugos.", created_at: "2026-07-11T13:00:00.000Z" },
  { id: "2", author: "oracle", text: "Vou considerar isso no plano.", created_at: "2026-07-11T13:01:00.000Z" },
]);
assert.ok(bridgeSummary?.includes("reduzir refugos"));
assert.ok(bridgeSummary?.includes("Final do episodio anterior"));

const documents = Array.from({ length: 7 }, (_, index) => ({
  id: `doc-${index + 1}`,
  area_id: index === 6 ? "other-area" : "production",
  type: index % 2 ? "quarterly" : "monthly",
  period: `M${index + 1} 2026`,
  title: `Histórico ${index + 1}`,
  content: { raw: `Decisão e aprendizado ${index + 1}` },
  created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));
const memory = historicalMemoryLines(documents, [{ id: "production", name: "Produção" }], {
  focus: "monthly",
  areaId: "production",
});
assert.ok(memory.join("\n").includes("MEMÓRIA ESTRATÉGICA"));
assert.ok(memory.join("\n").includes("Histórico 6"));
assert.equal(memory.filter((line) => line.startsWith("- Histórico")).length, 5);
assert.ok(!memory.join("\n").includes("Histórico 7"));

console.log("Conversation and historical memory fixtures: OK");
