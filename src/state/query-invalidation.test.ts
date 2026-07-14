import { describe, expect, it } from "vitest";
import {
  ALL_QUERY_DOMAINS,
  invalidateQueryDomains,
  operationalEntityDomains,
  queryKeysForDomains,
  realtimeDomainsForTable,
} from "./query-invalidation";

const context = { orgId: "org-1", userId: "user-1" };

describe("invalidacao seletiva", () => {
  it("um log de IA invalida somente o historico de uso", () => {
    expect(queryKeysForDomains(context, realtimeDomainsForTable("ai_usage_logs"))).toEqual([
      ["ai_usage_logs", "org-1"],
    ]);
  });

  it("executa somente as invalidacoes calculadas", () => {
    const calls: unknown[] = [];
    const queryClient = {
      invalidateQueries: (filters: unknown) => {
        calls.push(filters);
        return Promise.resolve();
      },
    };
    invalidateQueryDomains(queryClient as never, context, ["chat", "aiUsage"]);
    expect(calls).toEqual([
      { queryKey: ["chat_messages", "org-1"] },
      { queryKey: ["ai_usage_logs", "org-1"] },
    ]);
  });

  it("uma evidencia nao recarrega configuracoes, membros ou chat", () => {
    const keys = queryKeysForDomains(context, realtimeDomainsForTable("evidences"));
    expect(keys).toEqual([
      ["evidences", "org-1"],
      ["area-operational-impact", "org-1"],
    ]);
    expect(keys).not.toContainEqual(["memberships"]);
    expect(keys).not.toContainEqual(["ai_settings", "org-1"]);
    expect(keys).not.toContainEqual(["chat_messages", "org-1"]);
  });

  it("arquivar objetivo inclui dependencias e auditoria", () => {
    const keys = queryKeysForDomains(context, operationalEntityDomains("objective"));
    expect(keys).toContainEqual(["objectives", "org-1"]);
    expect(keys).toContainEqual(["key_actions", "org-1"]);
    expect(keys).toContainEqual(["evidences", "org-1"]);
    expect(keys).toContainEqual(["objective_kpi_links", "org-1"]);
    expect(keys).toContainEqual(["operational_revisions", "org-1"]);
  });

  it("o refresh manual continua cobrindo todos os dominios", () => {
    const keys = queryKeysForDomains(context, ALL_QUERY_DOMAINS);
    expect(keys.length).toBeGreaterThan(20);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
  });
});
