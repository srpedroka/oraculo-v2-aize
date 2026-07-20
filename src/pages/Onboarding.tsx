import { FormEvent, useRef, useState } from "react";
import { Building2, FileKey2, Settings, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { fieldControlClassName } from "../components/ui/Field";
import { InlineFeedback, type InlineFeedbackTone } from "../components/ui/InlineFeedback";
import { restorePortableBackup } from "../features/backups/api";
import { decryptBackupFile } from "../features/backups/backupCrypto";
import { recoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";

type OnboardingFeedback = {
  tone: InlineFeedbackTone;
  title: string;
  description?: string;
  occurrenceId?: string;
};

export function Onboarding() {
  const { dispatch } = useAppState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [createFeedback, setCreateFeedback] = useState<OnboardingFeedback | null>(null);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const createOrgTokenRef = useRef(crypto.randomUUID());
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFeedback, setBackupFeedback] = useState<OnboardingFeedback | null>(null);
  const [backupRetryFile, setBackupRetryFile] = useState<File | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  function createOrganization() {
    if (!name.trim() || creatingOrganization) return;
    setCreatingOrganization(true);
    setCreateFeedback(null);
    dispatch({
      type: "create_organization",
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      token: createOrgTokenRef.current,
      onSuccess: () => {
        createOrgTokenRef.current = crypto.randomUUID();
        setCreatingOrganization(false);
      },
      onError: (message) => {
        const feedback = recoverableFeedback(
          message,
          "Não consegui criar a empresa agora.",
          "Nome e subtítulo continuam preenchidos. Tente novamente.",
          "ORGANIZATION_CREATE_FAILED",
        );
        setCreatingOrganization(false);
        setCreateFeedback({ ...feedback, title: "Não consegui criar a empresa agora.", tone: "error" });
      },
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOrganization();
  }

  async function restoreBackup(file: File) {
    if (restoringBackup) return;
    setBackupRetryFile(file);
    if (backupPassword.length < 10) {
      setBackupFeedback({ tone: "warning", title: "Informe a senha usada para proteger o pacote." });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setBackupRetryFile(null);
      setBackupFeedback({ tone: "warning", title: "O pacote ultrapassa o limite de 30 MB para importação pelo navegador." });
      return;
    }
    setRestoringBackup(true);
    setBackupFeedback(null);
    try {
      const decrypted = await decryptBackupFile(await file.text(), backupPassword);
      const result = await restorePortableBackup(null, JSON.parse(decrypted) as unknown);
      window.localStorage.setItem("oraculo.activeOrgId", result.targetOrgId);
      window.location.reload();
    } catch (error) {
      const feedback = recoverableFeedback(
        error,
        "Não consegui restaurar o pacote.",
        "O arquivo e a senha continuam disponíveis nesta tela. Confira a senha e tente novamente.",
        "PORTABLE_BACKUP_RESTORE_FAILED",
      );
      setBackupFeedback({ ...feedback, title: "Não consegui restaurar o pacote.", tone: "error" });
    } finally {
      setRestoringBackup(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-lg">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
            <Button variant="quiet" size="sm" icon={Settings} onClick={() => navigate("/minha-conta")}>Minha conta</Button>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-text">Crie a primeira empresa</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            A empresa nasce vazia. Depois você cria áreas, coordenadores e começa pelo Plano Estratégico.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Nome da empresa</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: GAAM"
              className={[fieldControlClassName, "h-11"].join(" ")}
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Subtítulo</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Ex: Aize"
              className={[fieldControlClassName, "h-11"].join(" ")}
            />
          </label>
          <Button type="submit" icon={Building2} loading={creatingOrganization} className="w-full">
            Criar empresa
          </Button>
          {createFeedback ? (
            <InlineFeedback
              tone={createFeedback.tone}
              title={createFeedback.title}
              description={createFeedback.description}
              occurrenceId={createFeedback.occurrenceId}
              actionLabel="Tentar novamente"
              onAction={createOrganization}
              actionLoading={creatingOrganization}
            />
          ) : null}
        </form>

        <div className="mt-7 border-t border-border pt-6">
          <div className="mb-4 flex items-start gap-3">
            <FileKey2 className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
            <div>
              <h2 className="text-sm font-semibold text-text">Restaurar empresa</h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">Use um pacote portátil criado anteriormente.</p>
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Senha do pacote</span>
            <input
              type="password"
              value={backupPassword}
              autoComplete="new-password"
              onChange={(event) => setBackupPassword(event.target.value)}
              placeholder="Mínimo de 10 caracteres"
              className={[fieldControlClassName, "h-11"].join(" ")}
            />
          </label>
          <input
            ref={backupInputRef}
            type="file"
            accept=".oraculo-backup,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restoreBackup(file);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            icon={Upload}
            loading={restoringBackup}
            className="mt-3 w-full"
            onClick={() => backupInputRef.current?.click()}
          >
            Importar pacote de backup
          </Button>
          {backupFeedback ? (
            <InlineFeedback
              className="mt-3"
              tone={backupFeedback.tone}
              title={backupFeedback.title}
              description={backupFeedback.description}
              occurrenceId={backupFeedback.occurrenceId}
              actionLabel={backupRetryFile ? "Tentar novamente" : undefined}
              onAction={backupRetryFile ? () => void restoreBackup(backupRetryFile) : undefined}
              actionLoading={restoringBackup}
            />
          ) : null}
        </div>
      </Card>
    </main>
  );
}
