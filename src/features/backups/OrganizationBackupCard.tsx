import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  FileKey2,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  createBackupNow,
  deleteStoredBackup,
  discardRecoveryDrill,
  downloadBackupEnvelope,
  loadBackupState,
  restorePortableBackup,
  restoreStoredBackup,
  runRecoveryDrill,
  updateBackupPolicy,
} from "./api";
import { decryptBackupFile, encryptBackupFile } from "./backupCrypto";
import type { OrganizationBackupRecord, RestoreOrganizationResult } from "./types";

interface OrganizationBackupCardProps {
  orgId: string;
}

const KIND_LABELS: Record<OrganizationBackupRecord["kind"], string> = {
  manual: "Manual",
  event: "Marco importante",
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não realizado";
}

function formatBytes(value: number | null) {
  if (!value) return "0 KB";
  if (value < 1_048_576) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

function formatDuration(value: number | null | undefined) {
  if (value == null) return "Ainda não medido";
  if (value < 60_000) return `${(value / 1000).toFixed(1).replace(".", ",")}s`;
  return `${Math.round(value / 60_000)} min`;
}

function statusLabel(backup: OrganizationBackupRecord) {
  if (backup.status === "pending") return "Gerando";
  if (backup.status === "failed") return "Falhou";
  return "Verificado";
}

function statusClass(status: OrganizationBackupRecord["status"]) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function portableFileName(backup: OrganizationBackupRecord) {
  const sourceName = backup.manifest.sourceOrganization?.name ?? "empresa";
  const slug = sourceName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `oraculo-${slug || "empresa"}-${backup.created_at.slice(0, 10)}.oraculo-backup`;
}

export function OrganizationBackupCard({ orgId }: OrganizationBackupCardProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error" | "info">("info");
  const [portablePassword, setPortablePassword] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreOrganizationResult | null>(null);
  const [lastActionWasDrill, setLastActionWasDrill] = useState(false);
  const [policyDraft, setPolicyDraft] = useState({
    automaticEnabled: true,
    eventSnapshotsEnabled: true,
    eventRetentionDays: 7,
    dailyRetentionDays: 30,
    weeklyRetentionDays: 84,
    monthlyRetentionDays: 730,
  });

  const backupQuery = useQuery({
    queryKey: ["organization-backups", orgId],
    queryFn: () => loadBackupState(orgId),
    refetchInterval: (query) =>
      query.state.data?.backups.some((backup) => backup.status === "pending") ? 5_000 : false,
  });

  useEffect(() => {
    const policy = backupQuery.data?.policy;
    if (!policy) return;
    setPolicyDraft({
      automaticEnabled: policy.automatic_enabled,
      eventSnapshotsEnabled: policy.event_snapshots_enabled,
      eventRetentionDays: policy.event_retention_days,
      dailyRetentionDays: policy.daily_retention_days,
      weeklyRetentionDays: policy.weekly_retention_days,
      monthlyRetentionDays: policy.monthly_retention_days,
    });
  }, [backupQuery.data?.policy]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["organization-backups", orgId] });
  const invalidateOrganizationAccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };
  const createMutation = useMutation({
    mutationFn: () => createBackupNow(orgId),
    onSuccess: async () => {
      setMessageTone("ok");
      setMessage("Backup verificado e armazenado.");
      await invalidate();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o backup.");
    },
  });
  const policyMutation = useMutation({
    mutationFn: () => updateBackupPolicy(orgId, policyDraft),
    onSuccess: async () => {
      setMessageTone("ok");
      setMessage("Política de backup atualizada.");
      await invalidate();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a política.");
    },
  });
  const restoreMutation = useMutation({
    mutationFn: ({ backupId, envelope }: { backupId?: string; envelope?: unknown }) =>
      backupId ? restoreStoredBackup(orgId, backupId) : restorePortableBackup(orgId, envelope),
    onSuccess: async (result) => {
      setRestoreResult(result);
      setLastActionWasDrill(false);
      setMessageTone("ok");
      setMessage(`Empresa restaurada como ${result.targetOrgName}.`);
      await invalidate();
      await invalidateOrganizationAccess();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A restauração falhou.");
    },
  });
  const drillMutation = useMutation({
    mutationFn: (exerciseType: "monthly_drill" | "disaster_drill") => runRecoveryDrill(orgId, exerciseType),
    onSuccess: async (result) => {
      setRestoreResult(result);
      setLastActionWasDrill(true);
      setMessageTone("ok");
      setMessage(`Teste concluído em ${(result.durationMs / 1000).toFixed(1).replace(".", ",")}s.`);
      await invalidate();
      await invalidateOrganizationAccess();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "O teste de recuperação falhou.");
    },
  });
  const discardDrillMutation = useMutation({
    mutationFn: (restoreRunId: string) => discardRecoveryDrill(orgId, restoreRunId),
    onSuccess: async () => {
      setRestoreResult(null);
      setLastActionWasDrill(false);
      setMessageTone("ok");
      setMessage("Cópia de teste removida.");
      await invalidate();
      await invalidateOrganizationAccess();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a cópia de teste.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (backupId: string) => deleteStoredBackup(orgId, backupId),
    onSuccess: async () => {
      setMessageTone("ok");
      setMessage("Backup removido.");
      await invalidate();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível remover o backup.");
    },
  });

  const backups = backupQuery.data?.backups ?? [];
  const lastSuccess = useMemo(
    () => backups.find((backup) => backup.status === "completed"),
    [backups],
  );
  const latestRestore = backupQuery.data?.restoreRuns[0];
  const recovery = backupQuery.data?.recovery;
  const openDrill = backupQuery.data?.restoreRuns.find(
    (run) => run.status === "completed" && run.exercise_type !== "restore" && !run.drill_cleaned_at && run.target_org_id,
  );
  const disasterDrillDue = !recovery?.lastDisasterDrillAt ||
    Date.now() - new Date(recovery.lastDisasterDrillAt).getTime() > 100 * 86_400_000;
  const nextDrillType: "monthly_drill" | "disaster_drill" = disasterDrillDue && backupQuery.data?.externalConfigured
    ? "disaster_drill"
    : "monthly_drill";
  const recoveryStatus = recovery?.status === "protected"
    ? { label: "Protegido", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
    : recovery?.status === "protecting"
      ? { label: "Protegendo", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : { label: "Atenção", className: "border-red-200 bg-red-50 text-red-700" };
  const backupIsStale = Boolean(
    policyDraft.automaticEnabled &&
      (!lastSuccess?.completed_at || Date.now() - new Date(lastSuccess.completed_at).getTime() > 26 * 60 * 60 * 1000),
  );

  async function downloadPortable(backup: OrganizationBackupRecord) {
    if (portablePassword.length < 10) {
      setMessageTone("error");
      setMessage("Use uma senha de arquivo com pelo menos 10 caracteres.");
      return;
    }
    setDownloadingId(backup.id);
    setMessage("");
    try {
      const plainText = await downloadBackupEnvelope(orgId, backup.id);
      const encrypted = await encryptBackupFile(plainText, portablePassword);
      const url = URL.createObjectURL(new Blob([encrypted], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = portableFileName(backup);
      anchor.click();
      URL.revokeObjectURL(url);
      setMessageTone("ok");
      setMessage("Pacote criptografado gerado.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o pacote.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function importPortable(file: File) {
    if (portablePassword.length < 10) {
      setMessageTone("error");
      setMessage("Informe a senha usada para proteger o arquivo.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessageTone("error");
      setMessage("O arquivo ultrapassa o limite de 30 MB para importação pelo navegador.");
      return;
    }
    try {
      const decrypted = await decryptBackupFile(await file.text(), portablePassword);
      const envelope = JSON.parse(decrypted) as unknown;
      if (!window.confirm("Criar uma nova empresa a partir deste pacote? A empresa atual não será alterada.")) return;
      restoreMutation.mutate({ envelope });
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function restoreBackup(backup: OrganizationBackupRecord) {
    if (!window.confirm("Restaurar este backup como uma nova empresa? A empresa atual não será alterada.")) return;
    restoreMutation.mutate({ backupId: backup.id });
  }

  function deleteBackup(backup: OrganizationBackupRecord) {
    if (!window.confirm("Remover definitivamente este backup armazenado?")) return;
    deleteMutation.mutate(backup.id);
  }

  function startRecoveryDrill() {
    const source = nextDrillType === "disaster_drill" ? "a cópia externa" : "o backup interno";
    if (!window.confirm(`Testar a recuperação usando ${source}? Uma empresa temporária será criada sem alterar a atual.`)) return;
    drillMutation.mutate(nextDrillType);
  }

  function discardDrill() {
    const restoreRunId = lastActionWasDrill ? restoreResult?.restoreRunId : openDrill?.id;
    if (!restoreRunId) return;
    if (!window.confirm("Concluir o teste e remover somente a empresa temporária?")) return;
    discardDrillMutation.mutate(restoreRunId);
  }

  function openRestoredOrganization(targetOrgId = restoreResult?.targetOrgId) {
    if (!targetOrgId) return;
    window.localStorage.setItem("oraculo.activeOrgId", targetOrgId);
    window.location.assign("/");
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <HardDriveDownload className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h2 className="text-base font-semibold text-text">Segurança e backups</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">Pacote completo e recuperável da empresa ativa.</p>
          </div>
        </div>
        <Button
          icon={RefreshCw}
          loading={createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Criar backup agora
        </Button>
      </div>

      {backupQuery.isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-text-secondary">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando backups...
        </div>
      ) : backupQuery.isError ? (
        <p className="mt-5 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {backupQuery.error instanceof Error ? backupQuery.error.message : "Não foi possível carregar os backups."}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border-l-2 border-emerald-500 pl-3">
              <p className="text-xs font-medium text-text-tertiary">Último backup válido</p>
              <p className="mt-1 text-sm font-semibold text-text">{dateTime(lastSuccess?.completed_at)}</p>
            </div>
            <div className="border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Automação</p>
              <p className="mt-1 text-sm font-semibold text-text">
                {policyDraft.automaticEnabled ? "Diária, após 03:00" : "Pausada"}
              </p>
            </div>
            <div className="border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Cópia externa automática</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text">
                {backupQuery.data?.externalConfigured ? (
                  <><Cloud className="h-4 w-4 text-emerald-600" /> Configurada</>
                ) : (
                  <><CloudOff className="h-4 w-4 text-amber-600" /> Pendente</>
                )}
              </p>
            </div>
          </div>

          {backupIsStale ? (
            <div className="mt-4 flex items-start gap-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Nenhum backup válido foi concluído nas últimas 26 horas.</span>
            </div>
          ) : null}

          {recovery ? (
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text">Recuperação de desastre</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${recoveryStatus.className}`}>{recoveryStatus.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">Última restauração: {dateTime(recovery.lastRestoreAt)}</p>
                  </div>
                </div>
                <Button icon={ShieldCheck} loading={drillMutation.isPending} onClick={startRecoveryDrill}>
                  Testar recuperação
                </Button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border-l-2 border-border pl-3">
                  <p className="text-xs text-text-tertiary">RPO</p>
                  <p className="mt-1 text-sm font-semibold text-text">Até {recovery.rpoTargetMinutes} min</p>
                </div>
                <div className="border-l-2 border-border pl-3">
                  <p className="text-xs text-text-tertiary">RTO</p>
                  <p className="mt-1 text-sm font-semibold text-text">Até {recovery.rtoTargetMinutes / 60}h</p>
                </div>
                <div className="border-l-2 border-border pl-3">
                  <p className="text-xs text-text-tertiary">Cópia externa testada</p>
                  <p className="mt-1 text-sm font-semibold text-text">{dateTime(recovery.lastDisasterDrillAt)}</p>
                </div>
                <div className="border-l-2 border-border pl-3">
                  <p className="text-xs text-text-tertiary">Tempo do pacote</p>
                  <p className="mt-1 text-sm font-semibold text-text">{formatDuration(recovery.lastRestoreDurationMs)}</p>
                </div>
              </div>
              {recovery.pendingSince ? (
                <p className="mt-3 text-xs text-amber-700">Alteração aguardando snapshot desde {dateTime(recovery.pendingSince)}.</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-5">
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_auto] lg:items-end">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={policyDraft.automaticEnabled}
                    onChange={(event) => setPolicyDraft((current) => ({ ...current, automaticEnabled: event.target.checked }))}
                    className="h-4 w-4"
                  />
                  Backup diário
                </label>
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={policyDraft.eventSnapshotsEnabled}
                    onChange={(event) => setPolicyDraft((current) => ({ ...current, eventSnapshotsEnabled: event.target.checked }))}
                    className="h-4 w-4"
                  />
                  Snapshot após marcos importantes
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Marcos", "eventRetentionDays", 1, 30],
                  ["Diários", "dailyRetentionDays", 7, 90],
                  ["Semanais", "weeklyRetentionDays", 28, 366],
                  ["Mensais", "monthlyRetentionDays", 180, 1095],
                ].map(([label, field, min, max]) => (
                  <label key={String(field)} className="block">
                    <span className="mb-1 block text-xs font-medium text-text-tertiary">{label} (dias)</span>
                    <input
                      type="number"
                      min={Number(min)}
                      max={Number(max)}
                      value={policyDraft[field as keyof typeof policyDraft] as number}
                      onChange={(event) => setPolicyDraft((current) => ({ ...current, [field]: Number(event.target.value) }))}
                      className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm"
                    />
                  </label>
                ))}
              </div>
              <Button
                variant="ghost"
                icon={Save}
                loading={policyMutation.isPending}
                onClick={() => policyMutation.mutate()}
              >
                Salvar política
              </Button>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="min-w-[240px] flex-1 sm:max-w-md">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-text">
                  <FileKey2 className="h-4 w-4 text-text-secondary" /> Senha do arquivo portátil
                </span>
                <input
                  type="password"
                  value={portablePassword}
                  autoComplete="new-password"
                  onChange={(event) => setPortablePassword(event.target.value)}
                  placeholder="Mínimo de 10 caracteres"
                  className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm"
                />
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".oraculo-backup,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importPortable(file);
                }}
              />
              <Button
                variant="ghost"
                icon={Upload}
                loading={restoreMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                Importar pacote
              </Button>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text">Histórico</h3>
              <span className="text-xs text-text-tertiary">{backups.length} registros</span>
            </div>
            {backups.length ? (
              <div className="mt-2 divide-y divide-border">
                {backups.slice(0, 12).map((backup) => (
                  <div key={backup.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">{KIND_LABELS[backup.kind]}</p>
                        <span className={["rounded-full border px-2 py-0.5 text-xs font-medium", statusClass(backup.status)].join(" ")}>
                          {statusLabel(backup)}
                        </span>
                        {backup.external_status === "completed" ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-700"><Cloud className="h-3.5 w-3.5" /> externo</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {dateTime(backup.created_at)} · {backup.record_count.toLocaleString("pt-BR")} registros · {formatBytes(backup.size_bytes)}
                      </p>
                      {backup.error_message || backup.external_error_message ? (
                        <p className="mt-1 truncate text-xs text-red-700">{backup.error_message ?? backup.external_error_message}</p>
                      ) : null}
                    </div>
                    {backup.status === "completed" ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="quiet"
                          icon={Download}
                          loading={downloadingId === backup.id}
                          aria-label="Baixar pacote criptografado"
                          title="Baixar pacote criptografado"
                          onClick={() => void downloadPortable(backup)}
                        />
                        <Button
                          size="icon"
                          variant="quiet"
                          icon={RotateCcw}
                          loading={restoreMutation.isPending}
                          aria-label="Restaurar como nova empresa"
                          title="Restaurar como nova empresa"
                          onClick={() => restoreBackup(backup)}
                        />
                        <Button
                          size="icon"
                          variant="quiet"
                          icon={Trash2}
                          loading={deleteMutation.isPending}
                          aria-label="Remover backup"
                          title="Remover backup"
                          onClick={() => deleteBackup(backup)}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">Nenhum backup criado.</p>
            )}
          </div>
        </>
      )}

      {message ? (
        <div role={messageTone === "error" ? "alert" : "status"} aria-live="polite" className={[
          "mt-5 flex items-start gap-2 rounded-control border px-3 py-2 text-sm leading-6",
          messageTone === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : messageTone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-border bg-surface-muted text-text-secondary",
        ].join(" ")}>
          {messageTone === "ok" ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-1 h-4 w-4 shrink-0" />}
          <span>{message}</span>
        </div>
      ) : null}

      {restoreResult ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold text-text">{restoreResult.targetOrgName}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {Object.values(restoreResult.recordCounts).reduce((total, count) => total + count, 0).toLocaleString("pt-BR")} registros restaurados
              {restoreResult.warnings.length ? ` · ${restoreResult.warnings.length} avisos` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={RotateCcw} onClick={() => openRestoredOrganization()}>Abrir empresa restaurada</Button>
            {lastActionWasDrill ? (
              <Button variant="ghost" icon={Trash2} loading={discardDrillMutation.isPending} onClick={discardDrill}>Concluir teste</Button>
            ) : null}
          </div>
        </div>
      ) : openDrill ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold text-text">Cópia de teste aguardando conferência</p>
            <p className="mt-1 text-xs text-text-secondary">{openDrill.target_org_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={RotateCcw} onClick={() => openRestoredOrganization(openDrill.target_org_id ?? undefined)}>Abrir cópia</Button>
            <Button variant="ghost" icon={Trash2} loading={discardDrillMutation.isPending} onClick={discardDrill}>Concluir teste</Button>
          </div>
        </div>
      ) : latestRestore?.status === "failed" ? (
        <p className="mt-4 text-xs text-red-700">Última restauração: {latestRestore.error_message}</p>
      ) : null}
    </Card>
  );
}
