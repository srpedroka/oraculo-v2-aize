import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useAppState } from "../../state/store";
import { callEdgeFunction, requireClient } from "../../state/store-client";

interface PersonalExportResponse {
  ok: true;
  data: Record<string, unknown> & { exportedAt: string };
}

function normalizePhone(value: string) {
  const startsWithPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${startsWithPlus ? "+" : ""}${digits}`;
}

function errorMessage(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "23505" || candidate.message?.includes("profiles_phone_unique_idx")) {
    return "Este celular já está cadastrado em outra conta.";
  }
  if (candidate.code === "23514" || candidate.message?.includes("profiles_phone_international_format")) {
    return "Use o formato internacional, por exemplo +5546999990000.";
  }
  return candidate.message || "Não foi possível concluir agora.";
}

export function PersonalAccountCard() {
  const { state, session, signOut, updateProfile } = useAppState();
  const profile = state.currentProfile;
  const currentEmail = session?.user.email ?? profile?.email ?? "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setName(profile?.fullName ?? currentEmail);
    setEmail(currentEmail);
    setPhone(profile?.phone ?? "");
  }, [currentEmail, profile?.fullName, profile?.phone]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Informe um email válido.");
      return;
    }
    if (normalizedPhone && !/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) {
      setError("Use o celular no formato internacional, por exemplo +5546999990000.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateProfile({ fullName: name.trim(), phone: normalizedPhone || null });
      if (normalizedEmail !== currentEmail.toLowerCase()) {
        const { error: emailError } = await requireClient().auth.updateUser({ email: normalizedEmail });
        if (emailError) throw emailError;
        setMessage("Perfil salvo. Confirme o novo email quando receber a mensagem de segurança.");
      } else {
        setMessage("Perfil salvo.");
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const result = await callEdgeFunction("personal-account", { action: "export" }) as PersonalExportResponse;
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oraculo-dados-pessoais-${result.data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Pacote pessoal gerado e baixado.");
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await callEdgeFunction("personal-account", {
        action: "delete",
        confirmEmail: confirmEmail.trim(),
        finalConfirmation: true,
      });
      await signOut();
      window.location.assign("/");
    } catch (deleteFailure) {
      setDeleteError(errorMessage(deleteFailure));
      setDeleting(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-fill-active text-text">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text">Minha conta</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Seus dados pessoais e o acesso ao Oráculo. Os registros das empresas têm ciclo próprio.
            </p>
          </div>
        </div>

        <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">Nome</span>
            <input value={name} onChange={(event) => setName(event.target.value)} disabled={saving}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">Celular</span>
            <input value={phone} onChange={(event) => setPhone(normalizePhone(event.target.value))} disabled={saving}
              placeholder="+5546999990000"
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">Email de acesso</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving}
              className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
            <span className="mt-1 block text-xs leading-5 text-text-tertiary">Ao trocar, o novo endereço pode precisar de confirmação.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" size="sm" icon={Save} loading={saving}>Salvar perfil</Button>
            {message ? <p className="flex items-center gap-1.5 text-xs font-medium text-status-success"><Check className="h-3.5 w-3.5" />{message}</p> : null}
            {error ? <p role="alert" className="text-xs leading-5 text-status-danger">{error}</p> : null}
          </div>
        </form>

        <div className="mt-6 grid gap-3 border-t border-border pt-5 md:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Exportar meus dados</p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">Perfil, vínculos, conversas próprias e registros de sua autoria acessíveis.</p>
            </div>
            <Button variant="ghost" size="sm" icon={Download} loading={exporting} onClick={() => void exportData()}>Baixar</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-status-danger/40 bg-status-danger-bg px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-status-danger">Excluir minha conta</p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">Remove login, perfil, celular e acessos. O histórico empresarial é anonimizado.</p>
            </div>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>Excluir</Button>
          </div>
        </div>
      </Card>

      {deleteOpen ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-auto p-0">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <p className="text-xs font-medium text-text-tertiary">Exclusão da conta</p>
                <h2 id="delete-account-title" className="mt-1 text-lg font-semibold text-text">Excluir sua conta do Oráculo?</h2>
              </div>
              <Button variant="quiet" size="icon" icon={X} disabled={deleting} aria-label="Fechar" onClick={() => setDeleteOpen(false)} />
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm leading-6 text-text-secondary">
                O login, o perfil, o celular e todos os vínculos serão removidos. Planos, documentos e conversas permanecem nas empresas sem identificar sua conta.
              </p>
              <div className="rounded-control border border-status-danger/40 bg-status-danger-bg px-4 py-3 text-sm leading-6 text-text-secondary">
                Se você for o último owner de alguma empresa, a exclusão será bloqueada. Primeiro promova outro owner ou encerre essa empresa.
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">Digite seu email atual para confirmar</span>
                <input type="email" value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} disabled={deleting}
                  autoComplete="off" placeholder={currentEmail}
                  className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-text" />
              </label>
              {deleteError ? <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{deleteError}</p> : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancelar</Button>
              <Button variant="danger" icon={Trash2} loading={deleting}
                disabled={confirmEmail.trim().toLowerCase() !== currentEmail.toLowerCase()}
                onClick={() => void deleteAccount()}>Excluir minha conta</Button>
            </div>
          </Card>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
