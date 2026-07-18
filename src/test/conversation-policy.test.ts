import { describe, expect, it } from "vitest";
import {
  CONVERSATION_IDLE_TIMEOUT_MS,
  shouldRebindSessionConversation,
} from "../../supabase/functions/_shared/conversation-policy";

const now = new Date("2026-07-18T18:00:00.000Z");
const scope = { orgId: "org-a", userId: "user-a", channel: "web" as const };

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    org_id: scope.orgId,
    user_id: scope.userId,
    channel: scope.channel,
    status: "active",
    last_message_at: new Date(now.getTime() - 60_000).toISOString(),
    ...overrides,
  };
}

describe("vinculo entre sessao e episodio de conversa", () => {
  it("mantem somente a conversa ativa, recente e do mesmo escopo", () => {
    expect(shouldRebindSessionConversation(conversation(), scope, now)).toBe(false);
  });

  it.each([
    ["ausente", null],
    ["arquivada", conversation({ status: "archived" })],
    ["empresa diferente", conversation({ org_id: "org-b" })],
    ["usuario diferente", conversation({ user_id: "user-b" })],
    ["canal diferente", conversation({ channel: "whatsapp" })],
    [
      "ociosa pelo limite exato",
      conversation({ last_message_at: new Date(now.getTime() - CONVERSATION_IDLE_TIMEOUT_MS).toISOString() }),
    ],
    [
      "ociosa alem do limite",
      conversation({ last_message_at: new Date(now.getTime() - CONVERSATION_IDLE_TIMEOUT_MS - 1).toISOString() }),
    ],
  ])("religa quando a conversa esta %s", (_label, candidate) => {
    expect(shouldRebindSessionConversation(candidate, scope, now)).toBe(true);
  });
});
