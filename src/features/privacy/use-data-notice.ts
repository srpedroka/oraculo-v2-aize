import { useQuery } from "@tanstack/react-query";
import { loadDataNoticeAcknowledgement } from "./api";

export function dataNoticeQueryKey(orgId: string) {
  return ["organization-data-notice", orgId] as const;
}

export function useDataNoticeAcknowledgement(orgId: string | null, enabled = true) {
  return useQuery({
    queryKey: dataNoticeQueryKey(orgId ?? "none"),
    queryFn: () => loadDataNoticeAcknowledgement(orgId!),
    enabled: Boolean(orgId) && enabled,
    staleTime: 5 * 60_000,
  });
}
