import { useCallback } from "react";
import type {
  CompanyProfileSuggestion,
  HistoricalConflict,
  HistoricalDocumentCandidate,
  HistoricalHeaderMetadata,
  HistoricalImportSuggestion,
  HistoricalMetadataSuggestion,
  HistoricalTableCandidate,
  ObjectiveKpiSuggestion,
} from "../types";
import { callEdgeFunction, requireClient } from "./store-client";
import type { AppAction } from "./store-contract";
import { toKeyActionInsert, toObjectiveInsert } from "./domains/planning-mappers";
import {
  operationalEntityDomains,
  PLANNING_MUTATION_DOMAINS,
  type QueryDomain,
} from "./query-invalidation";

interface UseStoreDispatchOptions {
  orgId: string | null;
  userId: string | null;
  invalidateDomains: (domains: QueryDomain[]) => void;
  uiDispatch: (action: AppAction) => void;
  setActiveOrgId: (orgId: string | null) => void;
}

export function useStoreDispatch({
  orgId,
  userId,
  invalidateDomains,
  uiDispatch,
  setActiveOrgId,
}: UseStoreDispatchOptions) {
  return useCallback(
    (action: AppAction) => {
      if (["toggle_sidebar", "set_sidebar_width", "toggle_mobile_nav", "open_mobile_nav", "close_mobile_nav", "set_oracle_mode"].includes(action.type)) {
        uiDispatch(action);
        return;
      }

      if (action.type === "set_active_org") {
        setActiveOrgId(action.orgId);
        window.localStorage.setItem("oraculo.activeOrgId", action.orgId);
        return;
      }

      const client = requireClient();

      if (action.type === "create_organization") {
        void (async () => {
          if (!userId) { action.onError?.("Faça login para criar uma empresa."); return; }
          try {
            // Criação atômica no servidor (org + dono + ai_settings + 4 KPIs numa
            // transação; nada parcial se falhar). O token (estável por criação, gerado
            // no componente) deduplica duplo clique pela PK derivada dele no servidor.
            const { org } = await callEdgeFunction("create-organization", {
              name: action.name,
              subtitle: action.subtitle || null,
              token: action.token,
            }) as { org: { id: string } };
            setActiveOrgId(org.id);
            window.localStorage.setItem("oraculo.activeOrgId", org.id);
            invalidateDomains(["memberships", "profiles", "organizations"]);
            action.onSuccess?.();
          } catch (error) {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível criar a empresa.");
          }
        })();
        return;
      }

      if (!orgId) return;

      if (action.type === "create_area") {
        void client
          .from("areas")
          .insert({ org_id: orgId, name: action.name, coordinator_id: action.coordinatorId || null })
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["areas"]);
          });
        return;
      }

      if (action.type === "update_area") {
        void client
          .from("areas")
          .update({ name: action.name, coordinator_id: action.coordinatorId || null })
          .eq("id", action.areaId)
          .eq("org_id", orgId)
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["areas"]);
          });
        return;
      }

      if (action.type === "archive_area") {
        void (async () => {
          const { data, error } = await client
            .from("areas")
            .update({ archived_at: new Date().toISOString(), archived_by: userId })
            .eq("id", action.areaId)
            .eq("org_id", orgId)
            .is("archived_at", null)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Área não encontrada ou já arquivada.");
          invalidateDomains(["areas", "areaImpact"]);
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível arquivar a área.");
        });
        return;
      }

      if (action.type === "restore_area") {
        void (async () => {
          const { data, error } = await client
            .from("areas")
            .update({ archived_at: null, archived_by: null })
            .eq("id", action.areaId)
            .eq("org_id", orgId)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Área arquivada não encontrada.");
          invalidateDomains(["areas", "areaImpact"]);
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível restaurar a área.");
        });
        return;
      }

      if (action.type === "create_member") {
        void callEdgeFunction("invite-member", {
          orgId,
          email: action.email,
          fullName: action.fullName ?? "",
          phone: action.phone ?? null,
          role: action.role,
          areaId: action.areaId ?? null,
          notify: action.notify ?? true,
          redirectTo: window.location.origin,
        })
          .then((result) => {
            invalidateDomains(["memberships", "profiles", "areas"]);
            action.onSuccess?.(result as { channel?: string; inviteLink?: string; detail?: string } | undefined);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível convidar a pessoa.");
          });
        return;
      }

      if (action.type === "set_member_role") {
        void callEdgeFunction("set-member-role", {
          orgId,
          membershipId: action.membershipId,
          role: action.role,
        })
          .then(() => {
            invalidateDomains(["memberships"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível alterar o papel.");
          });
        return;
      }

      if (action.type === "set_member_area") {
        void callEdgeFunction("set-member-area", {
          orgId,
          membershipId: action.membershipId,
          areaId: action.areaId,
        })
          .then((result) => {
            invalidateDomains(["memberships", "areas"]);
            action.onSuccess?.(result as { changedAreaIds?: string[] } | undefined);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível alterar a área.");
          });
        return;
      }

      if (action.type === "remove_member") {
        void callEdgeFunction("remove-member", {
          orgId,
          membershipId: action.membershipId,
          areaReassignments: action.areaReassignments,
        })
          .then(() => {
            invalidateDomains(["memberships", "profiles", "areas"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível remover a pessoa.");
          });
        return;
      }

      if (action.type === "leave_organization") {
        void callEdgeFunction("organization-lifecycle", { action: "leave", orgId, reason: action.reason ?? null })
          .then(() => {
            invalidateDomains(["memberships", "profiles", "organizations"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível sair da empresa.");
          });
        return;
      }

      if (action.type === "archive_organization") {
        void callEdgeFunction("organization-lifecycle", { action: "archive", orgId, reason: action.reason ?? null })
          .then(() => {
            invalidateDomains(["memberships", "profiles", "organizations"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível encerrar a empresa.");
          });
        return;
      }

      if (action.type === "restore_organization") {
        void callEdgeFunction("organization-lifecycle", { action: "restore", orgId })
          .then(() => {
            invalidateDomains(["memberships", "profiles", "organizations"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível restaurar a empresa.");
          });
        return;
      }

      if (action.type === "delete_organization") {
        void callEdgeFunction("organization-lifecycle", {
          action: "permanent_delete",
          orgId,
          confirmName: action.confirmName,
          reason: action.reason ?? null,
        })
          .then(() => {
            invalidateDomains(["memberships", "profiles", "organizations"]);
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível excluir a empresa.");
          });
        return;
      }

      if (action.type === "add_chat_message") {
        void client
          .from("chat_messages")
          .insert({
            org_id: orgId,
            area_id: action.message.areaId ?? null,
            user_id: userId,
            author: action.message.author,
            text: action.message.text,
            channel: action.message.channel ?? "web",
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["chat"]);
          });
        return;
      }

      if (action.type === "send_oracle_message") {
        void callEdgeFunction("oracle-chat", {
          orgId,
          areaId: action.areaId ?? null,
          message: action.text,
          context: action.context ?? "chat",
        }).then(() => {
          invalidateDomains(["chat", "sessions", "aiUsage"]);
        });
        return;
      }

      if (action.type === "start_session") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "start",
          orgId,
          areaId: action.areaId ?? null,
          type: action.sessionType,
          period: action.period,
          channel: "web",
        }).then(() => {
          invalidateDomains(["sessions", "chat"]);
        });
        return;
      }

      if (action.type === "import_ready_strategic_plan") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "import_ready_plan",
          orgId,
          period: action.period,
          planText: action.text,
          fileName: action.fileName ?? null,
          channel: "web",
        }).then(() => {
          invalidateDomains(["sessions", "chat", "aiUsage"]);
        });
        return;
      }

      if (action.type === "import_ready_quarterly_plan") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "import_ready_quarterly_plan",
          orgId,
          areaId: action.areaId,
          period: action.period,
          planText: action.text,
          fileName: action.fileName ?? null,
          channel: "web",
        }).then(() => {
          invalidateDomains(["sessions", "chat", "aiUsage"]);
        });
        return;
      }

      if (action.type === "suggest_historical_metadata") {
        void callEdgeFunction("suggest-historical-metadata", {
          orgId,
          rawText: action.rawText ?? "",
          fileName: action.fileName ?? null,
          image: action.image ?? null,
        })
          .then((result) => {
            invalidateDomains(["aiUsage"]);
            const payload = result as {
              suggestion: HistoricalMetadataSuggestion;
              extractedText?: string;
              tableExpanded?: boolean;
              importSuggestion?: HistoricalImportSuggestion;
              candidates?: HistoricalDocumentCandidate[];
              tables?: HistoricalTableCandidate[];
              conflicts?: HistoricalConflict[];
              warnings?: string[];
              headerMetadata?: HistoricalHeaderMetadata;
            };
            action.onSuccess?.(payload);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível interpretar o histórico.");
          });
        return;
      }

      if (action.type === "import_historical_document") {
        void callEdgeFunction("save-historical-document", {
          orgId,
          areaId: action.areaId ?? null,
          documentType: action.documentType,
          period: action.period,
          rawText: action.rawText,
          source: action.source ?? null,
          note: action.note ?? null,
          title: action.title ?? null,
          summary: action.summary ?? null,
          classification: action.classification ?? null,
          importBackup: action.importBackup ?? null,
          sourceMetadata: action.sourceMetadata ?? null,
          documents: action.documents ?? null,
          savedCandidateId: action.savedCandidateId ?? null,
        })
          .then((result) => {
            invalidateDomains(["documents", "areaImpact"]);
            action.onSuccess?.(result as { document?: { id: string }; warning?: string | null } | undefined);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível importar o histórico.");
          });
        return;
      }

      if (action.type === "research_company_profile") {
        void callEdgeFunction("company-research", {
          orgId,
          links: action.links ?? [],
        })
          .then((result) => {
            invalidateDomains(["aiUsage"]);
            action.onSuccess?.((result as { suggestion: CompanyProfileSuggestion }).suggestion);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível pesquisar o perfil da empresa.");
          });
        return;
      }

      if (action.type === "confirm_company_profile") {
        void (async () => {
          try {
            const summary = String(action.summary ?? "").trim();
            if (!summary) throw new Error("O resumo do perfil não pode ficar vazio");

            const { data: existingRows, error: versionError } = await client
              .from("plan_documents")
              .select("version")
              .eq("org_id", orgId)
              .eq("type", "company_profile")
              .order("version", { ascending: false })
              .limit(1);
            if (versionError) throw versionError;

            const nextVersion = Number(existingRows?.[0]?.version ?? 0) + 1;
            const { error } = await client.from("plan_documents").insert({
              org_id: orgId,
              area_id: null,
              session_id: null,
              type: "company_profile",
              period: String(new Date().getFullYear()),
              title: "Perfil da empresa",
              content: {
                summary,
                sources: action.sources ?? [],
                queries: action.queries ?? [],
                links: action.links ?? [],
              },
              version: nextVersion,
              created_by: userId,
            });
            if (error) throw error;
            invalidateDomains(["documents"]);
            action.onSuccess?.();
          } catch (error) {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível confirmar o perfil da empresa.");
          }
        })();
        return;
      }

      if (action.type === "send_session_message") {
        void callEdgeFunction("oracle-session", {
          action: "message",
          sessionId: action.sessionId,
          message: action.text,
          channel: "web",
        }).then(() => {
          invalidateDomains(["sessions", "chat", "aiUsage"]);
        });
        return;
      }

      if (action.type === "confirm_session_proposal") {
        void callEdgeFunction("oracle-session", {
          action: "confirm",
          sessionId: action.sessionId,
          channel: "web",
        }).then(() => invalidateDomains(PLANNING_MUTATION_DOMAINS));
        return;
      }

      if (action.type === "abandon_session") {
        void callEdgeFunction("oracle-session", {
          action: "abandon",
          sessionId: action.sessionId,
        }).then(() => invalidateDomains(["sessions", "chat"]));
        return;
      }

      if (action.type === "add_evidence") {
        void client
          .from("evidences")
          .insert({
            org_id: orgId,
            objective_id: action.evidence.objectiveId,
            text: action.evidence.text,
            created_by: userId,
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["evidences", "areaImpact"]);
          });
        return;
      }

      if (action.type === "add_objective") {
        void (async () => {
          try {
            // Grava objetivo + ações-chave numa transação no servidor (tudo-ou-nada;
            // sem objetivo órfão). Token = idempotência (id do objetivo derivado dele).
            const objectiveRow = toObjectiveInsert(action.objective, orgId);
            const keyActionRows = (action.keyActions ?? []).map((keyAction) => toKeyActionInsert(keyAction, orgId));
            const { objective } = await callEdgeFunction("save-objective", {
              orgId,
              objectiveRow,
              keyActionRows,
              token: action.token,
            }) as { objective: { id: string } };
            invalidateDomains(["objectives", "keyActions", "areaImpact"]);
            action.onSuccess?.(objective.id);
          } catch (error) {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível criar o objetivo.");
          }
        })();
        return;
      }

      if (action.type === "update_objective") {
        void (async () => {
          try {
            const { error } = await client
              .from("objectives")
              .update(toObjectiveInsert(action.objective, orgId))
              .eq("id", action.objective.id)
              .eq("org_id", orgId);
            if (error) throw error;
            invalidateDomains(["objectives"]);
            action.onSuccess?.(action.objective.id);
          } catch (error) {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível atualizar o objetivo.");
          }
        })();
        return;
      }

      if (action.type === "suggest_objective_kpis") {
        void callEdgeFunction("suggest-objective-kpis", { orgId, objectiveId: action.objectiveId })
          .then((result) => {
            invalidateDomains(["aiUsage"]);
            action.onSuccess(((result as { suggestions?: ObjectiveKpiSuggestion[] }).suggestions ?? []));
          })
          .catch((error) => action.onError?.(error instanceof Error ? error.message : "Não foi possível sugerir KPIs."));
        return;
      }

      if (action.type === "set_objective_kpi_links") {
        void (async () => {
          try {
            // Salva o CONJUNTO de vínculos numa transação no servidor (upsert + remoção
            // dos que saíram, tudo-ou-nada). Naturalmente idempotente.
            await callEdgeFunction("set-objective-kpi-links", {
              orgId,
              objectiveId: action.objectiveId,
              links: action.links,
            });
            invalidateDomains(["kpiLinks"]);
            action.onSuccess?.();
          } catch (error) {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível salvar os vínculos de KPI.");
          }
        })();
        return;
      }

      if (action.type === "update_key_action") {
        void client
          .from("key_actions")
          .update(toKeyActionInsert(action.keyAction, orgId))
          .eq("id", action.keyAction.id)
          .eq("org_id", orgId)
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["keyActions"]);
          });
        return;
      }

      if (action.type === "set_operational_item_archived") {
        void callEdgeFunction("operational-lifecycle", {
          orgId,
          entityType: action.entityType,
          entityId: action.entityId,
          archived: action.archived,
          reason: action.reason ?? "",
        })
          .then(() => {
            invalidateDomains(operationalEntityDomains(action.entityType));
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível atualizar o registro.");
          });
        return;
      }

      if (action.type === "upsert_kpi_definition") {
        void (async () => {
          const { error } = await client
            .from("executive_kpis")
            .update({
              annual_target: action.annualTarget ?? null,
              opening_balance: action.openingBalance ?? null,
            })
            .eq("id", action.kpiId)
            .eq("org_id", orgId);
          if (error) throw error;
          invalidateDomains(["kpis"]);
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível salvar o KPI.");
        });
        return;
      }

      if (action.type === "upsert_kpi_month") {
        void (async () => {
          const rows = action.values.map((value) => ({
            org_id: orgId,
            kpi_id: action.kpiId,
            year: action.year,
            month: value.month,
            target_value: value.targetValue ?? null,
            target_stage: value.targetStage ?? null,
            actual_value: value.actualValue ?? null,
            secondary_actual: value.secondaryActual ?? null,
            note: value.note ?? null,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await client.from("kpi_monthly_values").upsert(rows, { onConflict: "kpi_id,year,month" });
          if (error) throw error;
          invalidateDomains(["kpiValues"]);
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível salvar os lançamentos.");
        });
        return;
      }

      if (action.type === "update_strategic_plan") {
        void client
          .from("strategic_plans")
          .upsert({
            id: action.plan.id.startsWith("draft") ? undefined : action.plan.id,
            org_id: orgId,
            year: action.plan.year,
            profile: action.plan.profile,
            drivers: action.plan.drivers,
            swot: action.plan.swot,
            themes: action.plan.themes,
            rituals: action.plan.rituals,
            executive_summary: action.plan.executiveSummary,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["strategicPlan"]);
          });
        return;
      }

      if (action.type === "upsert_area_plan") {
        void client
          .from("area_plans")
          .upsert({
            id: action.plan.id.startsWith("draft") ? undefined : action.plan.id,
            org_id: orgId,
            area_id: action.plan.areaId,
            year: action.plan.year,
            role: action.plan.role,
            linked_strategic_objective_ids: action.plan.linkedStrategicObjectiveIds,
            diagnosis: action.plan.diagnosis,
            main_annual_objective_id: action.plan.mainAnnualObjectiveId,
            learning_focus: action.plan.learningFocus,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateDomains(["areaPlans"]);
          });
        return;
      }

      if (action.type === "upsert_ai_settings") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          provider: action.provider,
          model: action.model,
          apiKey: action.apiKey ?? "",
          inputTokenPriceUsdPerMillion: action.inputTokenPriceUsdPerMillion,
          outputTokenPriceUsdPerMillion: action.outputTokenPriceUsdPerMillion,
          pricingSource: action.pricingSource ?? "",
        }).then(() => invalidateDomains(["aiSettings"]));
        return;
      }

      if (action.type === "upsert_ai_provider_key") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          provider: action.provider,
          apiKey: action.apiKey,
        }).then(() => invalidateDomains(["aiSettings"]));
        return;
      }

      if (action.type === "upsert_ai_function_settings") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          function: action.function,
          provider: action.provider,
          model: action.model,
        }).then(() => invalidateDomains(["aiSettings"]));
        return;
      }

      if (action.type === "upsert_whatsapp_settings") {
        void callEdgeFunction("save-whatsapp-settings", {
          orgId,
          instanceUrl: action.instanceUrl,
          instanceName: action.instanceName,
          connectedNumber: action.connectedNumber,
          apiKey: action.apiKey ?? "",
          webhookSecret: action.webhookSecret ?? "",
          enabled: action.enabled,
          weeklyPulseEnabled: action.weeklyPulseEnabled,
          weeklyPulseWeekday: action.weeklyPulseWeekday,
          weeklyPulseHour: action.weeklyPulseHour,
        }).then(() => invalidateDomains(["whatsapp"]));
        return;
      }

    },
    [invalidateDomains, orgId, userId],
  );
}
