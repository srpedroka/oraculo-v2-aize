import { FileText, Loader2, Save, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { HISTORICAL_FILE_ACCEPT, importStrategicPlanFile, isHistoricalImageFile } from "../../lib/fileImport";
import { readKpiImage } from "../../lib/kpiSpreadsheet";
import { useAppState } from "../../state/store";
import type {
  HistoricalConflict,
  HistoricalImportSuggestion,
  HistoricalMetadataSuggestion,
  HistoricalTableCandidate,
  PlanDocumentType,
} from "../../types";

type HistoricalImportDocumentType = HistoricalMetadataSuggestion["documentType"];

const DOCUMENT_TYPE_LABEL: Record<PlanDocumentType, string> = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento Mensal",
  quarter_close: "Fechamento Trimestral",
  strategic_review: "Revisão Estratégica",
  kpi_history: "Histórico de KPIs",
  company_profile: "Perfil da empresa",
};

const HISTORICAL_DOCUMENT_TYPES: HistoricalImportDocumentType[] = ["strategic", "quarterly", "monthly"];

const LOW_CONFIDENCE_LABEL: Record<string, string> = {
  documentType: "tipo",
  area: "área",
  areaId: "área",
  period: "período",
  title: "título",
};

interface HistoricalImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Chamado após salvar com sucesso; `documentId` quando o servidor devolver o id. */
  onSaved?: (documentId?: string, options?: { newVersion?: boolean }) => void;
  /** Reabre importação a partir de `content.import_backup` de um documento existente. */
  initialBackup?: Record<string, unknown> | null;
}

function looksLikeMetadataDump(text: string) {
  const t = text.trim();
  return t.startsWith("{") && /normalizedText|documentType|periodFound/.test(t);
}

function tablePreviewLines(table: HistoricalTableCandidate, max = 5) {
  return table.normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function HistoricalImportDialog({ open, onClose, onSaved, initialBackup = null }: HistoricalImportDialogProps) {
  const { state, dispatch } = useAppState();
  const [historicalType, setHistoricalType] = useState<HistoricalImportDocumentType>("strategic");
  const [historicalPeriod, setHistoricalPeriod] = useState("");
  const [historicalAreaId, setHistoricalAreaId] = useState("company");
  const [historicalTitle, setHistoricalTitle] = useState("");
  const [historicalText, setHistoricalText] = useState("");
  const [historicalFileName, setHistoricalFileName] = useState<string | null>(null);
  const [historicalNote, setHistoricalNote] = useState("");
  const [historicalSuggestion, setHistoricalSuggestion] = useState<HistoricalMetadataSuggestion | null>(null);
  const [importSuggestion, setImportSuggestion] = useState<HistoricalImportSuggestion | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("doc_1");
  const [conflictChoices, setConflictChoices] = useState<Record<string, string>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(["doc_1"]);
  const [historicalFeedback, setHistoricalFeedback] = useState<string | null>(null);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [importingHistorical, setImportingHistorical] = useState(false);
  const [suggestingHistorical, setSuggestingHistorical] = useState(false);
  const [savingHistorical, setSavingHistorical] = useState(false);
  const [isDraggingHistorical, setIsDraggingHistorical] = useState(false);
  const [reopenFromBackup, setReopenFromBackup] = useState(false);

  const isOwner = state.currentMembership?.role === "owner";
  const writableHistoricalAreas = useMemo(() => {
    if (isOwner) return state.areas;
    const membershipId = state.currentMembership?.id;
    return state.areas.filter((area) => area.coordinatorId === membershipId);
  }, [isOwner, state.areas, state.currentMembership?.id]);
  const effectiveHistoricalAreaId =
    !isOwner && historicalAreaId === "company" ? writableHistoricalAreas[0]?.id ?? "" : historicalAreaId;
  const historicalLowConfidenceFields = useMemo(
    () => new Set(historicalSuggestion?.lowConfidenceFields ?? []),
    [historicalSuggestion],
  );
  const historicalBusy = importingHistorical || suggestingHistorical || savingHistorical;
  const requiredConflicts = useMemo(
    () => (importSuggestion?.conflicts ?? []).filter((conflict) => conflict.required),
    [importSuggestion],
  );
  const unresolvedRequiredConflicts = requiredConflicts.filter((conflict) => {
    if (conflict.kind === "table_choice") return !conflictChoices[conflict.id];
    // period/area/value: exige qualquer escolha (mesmo se for "manter")
    return !conflictChoices[conflict.id];
  });
  const canSave =
    Boolean(historicalText.trim()) &&
    Boolean(historicalPeriod.trim()) &&
    unresolvedRequiredConflicts.length === 0 &&
    !historicalBusy;

  useEffect(() => {
    if (!open || !initialBackup) return;
    const backup = initialBackup;
    const extracted = String(backup.extractedText ?? "").trim();
    const candidates = Array.isArray(backup.candidates) ? backup.candidates : [];
    const tables = Array.isArray(backup.tables) ? (backup.tables as HistoricalTableCandidate[]) : [];
    const conflicts = Array.isArray(backup.conflicts) ? (backup.conflicts as HistoricalConflict[]) : [];
    const decisions = Array.isArray(backup.decisions) ? backup.decisions : [];
    const savedId = String(backup.savedCandidateId ?? candidates[0]?.id ?? "doc_1");
    const primary = candidates.find((item: { id?: string }) => item.id === savedId) ?? candidates[0];

    setReopenFromBackup(true);
    setHistoricalFileName(typeof backup.sourceName === "string" ? backup.sourceName : null);
    setHistoricalText(extracted || String(primary?.normalizedText ?? ""));
    setHistoricalTitle(String(primary?.title ?? ""));
    setSelectedCandidateId(savedId);
    setSelectedCandidateIds(candidates.map((item: { id?: string }) => String(item.id ?? "")).filter(Boolean));
    setImportSuggestion({
      sourceName: typeof backup.sourceName === "string" ? backup.sourceName : null,
      extractedText: extracted,
      candidates: candidates as HistoricalImportSuggestion["candidates"],
      tables,
      conflicts,
      warnings: ["Reabertura de importação anterior. Ajuste e salve para criar nova versão."],
    });
    const choices: Record<string, string> = {};
    for (const decision of decisions as Array<{ conflictId?: string; selectedTableId?: string; selectedCandidateId?: string }>) {
      if (!decision.conflictId) continue;
      choices[decision.conflictId] = decision.selectedTableId || decision.selectedCandidateId || "";
    }
    setConflictChoices(choices);
    setHistoricalFeedback("Importação reaberta. Você pode escolher outra leitura e salvar uma nova versão.");
  }, [open, initialBackup]);

  if (!open) return null;

  function resetForm() {
    setHistoricalType("strategic");
    setHistoricalPeriod("");
    setHistoricalAreaId("company");
    setHistoricalTitle("");
    setHistoricalText("");
    setHistoricalFileName(null);
    setHistoricalNote("");
    setHistoricalSuggestion(null);
    setImportSuggestion(null);
    setSelectedCandidateId("doc_1");
    setSelectedCandidateIds(["doc_1"]);
    setConflictChoices({});
    setHistoricalFeedback(null);
    setHistoricalError(null);
    setImportingHistorical(false);
    setSuggestingHistorical(false);
    setSavingHistorical(false);
    setIsDraggingHistorical(false);
    setReopenFromBackup(false);
  }

  function handleClose() {
    if (historicalBusy) return;
    resetForm();
    onClose();
  }

  function updateHistoricalText(value: string) {
    setHistoricalText(value);
    setHistoricalSuggestion(null);
    setHistoricalTitle("");
    setHistoricalFeedback(null);
    setHistoricalError(null);
  }

  function applyHistoricalSuggestion(
    suggestion: HistoricalMetadataSuggestion,
    options?: {
      extractedText?: string;
      tableExpanded?: boolean;
      fromImage?: boolean;
      importSuggestion?: HistoricalImportSuggestion;
      warnings?: string[];
    },
  ) {
    const nextAreaId = suggestion.areaId ?? (isOwner ? "company" : writableHistoricalAreas[0]?.id ?? "company");
    const structured = options?.importSuggestion ?? null;
    const primary = structured?.candidates?.[0];
    const normalized = String(options?.extractedText ?? primary?.normalizedText ?? "").trim();
    if (normalized && !looksLikeMetadataDump(normalized)) {
      setHistoricalText(normalized);
    }
    setHistoricalSuggestion(suggestion);
    setImportSuggestion(structured);
    setSelectedCandidateId(primary?.id ?? "doc_1");
    setSelectedCandidateIds(structured?.candidates?.map((item) => item.id) ?? ["doc_1"]);
    setConflictChoices({});
    setHistoricalType((primary?.documentType ?? suggestion.documentType) as HistoricalImportDocumentType);
    setHistoricalAreaId(primary?.areaId ?? nextAreaId);
    setHistoricalPeriod(primary?.period ?? suggestion.period);
    setHistoricalTitle(primary?.title ?? suggestion.title);

    const parts: string[] = [];
    if (options?.fromImage) parts.push("Imagem lida.");
    if (options?.tableExpanded || (normalized && /\[Tabela expandida por ano/i.test(normalized))) {
      parts.push("Tabela multi-ano expandida (uma linha por mês+ano) para o histórico não misturar anos.");
    }
    if (structured?.conflicts?.some((item) => item.required)) {
      parts.push("Há pontos que precisam da sua escolha antes de salvar.");
    } else if (suggestion.periodFound || primary?.periodFound) {
      parts.push("Sugestão pronta para conferência. Ajuste qualquer campo antes de salvar.");
    } else {
      parts.push("Sugestão pronta, mas não encontrei período claro. Preencha o período antes de salvar.");
    }
    if (options?.warnings?.length) parts.push(...options.warnings);
    setHistoricalFeedback(parts.join(" "));
  }

  async function processHistoricalFile(file: File | undefined) {
    if (!file) return;

    setImportingHistorical(true);
    setHistoricalSuggestion(null);
    setHistoricalTitle("");
    setHistoricalError(null);
    setHistoricalFeedback(null);

    try {
      if (isHistoricalImageFile(file)) {
        if (!isOwner && !writableHistoricalAreas.length) {
          throw new Error("Seu usuário precisa ter uma área coordenada para importar histórico.");
        }
        const imported = await readKpiImage(file);
        setHistoricalFileName(imported.fileName);
        setHistoricalFeedback("Lendo a imagem com o Oráculo...");
        await new Promise<void>((resolve, reject) => {
          dispatch({
            type: "suggest_historical_metadata",
            rawText: "",
            fileName: imported.fileName,
            image: imported.image,
            onSuccess: (result) => {
              const text = String(result.extractedText ?? "").trim();
              if (!text) {
                reject(new Error("Não consegui ler texto nesta imagem. Tente outra foto ou um PDF/DOCX."));
                return;
              }
              applyHistoricalSuggestion(result.suggestion, {
                extractedText: text,
                tableExpanded: result.tableExpanded,
                fromImage: true,
                importSuggestion: result.importSuggestion,
                warnings: result.warnings,
              });
              resolve();
            },
            onError: (message) => reject(new Error(message)),
          });
        });
        return;
      }

      const imported = await importStrategicPlanFile(file);
      setHistoricalText(imported.text);
      setHistoricalFileName(imported.fileName);
      setHistoricalFeedback(imported.warning ?? "Texto importado para conferência. Interprete antes de salvar.");
      setImportSuggestion(null);
      setConflictChoices({});
    } catch (error) {
      setHistoricalFileName(null);
      setHistoricalError(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setImportingHistorical(false);
    }
  }

  async function handleHistoricalFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processHistoricalFile(file);
  }

  function hasDraggedFile(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleHistoricalDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingHistorical(true);
  }

  function handleHistoricalDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingHistorical(false);
  }

  function handleHistoricalDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFile(event)) return;
    event.preventDefault();
    setIsDraggingHistorical(false);
    const file = event.dataTransfer.files?.[0];
    void processHistoricalFile(file);
  }

  function suggestHistoricalMetadata() {
    const rawText = historicalText.trim();

    setHistoricalFeedback(null);
    setHistoricalError(null);

    if (!rawText) {
      setHistoricalError("Cole ou importe o texto do histórico antes de interpretar.");
      return;
    }

    if (!isOwner && !writableHistoricalAreas.length) {
      setHistoricalError("Seu usuário precisa ter uma área coordenada para interpretar histórico.");
      return;
    }

    setSuggestingHistorical(true);
    dispatch({
      type: "suggest_historical_metadata",
      rawText,
      fileName: historicalFileName,
      onSuccess: (result) => {
        setSuggestingHistorical(false);
        applyHistoricalSuggestion(result.suggestion, {
          extractedText: result.extractedText,
          tableExpanded: result.tableExpanded,
          importSuggestion: result.importSuggestion,
          warnings: result.warnings,
        });
      },
      onError: (message) => {
        setSuggestingHistorical(false);
        setHistoricalError(message);
      },
    });
  }

  function buildHistoricalClassification(areaId: string | null, period: string): Record<string, unknown> | null {
    if (!historicalSuggestion) return null;
    const title = historicalTitle.trim();
    return {
      ...historicalSuggestion,
      confirmed: {
        documentType: historicalType,
        areaId,
        period,
        title: title || null,
      },
      overridden: {
        documentType: historicalSuggestion.documentType !== historicalType,
        areaId: (historicalSuggestion.areaId ?? null) !== areaId,
        period: historicalSuggestion.period !== period,
        title: historicalSuggestion.title !== title,
      },
    };
  }

  function resolveRawTextForSave() {
    let rawText = historicalText.trim();
    // Se o usuário escolheu uma tabela em conflito table_choice, usa o texto da tabela escolhida.
    const tableChoice = requiredConflicts.find((conflict) => conflict.kind === "table_choice" && conflictChoices[conflict.id]);
    if (tableChoice && importSuggestion) {
      const tableId = conflictChoices[tableChoice.id];
      const table = importSuggestion.tables.find((item) => item.id === tableId);
      if (table?.normalizedText?.trim()) {
        rawText = table.normalizedText.trim();
      }
    }
    return rawText;
  }

  function buildImportBackupPayload(areaId: string | null, period: string, savedCandidateId: string) {
    const structured = importSuggestion;
    const decisions = Object.entries(conflictChoices).map(([conflictId, choice]) => {
      const conflict = structured?.conflicts.find((item) => item.id === conflictId);
      if (conflict?.kind === "table_choice") {
        return { conflictId, selectedTableId: choice };
      }
      return { conflictId, selectedCandidateId: choice || savedCandidateId };
    });
    return {
      schemaVersion: 1,
      batchId: crypto.randomUUID(),
      sourceName: historicalFileName,
      sourceKind: historicalFileName && /\.(jpe?g|png|webp)$/i.test(historicalFileName) ? "image" : historicalFileName ? "document" : "text",
      extractedText: structured?.extractedText ?? historicalText,
      candidates: structured?.candidates ?? [
        {
          id: savedCandidateId,
          title: historicalTitle.trim() || null,
          normalizedText: historicalText,
          tableIds: [],
        },
      ],
      tables: structured?.tables ?? [],
      conflicts: structured?.conflicts ?? [],
      decisions,
      savedCandidateId,
      confirmed: {
        documentType: historicalType,
        areaId,
        period,
        title: historicalTitle.trim() || null,
      },
    };
  }

  function saveHistoricalDocument() {
    const period = historicalPeriod.trim();
    const areaId = effectiveHistoricalAreaId === "company" ? null : effectiveHistoricalAreaId || null;
    const title = historicalTitle.trim();
    const rawText = resolveRawTextForSave();
    const savedCandidateId = selectedCandidateId || "doc_1";

    setHistoricalFeedback(null);
    setHistoricalError(null);

    if (unresolvedRequiredConflicts.length) {
      setHistoricalError("Resolva as escolhas obrigatórias antes de salvar.");
      return;
    }

    if (!period) {
      setHistoricalError("Informe o ano ou período do histórico.");
      return;
    }

    if (!rawText) {
      setHistoricalError("Cole ou importe o texto do histórico.");
      return;
    }

    if (!isOwner && !areaId) {
      setHistoricalError("Seu usuário precisa ter uma área coordenada para salvar histórico de área.");
      return;
    }

    setSavingHistorical(true);
    dispatch({
      type: "import_historical_document",
      documentType: historicalType,
      areaId,
      period,
      rawText,
      source: historicalFileName ?? "Texto colado",
      note: historicalNote.trim() || null,
      title: title || null,
      summary: historicalSuggestion?.summary ?? importSuggestion?.candidates.find((item) => item.id === savedCandidateId)?.summary ?? null,
      classification: buildHistoricalClassification(areaId, period),
      importBackup: buildImportBackupPayload(areaId, period, savedCandidateId),
      savedCandidateId,
      onSuccess: (result) => {
        setSavingHistorical(false);
        const documentId = result?.document?.id;
        const wasReopen = reopenFromBackup;
        resetForm();
        onSaved?.(documentId, { newVersion: wasReopen });
        onClose();
      },
      onError: (message) => {
        setSavingHistorical(false);
        setHistoricalError(message);
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
      <Card
        className={[
          "flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden p-0",
          isDraggingHistorical ? "border-accent" : "",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="historical-import-title"
        onDragOver={handleHistoricalDragOver}
        onDragLeave={handleHistoricalDragLeave}
        onDrop={handleHistoricalDrop}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-tertiary">Documentos</p>
            <h2 id="historical-import-title" className="mt-1 text-lg font-semibold leading-6 text-text">
              Importar histórico
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Importe planos, relatórios e tabelas antigas. O Oráculo organiza os campos e você confirma antes de salvar.
            </p>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={handleClose} disabled={historicalBusy} aria-label="Fechar" />
        </div>

        <div className={`flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6 ${isDraggingHistorical ? "bg-[#F7FAFF]" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs leading-5 text-text-secondary">
              Aceita PDF, PPTX, DOCX, TXT e imagens JPG/PNG/WEBP. Nada é gravado ao escolher o arquivo — só depois de confirmar.
            </p>
            <label
              className={[
                "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white",
                importingHistorical ? "cursor-wait opacity-70" : "",
              ].join(" ")}
            >
              {importingHistorical ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Upload aria-hidden="true" className="h-4 w-4" />
              )}
              <span>{importingHistorical ? "Importando..." : "Importar arquivo"}</span>
              <input
                className="sr-only"
                type="file"
                accept={HISTORICAL_FILE_ACCEPT}
                disabled={importingHistorical || historicalBusy}
                onChange={(event) => {
                  void handleHistoricalFileImport(event);
                }}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
              Tipo
              <select
                value={historicalType}
                onChange={(event) => setHistoricalType(event.target.value as HistoricalImportDocumentType)}
                className={[
                  "h-10 rounded-xl border bg-white px-3 text-sm text-text",
                  historicalLowConfidenceFields.has("documentType") ? "border-[#D97706]" : "border-border",
                ].join(" ")}
              >
                {HISTORICAL_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
              Escopo
              <select
                value={effectiveHistoricalAreaId || "company"}
                onChange={(event) => setHistoricalAreaId(event.target.value)}
                className={[
                  "h-10 rounded-xl border bg-white px-3 text-sm text-text",
                  historicalLowConfidenceFields.has("area") || historicalLowConfidenceFields.has("areaId")
                    ? "border-[#D97706]"
                    : "border-border",
                ].join(" ")}
                disabled={!isOwner && !writableHistoricalAreas.length}
              >
                {isOwner ? <option value="company">Empresa</option> : null}
                {!isOwner && !writableHistoricalAreas.length ? <option value="company">Sem área disponível</option> : null}
                {writableHistoricalAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
              Ano ou período
              <input
                value={historicalPeriod}
                onChange={(event) => setHistoricalPeriod(event.target.value)}
                className={[
                  "h-10 rounded-xl border bg-white px-3 text-sm text-text",
                  historicalLowConfidenceFields.has("period") ? "border-[#D97706]" : "border-border",
                ].join(" ")}
                placeholder="2024, T3 2024, Jan 2024"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-tertiary">Título</span>
            <input
              value={historicalTitle}
              onChange={(event) => setHistoricalTitle(event.target.value)}
              className={[
                "h-10 w-full rounded-xl border bg-white px-3 text-sm text-text",
                historicalLowConfidenceFields.has("title") ? "border-[#D97706]" : "border-border",
              ].join(" ")}
              placeholder="Ex.: Planejamento comercial"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-tertiary">Nota</span>
            <input
              value={historicalNote}
              onChange={(event) => setHistoricalNote(event.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              placeholder="Ex.: versão aprovada no planejamento anual"
            />
          </label>

          <label className="block">
            <span className="sr-only">Texto do documento</span>
            <textarea
              value={historicalText}
              onChange={(event) => updateHistoricalText(event.target.value)}
              rows={10}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6"
              placeholder="Cole o texto ou importe o arquivo. Tabelas multi-ano serão organizadas por mês e ano ao interpretar."
            />
          </label>

          {historicalFileName ? (
            <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
              <FileText aria-hidden="true" className="h-4 w-4" />
              Texto importado de {historicalFileName}.
            </p>
          ) : null}
          {/\[Tabela expandida por ano/i.test(historicalText) ? (
            <p className="text-xs leading-5 text-text-secondary">
              Prévia já no formato de histórico: cada linha é um mês + um ano.
            </p>
          ) : null}
          {historicalSuggestion ? (
            <div className="rounded-xl border border-border bg-[#FBFBFC] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Sugestão do Oráculo</p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {DOCUMENT_TYPE_LABEL[historicalSuggestion.documentType]}
                    {historicalSuggestion.areaName ? ` · ${historicalSuggestion.areaName}` : " · Empresa"}
                    {historicalSuggestion.period ? ` · ${historicalSuggestion.period}` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {historicalSuggestion.source === "ai_background" ? "Automática" : "Estimada"} ·{" "}
                  {Math.round(historicalSuggestion.confidence * 100)}%
                </span>
              </div>
              {historicalSuggestion.summary ? (
                <p className="mt-3 text-sm leading-6 text-text-secondary">{historicalSuggestion.summary}</p>
              ) : null}
              {historicalSuggestion.lowConfidenceFields.length ? (
                <p className="mt-3 text-xs leading-5 text-[#A16207]">
                  Revise:{" "}
                  {historicalSuggestion.lowConfidenceFields.map((field) => LOW_CONFIDENCE_LABEL[field] ?? field).join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}

          {importSuggestion && importSuggestion.candidates.length > 1 ? (
            <div className="space-y-2 rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-text">Documentos encontrados</p>
              <p className="text-xs text-text-secondary">Escolha qual salvar agora. Depois você pode reabrir e escolher outra leitura.</p>
              <div className="mt-2 space-y-2">
                {importSuggestion.candidates.map((candidate) => {
                  const active = selectedCandidateId === candidate.id;
                  return (
                    <label
                      key={candidate.id}
                      className={[
                        "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                        active ? "border-accent bg-[#F7FAFF]" : "border-border bg-white",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="historical-candidate"
                        className="mt-1"
                        checked={active}
                        onChange={() => {
                          setSelectedCandidateId(candidate.id);
                          setSelectedCandidateIds([candidate.id]);
                          setHistoricalType(candidate.documentType);
                          setHistoricalTitle(candidate.title);
                          setHistoricalPeriod(candidate.period);
                          setHistoricalAreaId(candidate.areaId ?? "company");
                          if (candidate.normalizedText?.trim()) setHistoricalText(candidate.normalizedText);
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">{candidate.title || "Documento"}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {DOCUMENT_TYPE_LABEL[candidate.documentType]}
                          {candidate.areaName ? ` · ${candidate.areaName}` : " · Empresa"}
                          {candidate.period ? ` · ${candidate.period}` : ""}
                        </p>
                        {candidate.summary ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{candidate.summary}</p>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {importSuggestion && requiredConflicts.length ? (
            <div className="space-y-3 rounded-xl border border-[#F5D0A9] bg-[#FFFBEB] p-4">
              <p className="text-sm font-semibold text-text">Escolhas necessárias</p>
              <p className="text-xs text-text-secondary">O Oráculo não decide sozinho entre leituras conflitantes.</p>
              {requiredConflicts.map((conflict) => (
                <div key={conflict.id} className="rounded-xl border border-border bg-white p-3">
                  <p className="text-sm text-text">{conflict.message}</p>
                  {conflict.kind === "table_choice" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {conflict.tableIds.map((tableId) => {
                        const table = importSuggestion.tables.find((item) => item.id === tableId);
                        if (!table) return null;
                        const checked = conflictChoices[conflict.id] === table.id;
                        return (
                          <label
                            key={table.id}
                            className={[
                              "cursor-pointer rounded-xl border p-3",
                              checked ? "border-accent bg-[#F7FAFF]" : "border-border",
                            ].join(" ")}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                name={`conflict-${conflict.id}`}
                                className="mt-1"
                                checked={checked}
                                onChange={() =>
                                  setConflictChoices((current) => ({
                                    ...current,
                                    [conflict.id]: table.id,
                                  }))
                                }
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text">{table.label}</p>
                                <p className="mt-0.5 text-xs text-text-tertiary">
                                  {table.years.length ? `Anos ${table.years.join("–")} · ` : ""}
                                  {table.rowCount} linhas
                                </p>
                                <div className="mt-2 space-y-0.5 text-xs leading-5 text-text-secondary">
                                  {tablePreviewLines(table).map((line) => (
                                    <p key={line} className="truncate">
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant={conflictChoices[conflict.id] === "confirm" ? undefined : "ghost"}
                        onClick={() => setConflictChoices((current) => ({ ...current, [conflict.id]: "confirm" }))}
                      >
                        Confirmei a leitura
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {historicalFeedback ? <p className="text-xs leading-5 text-[#1D7A3E]">{historicalFeedback}</p> : null}
          {historicalError ? <p className="text-xs leading-5 text-[#B42318]">{historicalError}</p> : null}
          {unresolvedRequiredConflicts.length ? (
            <p className="text-xs leading-5 text-[#A16207]">
              Ainda faltam {unresolvedRequiredConflicts.length} escolha(s) obrigatória(s) para liberar o salvamento.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={handleClose} disabled={historicalBusy}>
            Cancelar
          </Button>
          <Button
            variant="ghost"
            icon={suggestingHistorical ? Loader2 : Sparkles}
            disabled={!historicalText.trim() || historicalBusy}
            onClick={suggestHistoricalMetadata}
          >
            {suggestingHistorical ? "Interpretando..." : "Interpretar com o Oráculo"}
          </Button>
          <Button icon={savingHistorical ? Loader2 : Save} disabled={!canSave} onClick={saveHistoricalDocument}>
            {savingHistorical ? "Salvando..." : "Salvar histórico"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
