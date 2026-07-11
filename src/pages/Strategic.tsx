import { Archive, ClipboardCheck, FileText, Loader2, Plus, RefreshCw, Save, Send, Sparkles, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LineageTag } from "../components/ui/LineageTag";
import { ObjectiveBuilder } from "../features/objective/ObjectiveBuilder";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { HISTORICAL_FILE_ACCEPT, importStrategicPlanFile, isHistoricalImageFile, STRATEGIC_PLAN_FILE_ACCEPT } from "../lib/fileImport";
import { readKpiImage } from "../lib/kpiSpreadsheet";
import { formatDate } from "../lib/format";
import { reviewPastedPlan, type PastedPlanReview } from "../lib/oracle";
import { useAppState } from "../state/store";
import type { HistoricalMetadataSuggestion, PlanDocumentType } from "../types";

type StrategicTab = "build" | "paste" | "history";
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

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-text">{title}</p>
      <ul className="space-y-2 text-sm leading-6 text-text-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}

function ReviewResult({ review }: { review: PastedPlanReview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que está concreto</p>
        {review.concrete.length ? (
          <ul className="space-y-2 text-sm leading-6 text-text-secondary">
            {review.concrete.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">Ainda não apareceu objetivo com sinais suficientes.</p>
        )}
      </Card>
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que está genérico</p>
        {review.generic.length ? (
          <ul className="space-y-2 text-sm leading-6 text-text-secondary">
            {review.generic.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">Não encontrei frases totalmente sem sinal de concretude.</p>
        )}
      </Card>
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que falta no conjunto</p>
        <ul className="space-y-2 text-sm leading-6 text-text-secondary">
          {review.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!review.missing.length ? <li>O conjunto já tem boa base para virar plano estruturado.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

const LOW_CONFIDENCE_LABEL: Record<string, string> = {
  documentType: "tipo",
  area: "área",
  areaId: "área",
  period: "período",
  title: "título",
};

export function Strategic() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<StrategicTab>("build");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pastedPlan, setPastedPlan] = useState("");
  const [review, setReview] = useState<PastedPlanReview | null>(null);
  const [importingPlan, setImportingPlan] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sentToOracle, setSentToOracle] = useState(false);
  const [isDraggingPlan, setIsDraggingPlan] = useState(false);
  const [historicalType, setHistoricalType] = useState<HistoricalImportDocumentType>("strategic");
  const [historicalPeriod, setHistoricalPeriod] = useState("");
  const [historicalAreaId, setHistoricalAreaId] = useState("company");
  const [historicalTitle, setHistoricalTitle] = useState("");
  const [historicalText, setHistoricalText] = useState("");
  const [historicalFileName, setHistoricalFileName] = useState<string | null>(null);
  const [historicalNote, setHistoricalNote] = useState("");
  const [historicalSuggestion, setHistoricalSuggestion] = useState<HistoricalMetadataSuggestion | null>(null);
  const [historicalFeedback, setHistoricalFeedback] = useState<string | null>(null);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [importingHistorical, setImportingHistorical] = useState(false);
  const [suggestingHistorical, setSuggestingHistorical] = useState(false);
  const [savingHistorical, setSavingHistorical] = useState(false);
  const [isDraggingHistorical, setIsDraggingHistorical] = useState(false);
  const plan = state.strategicPlan;
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
  const strategicObjectives = useMemo(
    () => state.objectives.filter((objective) => objective.level === "strategic"),
    [state.objectives],
  );
  const currentYear = new Date().getFullYear();

  function startStrategicSession() {
    dispatch({ type: "start_session", sessionType: "strategic", period: String(currentYear) });
  }

  function startStrategicReviewSession() {
    dispatch({ type: "start_session", sessionType: "strategic_review", period: String(plan?.year ?? currentYear) });
  }

  function openReadyPlanImport() {
    setTab("paste");
  }

  function openHistoricalImport() {
    setTab("history");
  }

  function updatePastedPlan(value: string) {
    setPastedPlan(value);
    setReview(null);
    setImportedFileName(null);
    setImportFeedback(null);
    setImportError(null);
    setSentToOracle(false);
  }

  function updateHistoricalText(value: string) {
    setHistoricalText(value);
    setHistoricalSuggestion(null);
    setHistoricalTitle("");
    setHistoricalFeedback(null);
    setHistoricalError(null);
  }

  function sendReadyPlanToOracle() {
    const planText = pastedPlan.trim();
    if (!planText) return;

    const contextLimit = 24000;
    const safePlanText =
      planText.length > contextLimit
        ? `${planText.slice(0, contextLimit)}\n\n[O texto enviado foi cortado pelo limite de contexto. Se precisar, peça o restante do plano ao usuário antes de gravar.]`
        : planText;

    dispatch({
      type: "import_ready_strategic_plan",
      period: String(currentYear),
      text: safePlanText,
      fileName: importedFileName,
    });
    setSentToOracle(true);
  }

  async function processPlanFile(file: File | undefined) {
    if (!file) return;

    setImportingPlan(true);
    setReview(null);
    setImportError(null);
    setImportFeedback(null);
    setSentToOracle(false);

    try {
      const imported = await importStrategicPlanFile(file);
      setPastedPlan(imported.text);
      setImportedFileName(imported.fileName);
      setImportFeedback(imported.warning ?? "Texto importado. Agora peça a revisão ao Oráculo.");
    } catch (error) {
      setImportedFileName(null);
      setImportError(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setImportingPlan(false);
    }
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
      setHistoricalFeedback(imported.warning ?? "Texto importado para conferência.");
    } catch (error) {
      setHistoricalFileName(null);
      setHistoricalError(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setImportingHistorical(false);
    }
  }

  async function handlePlanFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processPlanFile(file);
  }

  async function handleHistoricalFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processHistoricalFile(file);
  }

  function hasDraggedFile(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handlePlanDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingPlan(true);
  }

  function handlePlanDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingPlan(false);
  }

  function handlePlanDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFile(event)) return;
    event.preventDefault();
    setIsDraggingPlan(false);
    const file = event.dataTransfer.files?.[0];
    void processPlanFile(file);
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

  function looksLikeMetadataDump(text: string) {
    const t = text.trim();
    return t.startsWith("{") && (/normalizedText|documentType|periodFound/.test(t));
  }

  function applyHistoricalSuggestion(
    suggestion: HistoricalMetadataSuggestion,
    options?: { extractedText?: string; tableExpanded?: boolean; fromImage?: boolean },
  ) {
    const nextAreaId = suggestion.areaId ?? (isOwner ? "company" : writableHistoricalAreas[0]?.id ?? "company");
    const normalized = String(options?.extractedText ?? "").trim();
    // Nunca substituir o textarea por JSON de metadados (bug: normalizedText vazio → JSON na tela).
    if (normalized && !looksLikeMetadataDump(normalized)) {
      setHistoricalText(normalized);
    }
    setHistoricalSuggestion(suggestion);
    setHistoricalType(suggestion.documentType);
    setHistoricalAreaId(nextAreaId);
    setHistoricalPeriod(suggestion.period);
    setHistoricalTitle(suggestion.title);

    const parts: string[] = [];
    if (options?.fromImage) parts.push("Imagem lida.");
    if (options?.tableExpanded || (normalized && /\[Tabela expandida por ano/i.test(normalized))) {
      parts.push("Tabela multi-ano expandida (uma linha por mês+ano) para o histórico não misturar anos.");
    }
    if (suggestion.periodFound) {
      parts.push("Sugestão pronta para conferência. Ajuste qualquer campo antes de salvar.");
    } else {
      parts.push("Sugestão pronta, mas não encontrei período claro. Preencha o período antes de salvar.");
    }
    setHistoricalFeedback(parts.join(" "));
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

  function saveHistoricalDocument() {
    const rawText = historicalText.trim();
    const period = historicalPeriod.trim();
    const areaId = effectiveHistoricalAreaId === "company" ? null : effectiveHistoricalAreaId || null;
    const title = historicalTitle.trim();

    setHistoricalFeedback(null);
    setHistoricalError(null);

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
      classification: buildHistoricalClassification(areaId, period),
      onSuccess: () => {
        setSavingHistorical(false);
        setHistoricalText("");
        setHistoricalNote("");
        setHistoricalTitle("");
        setHistoricalSuggestion(null);
        setHistoricalFileName(null);
        setHistoricalFeedback("Histórico salvo em Documentos.");
      },
      onError: (message) => {
        setSavingHistorical(false);
        setHistoricalError(message);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">
            Planejamento anual da empresa{plan ? ` · ${plan.year}` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-text">Plano Estratégico</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus} onClick={startStrategicSession}>
            Planejar o ano com o Oráculo
          </Button>
          {isOwner && plan ? (
            <Button variant="ghost" icon={RefreshCw} onClick={startStrategicReviewSession}>
              Revisão Estratégica
            </Button>
          ) : null}
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
        <button
          type="button"
          onClick={() => setTab("build")}
          className={[
            "rounded-[10px] px-4 py-2 text-sm font-medium transition",
            tab === "build" ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
          ].join(" ")}
        >
          Construir com o Oráculo
        </button>
        <button
          type="button"
          onClick={() => setTab("paste")}
          className={[
            "rounded-[10px] px-4 py-2 text-sm font-medium transition",
            tab === "paste" ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
          ].join(" ")}
        >
          Colar plano pronto
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={[
            "rounded-[10px] px-4 py-2 text-sm font-medium transition",
            tab === "history" ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
          ].join(" ")}
        >
          Importar histórico
        </button>
      </div>

      {tab === "paste" ? (
        <div className="space-y-4">
          <Card
            onDragOver={handlePlanDragOver}
            onDragLeave={handlePlanDragLeave}
            onDrop={handlePlanDrop}
            className={isDraggingPlan ? "border-accent bg-[#F7FAFF]" : ""}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Plano existente</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Importe ou arraste PDF, PPTX, DOCX ou TXT até 80 MB. O texto extraído entra neste campo.
                </p>
              </div>
              <label
                className={[
                  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white",
                  importingPlan ? "cursor-wait opacity-70" : "",
                ].join(" ")}
              >
                {importingPlan ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload aria-hidden="true" className="h-4 w-4" />
                )}
                <span>{importingPlan ? "Importando..." : "Importar arquivo"}</span>
                <input
                  className="sr-only"
                  type="file"
                  accept={STRATEGIC_PLAN_FILE_ACCEPT}
                  disabled={importingPlan}
                  onChange={(event) => {
                    void handlePlanFileImport(event);
                  }}
                />
              </label>
            </div>
            <label className="block">
              <span className="sr-only">Texto do plano existente</span>
              <textarea
                value={pastedPlan}
                onChange={(event) => updatePastedPlan(event.target.value)}
                rows={10}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6"
                placeholder="Cole aqui o planejamento existente"
              />
            </label>
            {importedFileName ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-text-secondary">
                <FileText aria-hidden="true" className="h-4 w-4" />
                Texto importado de {importedFileName}.
              </p>
            ) : null}
            {importFeedback ? <p className="mt-2 text-xs leading-5 text-[#1D7A3E]">{importFeedback}</p> : null}
            {importError ? <p className="mt-2 text-xs leading-5 text-[#B42318]">{importError}</p> : null}
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  icon={ClipboardCheck}
                  disabled={!pastedPlan.trim() || importingPlan}
                  onClick={() => setReview(reviewPastedPlan(pastedPlan))}
                >
                  Só revisar texto
                </Button>
                <Button
                  icon={Send}
                  disabled={!pastedPlan.trim() || importingPlan}
                  onClick={sendReadyPlanToOracle}
                >
                  Enviar ao Oráculo
                </Button>
              </div>
            </div>
            {sentToOracle ? (
              <p className="mt-3 text-xs leading-5 text-[#1D7A3E]">
                Plano enviado ao Oráculo. O cartão de proposta aparecerá no painel lateral; confirme para gravar objetivos e projetos no seu plano.
              </p>
            ) : null}
          </Card>
          {review ? <ReviewResult review={review} /> : null}
        </div>
      ) : tab === "history" ? (
        <div className="space-y-4">
          <Card
            onDragOver={handleHistoricalDragOver}
            onDragLeave={handleHistoricalDragLeave}
            onDrop={handleHistoricalDrop}
            className={isDraggingHistorical ? "border-accent bg-[#F7FAFF]" : ""}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Documento histórico</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  O histórico fica em Documentos e não cria objetivos ativos. Aceita PDF, PPTX, DOCX, TXT e imagens JPG/PNG/WEBP.
                </p>
              </div>
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

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-text-tertiary">Título</span>
              <input
                value={historicalTitle}
                onChange={(event) => setHistoricalTitle(event.target.value)}
                className={[
                  "h-10 w-full rounded-xl border bg-white px-3 text-sm text-text",
                  historicalLowConfidenceFields.has("title") ? "border-[#D97706]" : "border-border",
                ].join(" ")}
                placeholder="Ex.: Plano trimestral Comercial (T2 2024)"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-text-tertiary">Nota</span>
              <input
                value={historicalNote}
                onChange={(event) => setHistoricalNote(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                placeholder="Ex.: versão aprovada no planejamento anual"
              />
            </label>

            <label className="mt-4 block">
              <span className="sr-only">Texto do documento histórico</span>
              <textarea
                value={historicalText}
                onChange={(event) => updateHistoricalText(event.target.value)}
                rows={12}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6"
                placeholder="Cole o texto ou importe arquivo/imagem. Tabelas multi-ano serão expandidas (Janeiro 2025 | valor) ao interpretar."
              />
            </label>

            {historicalFileName ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-text-secondary">
                <FileText aria-hidden="true" className="h-4 w-4" />
                Texto importado de {historicalFileName}.
              </p>
            ) : null}
            {/\[Tabela expandida por ano/i.test(historicalText) ? (
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Prévia já no formato de histórico: cada linha é um mês + um ano (fácil de gravar e de a IA reler depois).
              </p>
            ) : null}
            {historicalSuggestion ? (
              <div className="mt-4 rounded-xl border border-border bg-[#FBFBFC] p-4">
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
                    {historicalSuggestion.source === "ai_background" ? "IA background" : "Heurística"} ·{" "}
                    {Math.round(historicalSuggestion.confidence * 100)}%
                  </span>
                </div>
                {historicalSuggestion.summary ? (
                  <p className="mt-3 text-sm leading-6 text-text-secondary">{historicalSuggestion.summary}</p>
                ) : null}
                {historicalSuggestion.lowConfidenceFields.length ? (
                  <p className="mt-3 text-xs leading-5 text-[#A16207]">
                    Revise:{" "}
                    {historicalSuggestion.lowConfidenceFields
                      .map((field) => LOW_CONFIDENCE_LABEL[field] ?? field)
                      .join(", ")}
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
            {historicalFeedback ? <p className="mt-2 text-xs leading-5 text-[#1D7A3E]">{historicalFeedback}</p> : null}
            {historicalError ? <p className="mt-2 text-xs leading-5 text-[#B42318]">{historicalError}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                icon={suggestingHistorical ? Loader2 : Sparkles}
                disabled={!historicalText.trim() || historicalBusy}
                onClick={suggestHistoricalMetadata}
              >
                {suggestingHistorical ? "Interpretando..." : "Interpretar com o Oráculo"}
              </Button>
              <Button
                icon={savingHistorical ? Loader2 : Save}
                disabled={!historicalText.trim() || !historicalPeriod.trim() || historicalBusy}
                onClick={saveHistoricalDocument}
              >
                {savingHistorical ? "Salvando..." : "Salvar histórico"}
              </Button>
            </div>
          </Card>
        </div>
      ) : !plan ? (
        <Card>
          <p className="text-base font-semibold text-text">Nenhum Plano Estratégico ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie a estrutura anual para começar a desdobrar objetivos por área, trimestre e mês.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Plus} onClick={startStrategicSession}>
              Planejar o ano com o Oráculo
            </Button>
            <Button variant="ghost" icon={Upload} onClick={openReadyPlanImport}>
              Importar plano pronto
            </Button>
            <Button variant="ghost" icon={Archive} onClick={openHistoricalImport}>
              Importar histórico
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Identificação e contexto</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-text-tertiary">Setor</dt>
                  <dd className="font-medium text-text">{plan.profile.sector}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Porte</dt>
                  <dd className="font-medium text-text">{plan.profile.size}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Região</dt>
                  <dd className="font-medium text-text">{plan.profile.region}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Fundação</dt>
                  <dd className="font-medium text-text">{plan.profile.founded}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-6 text-text-secondary">{plan.profile.mainPain}</p>
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Direcionadores</p>
              <div className="space-y-4 text-sm leading-6">
                <p>
                  <span className="font-medium text-text">Propósito: </span>
                  <span className="text-text-secondary">{plan.drivers.purpose}</span>
                </p>
                <p>
                  <span className="font-medium text-text">Visão: </span>
                  <span className="text-text-secondary">{plan.drivers.vision}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {plan.drivers.values.map((value) => (
                    <span key={value} className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <ListBlock title="Forças" items={plan.swot.strengths} />
            <ListBlock title="Fraquezas" items={plan.swot.weaknesses} />
            <ListBlock title="Oportunidades" items={plan.swot.opportunities} />
            <ListBlock title="Ameaças" items={plan.swot.threats} />
          </div>

          <Card>
            <p className="mb-3 text-sm font-semibold text-text">Tema do ano</p>
            <div className="flex flex-wrap gap-2">
              {plan.themes.map((theme) => (
                <span key={theme} className="rounded-xl bg-[#F0F7FF] px-3 py-2 text-sm font-medium text-accent">
                  {theme}
                </span>
              ))}
            </div>
          </Card>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-text">Objetivos estratégicos</h2>
              {isOwner ? (
                <Button variant="ghost" icon={Plus} onClick={() => setBuilderOpen(true)}>
                  Novo objetivo
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4">
              {strategicObjectives.length ? (
                strategicObjectives.map((objective) => (
                  <ObjectiveCard key={objective.id} objective={objective} />
                ))
              ) : (
                <Card>
                  <p className="text-sm text-text-secondary">Nenhum objetivo estratégico salvo ainda.</p>
                </Card>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text">Projetos prioritários</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.projects.map((project) => {
                const linkedObjective = state.objectives.find((objective) => objective.id === project.linkedObjectiveId);
                return (
                  <Card key={project.id}>
                    <p className="text-sm font-semibold text-text">{project.name}</p>
                    <p className="mt-2 text-sm text-text-secondary">Dono: {project.owner}</p>
                    <p className="mt-1 text-sm text-text-secondary">Prazo: {formatDate(project.deadline)}</p>
                    <div className="mt-3">
                      {linkedObjective ? <LineageTag objective={{ ...linkedObjective, level: "area_annual" }} parent={linkedObjective} /> : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ListBlock title="Rituais de acompanhamento" items={plan.rituals} />
            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Resumo executivo</p>
              <p className="text-sm leading-6 text-text-secondary">{plan.executiveSummary}</p>
            </Card>
          </div>
        </div>
      )}

      {builderOpen ? <ObjectiveBuilder level="strategic" onClose={() => setBuilderOpen(false)} /> : null}
    </div>
  );
}
