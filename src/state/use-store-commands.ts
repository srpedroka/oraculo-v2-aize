import { useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AiFunction,
  AiProvider,
  AiSettingsSaveResult,
  KpiImportInput,
  KpiImportKind,
  KpiSpreadsheetSuggestion,
  OrgTone,
} from "../types";
import { callEdgeFunction, requireClient } from "./store-client";
import { mapOrgTone } from "./domains/settings-mappers";

interface UseStoreCommandsOptions {
  orgId: string | null;
  userId: string | null;
  session: Session | null;
  queryClient: QueryClient;
  invalidateOrg: () => void;
  setActiveOrgId: (orgId: string | null) => void;
  setPasswordRecoveryActive: (active: boolean) => void;
}

export function useStoreCommands({
  orgId,
  userId,
  session,
  queryClient,
  invalidateOrg,
  setActiveOrgId,
  setPasswordRecoveryActive,
}: UseStoreCommandsOptions) {
  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const client = requireClient();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const client = requireClient();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecoveryActive(false);
  }, []);

  const signOut = useCallback(async () => {
    const client = requireClient();
    await client.auth.signOut();
    setActiveOrgId(null);
    window.localStorage.removeItem("oraculo.activeOrgId");
  }, []);

  const updateProfile = useCallback(
    async (profile: { fullName: string; phone: string | null }) => {
      const client = requireClient();
      if (!userId) return;

      const { error } = await client
        .from("profiles")
        .update({
          full_name: profile.fullName.trim() || null,
          email: session?.user.email ?? null,
          phone: profile.phone,
        })
        .eq("id", userId);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    [queryClient, session?.user.email, userId],
  );

  const refresh = useCallback(() => {
    invalidateOrg();
  }, [invalidateOrg]);

  const suggestKpiSpreadsheet = useCallback(
    async (input: KpiImportInput) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction("suggest-kpi-spreadsheet", {
        orgId,
        inputKind: input.kind,
        fileName: input.fileName,
        rawText: input.rawText,
        image: input.image,
        fromHistory: input.fromHistory ?? false,
        onlyGaps: input.onlyGaps,
      }) as {
        suggestion: KpiSpreadsheetSuggestion;
        historyDocuments?: import("../types").KpiHistoryDocumentRef[];
        fromHistory?: boolean;
      };
      queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
      return result;
    },
    [orgId, queryClient],
  );

  const applyKpiSpreadsheetSuggestion = useCallback(
    async (suggestion: KpiSpreadsheetSuggestion, source: { fileName: string; kind: KpiImportKind; token?: string }) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        suggestion: KpiSpreadsheetSuggestion;
        fileName: string;
        inputKind: KpiImportKind;
        applyToken?: string;
      }>("apply-kpi-import", {
        orgId,
        suggestion,
        fileName: source.fileName,
        inputKind: source.kind,
        // "Número de recibo" da importação: mesma aplicação (duplo clique) = mesmo token
        // = idempotente; nova importação = novo token = reaplica.
        applyToken: source.token,
      }) as { appliedCount: number };
      queryClient.invalidateQueries({ queryKey: ["kpi_monthly_values", orgId] });
      queryClient.invalidateQueries({ queryKey: ["plan_documents", orgId] });
      return result.appliedCount;
    },
    [orgId, queryClient],
  );

  const saveAiProviderKey = useCallback(
    async (provider: AiProvider, apiKey: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        provider: AiProvider;
        apiKey: string;
      }>("save-ai-settings", {
        orgId,
        provider,
        apiKey,
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const saveAiFunctionSetting = useCallback(
    async (fn: AiFunction, provider: AiProvider, model: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        function: AiFunction;
        provider: AiProvider;
        model: string;
      }>("save-ai-settings", {
        orgId,
        function: fn,
        provider,
        model,
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const testAiProviderKey = useCallback(
    async (provider: AiProvider) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        provider: AiProvider;
        mode: string;
      }>("save-ai-settings", {
        orgId,
        provider,
        mode: "test",
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const testAiFunction = useCallback(
    async (fn: AiFunction, provider: AiProvider, model: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        function: AiFunction;
        provider: AiProvider;
        model: string;
        mode: string;
      }>("save-ai-settings", {
        orgId,
        function: fn,
        provider,
        model,
        mode: "test",
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const saveOrgTone = useCallback(
    async (tone: Pick<OrgTone, "preset" | "acidity" | "drive" | "customNote">) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      if (!userId) throw new Error("Sessão obrigatória");
      const client = requireClient();
      const { data, error } = await client
        .from("org_ai_tone")
        .upsert({
          org_id: orgId,
          preset: tone.preset,
          axis_acidity: Math.max(-2, Math.min(2, Math.round(tone.acidity))),
          axis_drive: Math.max(-2, Math.min(2, Math.round(tone.drive))),
          custom_note: tone.customNote?.trim().slice(0, 280) || null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "org_id" })
        .select("*")
        .single();
      if (error) throw error;
      const saved = mapOrgTone(data);
      queryClient.setQueryData(["org_ai_tone", orgId], saved);
      return saved;
    },
    [orgId, queryClient, userId],
  );

  return {
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    updateProfile,
    refresh,
    saveAiProviderKey,
    saveAiFunctionSetting,
    testAiProviderKey,
    testAiFunction,
    saveOrgTone,
    suggestKpiSpreadsheet,
    applyKpiSpreadsheetSuggestion,
  };
}

