import type { ChatMessage, CheckIn, OperationalRevision, PlanDocument, PlanningSession } from "../../types";
import { mapOperationalLifecycle } from "./shared";

export function mapChatMessage(row: any): ChatMessage {
  return {
    id: row.id, orgId: row.org_id, areaId: row.area_id ?? null, userId: row.user_id ?? null,
    conversationId: row.conversation_id ?? null, author: row.author, text: row.text, channel: row.channel ?? "web", createdAt: row.created_at,
  };
}

export function mapPlanningSession(row: any): PlanningSession {
  return {
    id: row.id, orgId: row.org_id, areaId: row.area_id ?? null, userId: row.user_id,
    conversationId: row.conversation_id ?? null, type: row.type, period: row.period, phase: row.phase, state: row.state ?? {},
    pendingProposal: row.pending_proposal ?? null, status: row.status, createdAt: row.created_at, completedAt: row.completed_at ?? null,
  };
}

export function mapPlanDocument(row: any): PlanDocument {
  return {
    id: row.id, orgId: row.org_id, areaId: row.area_id ?? null, sessionId: row.session_id ?? null, type: row.type,
    origin: row.origin ?? "session", period: row.period, title: row.title, content: row.content ?? {}, version: Number(row.version ?? 1),
    createdBy: row.created_by ?? null, createdAt: row.created_at, ...mapOperationalLifecycle(row),
  };
}

export function mapOperationalRevision(row: any): OperationalRevision {
  return {
    id: row.id, orgId: row.org_id, entityType: row.entity_type, entityId: row.entity_id, action: row.action,
    beforeData: row.before_data ?? {}, afterData: row.after_data ?? {}, changedBy: row.changed_by ?? null, createdAt: row.created_at,
  };
}

export function mapCheckIn(row: any): CheckIn {
  return {
    id: row.id, orgId: row.org_id, areaId: row.area_id ?? null, period: row.period, summary: row.summary ?? null,
    details: row.details ?? {}, createdBy: row.created_by ?? null, createdAt: row.created_at, ...mapOperationalLifecycle(row),
  };
}
