import { FormEvent, useRef, useState } from "react";
import { Building2, FileKey2, Upload } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { restorePortableBackup } from "../features/backups/api";
import { decryptBackupFile } from "../features/backups/backupCrypto";
import { useAppState } from "../state/store";

export function Onboarding() {
  const { dispatch } = useAppState();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const createOrgTokenRef = useRef(crypto.randomUUID());
  const [backupPassword, setBackupPassword] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [restoringBackup, setRestoringBackup] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreateMessage("");
    dispatch({
      type: "create_organization",
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      token: createOrgTokenRef.current,
      onSuccess: () => { createOrgTokenRef.current = crypto.randomUUID(); },
      onError: (message) => setCreateMessage(message),
    });
  }

  async function restoreBackup(file: File) {
    if (backupPassword.length < 10) {
      setBackupMessage("Informe a senha usada para proteger o pacote.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setBackupMessage("O pacote ultrapassa o limite de 30 MB para importação pelo navegador.");
      return;
    }
    setRestoringBackup(true);
    setBackupMessage("");
    try {
      const decrypted = await decryptBackupFile(await file.text(), backupPassword);
      const result = await restorePortableBackup(null, JSON.parse(decrypted) as unknown);
      window.localStorage.setItem("oraculo.activeOrgId", result.targetOrgId);
      window.location.reload();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível restaurar o pacote.");
    } finally {
      setRestoringBackup(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
      <Card className="w-full max-w-lg">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
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
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">Subtítulo</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Ex: Aize"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
            />
          </label>
          <Button type="submit" icon={Building2} className="w-full">
            Criar empresa
          </Button>
          {createMessage ? (
            <p role="alert" className="mt-3 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
              {createMessage}
            </p>
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
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
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
          {backupMessage ? (
            <p role="alert" className="mt-3 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
              {backupMessage}
            </p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
