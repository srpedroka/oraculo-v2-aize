import { ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../state/store";
import { DATA_NOTICE_DISMISS_KEY, DATA_NOTICE_VERSION } from "./data-notice";
import { useDataNoticeAcknowledgement } from "./use-data-notice";

export function DataNoticeBanner() {
  const { state } = useAppState();
  const orgId = state.activeOrgId;
  const isOwner = state.currentMembership?.role === "owner";
  const storageKey = orgId ? DATA_NOTICE_DISMISS_KEY(orgId) : "";
  const [dismissed, setDismissed] = useState(() => Boolean(storageKey && window.localStorage.getItem(storageKey)));
  const acknowledgement = useDataNoticeAcknowledgement(orgId, isOwner);

  useEffect(() => {
    setDismissed(Boolean(storageKey && window.localStorage.getItem(storageKey)));
  }, [storageKey]);

  if (!orgId || !isOwner || dismissed || acknowledgement.isLoading || acknowledgement.isError || acknowledgement.data) return null;

  return (
    <div className="border-b border-border bg-surface-muted px-4 py-3 sm:px-6 lg:px-8" role="status">
      <div className="mx-auto flex w-full max-w-7xl items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-5 text-text-secondary">
          Novo aviso de dados, versão {DATA_NOTICE_VERSION}. Ele explica IA, WhatsApp, arquivos e backups sem mudar o uso do Oráculo.{" "}
          <Link className="font-semibold text-text underline decoration-border underline-offset-4 hover:decoration-text" to="/configuracoes#privacidade">
            Revisar e registrar ciência
          </Link>
        </p>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-text-tertiary hover:bg-fill-hover hover:text-text"
          aria-label="Dispensar este aviso"
          title="Dispensar"
          onClick={() => {
            window.localStorage.setItem(storageKey, "1");
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
