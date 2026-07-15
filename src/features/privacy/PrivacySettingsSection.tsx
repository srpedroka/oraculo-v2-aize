import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useAppState } from "../../state/store";
import { acknowledgeDataNotice } from "./api";
import {
  DATA_NOTICE_PUBLISHED_AT,
  DATA_NOTICE_VERSION,
  PROVIDER_LABELS,
} from "./data-notice";
import { dataNoticeQueryKey, useDataNoticeAcknowledgement } from "./use-data-notice";

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export function PrivacySettingsSection({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { state } = useAppState();
  const queryClient = useQueryClient();
  const acknowledgement = useDataNoticeAcknowledgement(orgId);
  const mutation = useMutation({
    mutationFn: () => acknowledgeDataNotice(orgId),
    onSuccess: (data) => queryClient.setQueryData(dataNoticeQueryKey(orgId), data),
  });
  const selectedProviders = Array.from(new Set([
    ...state.aiFunctionSettings.map((setting) => setting.provider),
    ...(state.aiSettings?.provider ? [state.aiSettings.provider] : []),
  ])).map((provider) => PROVIDER_LABELS[provider] ?? provider);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-text">Privacidade e uso de dados</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Versão {DATA_NOTICE_VERSION}, publicada em {DATA_NOTICE_PUBLISHED_AT}.
            </p>
          </div>
        </div>
        {acknowledgement.data ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ciência registrada
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs text-text-tertiary">IA selecionada</p>
          <p className="mt-1 text-sm font-semibold text-text">{selectedProviders.length ? selectedProviders.join(", ") : "Ainda não configurada"}</p>
        </div>
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs text-text-tertiary">WhatsApp</p>
          <p className="mt-1 text-sm font-semibold text-text">{state.whatsappSettings?.enabled ? "Ativo nesta empresa" : "Desativado"}</p>
        </div>
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs text-text-tertiary">Contato operacional</p>
          <p className="mt-1 text-sm font-semibold text-text">Owner da organização</p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-text-secondary">
        O aviso detalha quais dados ficam no Supabase, quando conteúdos podem seguir ao provedor de IA escolhido, como WhatsApp e áudio são tratados e como funcionam backups, correção, exportação e exclusão.
      </p>

      {acknowledgement.isError ? (
        <p className="mt-4 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          Não foi possível consultar a ciência desta versão.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-4 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : "Não foi possível registrar a ciência."}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Link to="/privacidade" className="inline-flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
          Ler o aviso completo <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {isOwner && !acknowledgement.data ? (
          <Button
            icon={ShieldCheck}
            loading={mutation.isPending}
            disabled={acknowledgement.isLoading || acknowledgement.isError}
            onClick={() => void mutation.mutateAsync()}
          >
            Registrar ciência da versão {DATA_NOTICE_VERSION}
          </Button>
        ) : !isOwner ? (
          <p className="text-xs text-text-tertiary">A ciência da empresa é registrada uma vez pelo owner.</p>
        ) : acknowledgement.data ? (
          <p className="text-xs text-text-tertiary">Registrada em {dateTime(acknowledgement.data.acceptedAt)}.</p>
        ) : null}
      </div>
    </Card>
  );
}
