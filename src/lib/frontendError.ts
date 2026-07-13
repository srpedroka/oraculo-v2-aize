import { supabase } from "./supabase";

export async function reportFrontendError(occurrenceId: string, errorCode: string) {
  const orgId = window.localStorage.getItem("oraculo.activeOrgId");
  if (!supabase || !orgId) return;
  await supabase.functions.invoke("operational-health", {
    body: {
      action: "frontend_error",
      orgId,
      occurrenceId,
      errorCode: errorCode.slice(0, 80),
      path: window.location.pathname.slice(0, 160),
    },
  });
}

