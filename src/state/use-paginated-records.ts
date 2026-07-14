import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { requireClient } from "./store-client";
import { mapEvidence } from "./domains/planning-mappers";
import { mapAiUsageLog } from "./domains/settings-mappers";
import { mapCheckIn, mapOperationalRevision, mapPlanDocument } from "./domains/session-mappers";
import type { AiUsageLog, CheckIn, Evidence, OperationalRevision, PlanDocument, PlanDocumentType } from "../types";

export const CURSOR_PAGE_SIZE = 30;

export interface RecordCursor {
  createdAt: string;
  id: string;
}

interface CursorPage<T> {
  items: T[];
  nextCursor: RecordCursor | null;
}

export function buildCreatedAtCursorFilter(cursor: RecordCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function cursorFromRows(rows: any[], pageSize: number): RecordCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return { createdAt: String(last.created_at), id: String(last.id) };
}

async function fetchCursorPage<T>({
  table,
  orgId,
  cursor,
  pageSize = CURSOR_PAGE_SIZE,
  configure,
  map,
}: {
  table: string;
  orgId: string;
  cursor: RecordCursor | null;
  pageSize?: number;
  configure?: (query: any) => any;
  map: (row: any) => T;
}): Promise<CursorPage<T>> {
  const client = requireClient();
  let query: any = client.from(table).select("*").eq("org_id", orgId);
  if (configure) query = configure(query);
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
  if (cursor) query = query.or(buildCreatedAtCursorFilter(cursor));
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  return { items: rows.map(map), nextCursor: cursorFromRows(rows, pageSize) };
}

function useCursorRecords<T>({
  queryKey,
  enabled,
  queryFn,
}: {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: (cursor: RecordCursor | null) => Promise<CursorPage<T>>;
}) {
  const query = useInfiniteQuery<CursorPage<T>, Error>({
    queryKey,
    enabled,
    initialPageParam: null as RecordCursor | null,
    queryFn: ({ pageParam }) => queryFn(pageParam as RecordCursor | null),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

export interface PlanDocumentFilters {
  type?: PlanDocumentType | null;
  areaId?: string | "company" | null;
  period?: string | null;
  archived?: boolean;
}

export function usePaginatedPlanDocuments(orgId: string | null, filters: PlanDocumentFilters, enabled = true) {
  const type = filters.type ?? null;
  const areaId = filters.areaId ?? null;
  const period = filters.period?.trim() || null;
  const archived = Boolean(filters.archived);
  return useCursorRecords<PlanDocument>({
    queryKey: ["plan_documents", orgId, "paged", archived, type, areaId, period],
    enabled: Boolean(enabled && orgId),
    queryFn: (cursor) => fetchCursorPage({
      table: "plan_documents",
      orgId: orgId as string,
      cursor,
      configure: (base) => {
        let query = archived ? base.not("archived_at", "is", null) : base.is("archived_at", null);
        if (type) query = query.eq("type", type);
        if (areaId === "company") query = query.is("area_id", null);
        else if (areaId) query = query.eq("area_id", areaId);
        if (period) query = query.eq("period", period);
        return query;
      },
      map: mapPlanDocument,
    }),
  });
}

export function usePaginatedObjectiveEvidences(orgId: string | null, objectiveId: string | null, enabled = true) {
  return useCursorRecords<Evidence>({
    queryKey: ["evidences", orgId, "objective", objectiveId, "paged"],
    enabled: Boolean(enabled && orgId && objectiveId),
    queryFn: (cursor) => fetchCursorPage({
      table: "evidences",
      orgId: orgId as string,
      cursor,
      configure: (query) => query.eq("objective_id", objectiveId).is("archived_at", null),
      map: mapEvidence,
    }),
  });
}

export function usePaginatedArchivedEvidences(orgId: string | null, enabled = true) {
  return useCursorRecords<Evidence>({
    queryKey: ["evidences", orgId, "archived", "paged"],
    enabled: Boolean(enabled && orgId),
    queryFn: (cursor) => fetchCursorPage({
      table: "evidences", orgId: orgId as string, cursor,
      configure: (query) => query.not("archived_at", "is", null), map: mapEvidence,
    }),
  });
}

export function usePaginatedArchivedCheckIns(orgId: string | null, enabled = true) {
  return useCursorRecords<CheckIn>({
    queryKey: ["check_ins", orgId, "archived", "paged"],
    enabled: Boolean(enabled && orgId),
    queryFn: (cursor) => fetchCursorPage({
      table: "check_ins", orgId: orgId as string, cursor,
      configure: (query) => query.not("archived_at", "is", null), map: mapCheckIn,
    }),
  });
}

export function usePaginatedOperationalRevisions(orgId: string | null, enabled = true) {
  return useCursorRecords<OperationalRevision>({
    queryKey: ["operational_revisions", orgId, "paged"],
    enabled: Boolean(enabled && orgId),
    queryFn: (cursor) => fetchCursorPage({
      table: "operational_revisions", orgId: orgId as string, cursor, map: mapOperationalRevision,
    }),
  });
}

export function usePaginatedAiUsageLogs(orgId: string | null, enabled = true) {
  return useCursorRecords<AiUsageLog>({
    queryKey: ["ai_usage_logs", orgId, "paged"],
    enabled: Boolean(enabled && orgId),
    queryFn: (cursor) => fetchCursorPage({
      table: "ai_usage_logs", orgId: orgId as string, cursor, map: mapAiUsageLog,
    }),
  });
}

export function usePlanDocumentById(orgId: string | null, documentId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["plan_documents", orgId, "by-id", documentId],
    enabled: Boolean(enabled && orgId && documentId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("plan_documents")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPlanDocument(data) : null;
    },
  });
}

export function useHistoricalDocumentCount(orgId: string | null) {
  return useQuery({
    queryKey: ["plan_documents", orgId, "historical-count"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = requireClient();
      const { count, error } = await client
        .from("plan_documents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("origin", "historical")
        .is("archived_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useAreaOperationalImpact(orgId: string | null, areaId: string | null) {
  return useQuery({
    queryKey: ["area-operational-impact", orgId, areaId],
    enabled: Boolean(orgId && areaId),
    queryFn: async () => {
      const client = requireClient();
      const countActive = async (table: string) => {
        const { count, error } = await client
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("area_id", areaId)
          .is("archived_at", null);
        if (error) throw error;
        return count ?? 0;
      };
      const [objectives, documents, checkIns] = await Promise.all([
        countActive("objectives"),
        countActive("plan_documents"),
        countActive("check_ins"),
      ]);
      return { objectives, documents, checkIns };
    },
  });
}
