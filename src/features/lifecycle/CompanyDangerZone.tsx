import { useState } from "react";
import { AlertTriangle, Archive, DoorOpen, RotateCcw, Trash2, X } from "lucide-react";
import { useAppState } from "../../state/store";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

type DialogKind = "leave" | "archive" | "delete" | null;

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ModalShell({
  title,
  eyebrow,
  busy,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <Card className="max-h-[92vh] w-full max-w-lg overflow-auto p-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">{eyebrow}</p>
            <h2 className="mt-1 text-lg font-semibold text-text">{title}</h2>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={onClose} disabled={busy} aria-label="Fechar" />
        </div>
        <div className="space-y-4 px-6 py-5">{children}</div>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-surface px-6 py-4">{footer}</div>
      </Card>
    </div>
  );
}

export function CompanyDangerZone() {
  const { state, dispatch } = useAppState();
  const org = state.organization;
  const isOwner = state.currentMembership?.role === "owner";
  const isArchived = Boolean(org?.archivedAt);
  const ownerCount = state.memberships.filter((membership) => membership.role === "owner").length;
  const soleOwner = isOwner && ownerCount <= 1;

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");

  if (!org) return null;

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setError("");
    setReason("");
    setConfirmName("");
  }

  function run(action: Parameters<typeof dispatch>[0]) {
    setBusy(true);
    setError("");
    dispatch(action);
    // The lifecycle actions resolve through their onSuccess/onError callbacks below.
  }

  function leave() {
    run({
      type: "leave_organization",
      reason: reason.trim() || null,
      onSuccess: () => {
        setBusy(false);
        closeDialogForce();
      },
      onError: (message) => {
        setBusy(false);
        setError(message);
      },
    });
  }

  function archive() {
    run({
      type: "archive_organization",
      reason: reason.trim() || null,
      onSuccess: () => {
        setBusy(false);
        closeDialogForce();
      },
      onError: (message) => {
        setBusy(false);
        setError(message);
      },
    });
  }

  function restore() {
    setBusy(true);
    setError("");
    dispatch({
      type: "restore_organization",
      onSuccess: () => setBusy(false),
      onError: (message) => {
        setBusy(false);
        setError(message);
      },
    });
  }

  function remove() {
    run({
      type: "delete_organization",
      confirmName: confirmName.trim(),
      finalConfirmation: true,
      reason: reason.trim() || null,
      onSuccess: () => {
        setBusy(false);
        closeDialogForce();
      },
      onError: (message) => {
        setBusy(false);
        setError(message);
      },
    });
  }

  function closeDialogForce() {
    setDialog(null);
    setError("");
    setReason("");
    setConfirmName("");
  }

  return (
    <Card className="border-status-danger/40">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-status-danger" />
        <h2 className="text-base font-semibold text-text">Zona de perigo</h2>
      </div>

      {isArchived ? (
        <div className="mb-4 rounded-control border border-status-danger/40 bg-status-danger-bg px-4 py-3">
          <p className="text-sm font-semibold text-status-danger">Empresa arquivada</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Arquivada em {formatDate(org.archivedAt)}. Ela saiu da virada mensal e o WhatsApp foi pausado. Restaure para
            voltar a operar, ou exclua definitivamente.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {/* Sair da empresa — disponível para qualquer pessoa que não seja o único dono. */}
        {!soleOwner ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Sair da empresa</p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                Você perde o acesso a esta empresa. Seu perfil, conversas e registros já feitos são preservados.
              </p>
            </div>
            <Button variant="ghost" icon={DoorOpen} onClick={() => setDialog("leave")}>
              Sair
            </Button>
          </div>
        ) : null}

        {isOwner && !isArchived ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Encerrar empresa</p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                Arquiva a empresa (reversível). Ela sai da operação e o WhatsApp é pausado, mas nada é apagado.
              </p>
            </div>
            <Button variant="ghost" icon={Archive} onClick={() => setDialog("archive")}>
              Encerrar
            </Button>
          </div>
        ) : null}

        {isOwner && isArchived ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Restaurar empresa</p>
                <p className="mt-0.5 text-xs leading-5 text-text-secondary">Volta a empresa para a operação normal.</p>
              </div>
              <Button variant="ghost" icon={RotateCcw} loading={busy && dialog === null} onClick={restore}>
                Restaurar
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-status-danger/40 bg-status-danger-bg px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-status-danger">Excluir definitivamente</p>
                <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                  Apaga a empresa e todos os dados para sempre. Exige um backup recente e digitar o nome.
                </p>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setDialog("delete")}>
                Excluir
              </Button>
            </div>
          </>
        ) : null}

        {isOwner && !isArchived && error && dialog === null ? (
          <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p>
        ) : null}
        {isArchived && error && dialog === null ? (
          <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p>
        ) : null}
      </div>

      {dialog === "leave" ? (
        <ModalShell eyebrow="Acesso à empresa" title={`Sair de ${org.name}?`} busy={busy} onClose={closeDialog}
          footer={
            <>
              <Button variant="ghost" onClick={closeDialog} disabled={busy}>Cancelar</Button>
              <Button variant="danger" icon={DoorOpen} loading={busy} onClick={leave}>Sair da empresa</Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-text-secondary">
            Você perde o acesso a esta empresa. Se você coordena áreas, elas ficam sem coordenador até alguém assumir.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-tertiary">Motivo (opcional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          {error ? <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        </ModalShell>
      ) : null}

      {dialog === "archive" ? (
        <ModalShell eyebrow="Encerramento reversível" title={`Encerrar ${org.name}?`} busy={busy} onClose={closeDialog}
          footer={
            <>
              <Button variant="ghost" onClick={closeDialog} disabled={busy}>Cancelar</Button>
              <Button variant="danger" icon={Archive} loading={busy} onClick={archive}>Encerrar empresa</Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-text-secondary">
            A empresa é arquivada e sai da operação ativa: some da virada mensal e o WhatsApp é pausado. Nada é apagado —
            você pode restaurar quando quiser.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-tertiary">Motivo (opcional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          {error ? <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        </ModalShell>
      ) : null}

      {dialog === "delete" ? (
        <ModalShell eyebrow="Exclusão definitiva" title={`Excluir ${org.name} para sempre?`} busy={busy} onClose={closeDialog}
          footer={
            <>
              <Button variant="ghost" onClick={closeDialog} disabled={busy}>Cancelar</Button>
              <Button variant="danger" icon={Trash2} loading={busy} disabled={confirmName.trim() !== org.name}
                onClick={remove}>Excluir definitivamente</Button>
            </>
          }
        >
          <div className="rounded-control border border-status-danger/40 bg-status-danger-bg px-4 py-3">
            <p className="text-sm font-semibold text-status-danger">Esta ação não pode ser desfeita.</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Todos os dados, chaves de IA e credenciais de WhatsApp desta empresa serão apagados. Fica apenas um registro
              de auditoria de quem excluiu.
            </p>
          </div>
          <p className="text-sm leading-6 text-text-secondary">
            Garanta um <strong>backup recente</strong> (cartão de Backups acima) e baixe o pacote portátil cifrado antes de
            continuar — é a única forma de recuperar depois.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-tertiary">
              Digite o nome exato da empresa para confirmar: <strong className="text-text">{org.name}</strong>
            </span>
            <input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} disabled={busy}
              autoComplete="off" placeholder={org.name}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-tertiary">Motivo (opcional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          {error ? <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        </ModalShell>
      ) : null}
    </Card>
  );
}
