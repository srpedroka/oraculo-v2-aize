import { ClipboardCheck, FileText, Loader2, Plus, RefreshCw, Send, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import { LineageTag } from "../components/ui/LineageTag";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { ObjectiveBuilder } from "../features/objective/ObjectiveBuilder";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { importStrategicPlanFile, STRATEGIC_PLAN_FILE_ACCEPT } from "../lib/fileImport";
import { formatDate } from "../lib/format";
import { reviewPastedPlan, type PastedPlanReview } from "../lib/oracle";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import { useSessionLauncher } from "../hooks/useSessionLauncher";
import { useAppState } from "../state/store";

type StrategicTab = "build" | "paste";

const STRATEGIC_TABS: readonly TabItem<StrategicTab>[] = [
  { value: "build", label: "Plano atual" },
  { value: "paste", label: "Importar plano" },
];

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-text">{title}</p>
      <ul className="space-y-2 text-sm leading-6 text-text-secondary">
        {items.map((item) => (
          <li key={item} className="break-words">{item}</li>
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

export function Strategic() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<StrategicTab>("build");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pastedPlan, setPastedPlan] = useState("");
  const [review, setReview] = useState<PastedPlanReview | null>(null);
  const [importingPlan, setImportingPlan] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<RecoverableFeedback | null>(null);
  const [retryPlanFile, setRetryPlanFile] = useState<File | null>(null);
  const [sentToOracle, setSentToOracle] = useState(false);
  const [sendingReadyPlan, setSendingReadyPlan] = useState(false);
  const [readyPlanError, setReadyPlanError] = useState<RecoverableFeedback | null>(null);
  const [isDraggingPlan, setIsDraggingPlan] = useState(false);
  const plan = state.strategicPlan;
  const isOwner = state.currentMembership?.role === "owner";
  const strategicObjectives = useMemo(
    () => state.objectives.filter((objective) => objective.level === "strategic"),
    [state.objectives],
  );
  const currentYear = new Date().getFullYear();
  const sessionLauncher = useSessionLauncher(dispatch);
  const strategicRequest = { sessionType: "strategic" as const, period: String(currentYear) };
  const reviewRequest = { sessionType: "strategic_review" as const, period: String(plan?.year ?? currentYear) };

  function startStrategicSession() {
    sessionLauncher.startSession(strategicRequest);
  }

  function startStrategicReviewSession() {
    sessionLauncher.startSession(reviewRequest);
  }

  function openReadyPlanImport() {
    setTab("paste");
  }

  function updatePastedPlan(value: string) {
    setPastedPlan(value);
    setReview(null);
    setImportedFileName(null);
    setImportFeedback(null);
    setImportError(null);
    setRetryPlanFile(null);
    setSentToOracle(false);
    setReadyPlanError(null);
  }

  function sendReadyPlanToOracle() {
    const planText = pastedPlan.trim();
    if (!planText || sendingReadyPlan) return;

    const contextLimit = 24000;
    const safePlanText =
      planText.length > contextLimit
        ? `${planText.slice(0, contextLimit)}\n\n[O texto enviado foi cortado pelo limite de contexto. Se precisar, peça o restante do plano ao usuário antes de gravar.]`
        : planText;

    setSendingReadyPlan(true);
    setReadyPlanError(null);
    setSentToOracle(false);
    dispatch({
      type: "import_ready_strategic_plan",
      period: String(currentYear),
      text: safePlanText,
      fileName: importedFileName,
      onSuccess: () => {
        setSendingReadyPlan(false);
        setSentToOracle(true);
      },
      onError: (message) => {
        setSendingReadyPlan(false);
        setReadyPlanError(recoverableFeedback(
          message,
          "Não consegui enviar o plano ao Oráculo.",
          "O texto continua neste campo. Tente novamente sem importar o arquivo de novo.",
          "STRATEGIC_IMPORT_SEND_FAILED",
        ));
      },
    });
  }

  async function processPlanFile(file: File | undefined) {
    if (!file) return;

    setImportingPlan(true);
    setReview(null);
    setImportError(null);
    setImportFeedback(null);
    setSentToOracle(false);
    setRetryPlanFile(file);

    try {
      const imported = await importStrategicPlanFile(file);
      setPastedPlan(imported.text);
      setImportedFileName(imported.fileName);
      setImportFeedback(imported.warning ?? "Texto importado. Agora peça a revisão ao Oráculo.");
      setRetryPlanFile(null);
    } catch (error) {
      setImportedFileName(null);
      setImportError(recoverableFeedback(
        error,
        "Não consegui ler este arquivo.",
        "Nada foi enviado ou gravado. Confira o formato e tente novamente.",
        "STRATEGIC_IMPORT_READ_FAILED",
      ));
    } finally {
      setImportingPlan(false);
    }
  }

  async function handlePlanFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processPlanFile(file);
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

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">
            Origem da estratégia{plan ? ` · ${plan.year}` : ` · ${currentYear}`}
          </p>
          <h1 className="text-2xl font-semibold text-text">Plano Estratégico</h1>
          <p className="mt-1 text-sm leading-6 text-text-secondary">Direção anual que orienta os planos de cada área e trimestre.</p>
        </div>
        {isOwner && plan ? (
          <Button icon={RefreshCw} loading={sessionLauncher.isStarting(reviewRequest)} onClick={startStrategicReviewSession}>
            Revisar plano anual
          </Button>
        ) : null}
      </div>

      {sessionLauncher.error ? (
        <InlineFeedback
          tone="error"
          title={sessionLauncher.error.title}
          description={sessionLauncher.error.description}
          occurrenceId={sessionLauncher.error.occurrenceId}
          actionLabel="Tentar novamente"
          onAction={sessionLauncher.retry}
          actionLoading={sessionLauncher.pending}
        />
      ) : null}

      <Tabs
        ariaLabel="Formas de trabalhar o plano estratégico"
        items={STRATEGIC_TABS.map((item) => item.value === "build" && !plan ? { ...item, label: "Construir com o Oráculo" } : item)}
        value={tab}
        onChange={setTab}
        panelId="strategic-tab-panel"
      />

      <div id="strategic-tab-panel" role="tabpanel" className="min-w-0">
      {tab === "paste" ? (
        <div className="min-w-0 space-y-4">
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
                  Importe ou arraste PDF, PPTX, DOCX, TXT ou Markdown até 80 MB. O texto extraído entra neste campo.
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
            {importError ? (
              <InlineFeedback
                className="mt-3"
                tone="error"
                title={importError.title}
                description={importError.description}
                occurrenceId={importError.occurrenceId}
                actionLabel={retryPlanFile ? "Tentar novamente" : undefined}
                onAction={retryPlanFile ? () => void processPlanFile(retryPlanFile) : undefined}
                actionLoading={importingPlan}
              />
            ) : null}
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
                <Button icon={Send} loading={sendingReadyPlan} disabled={!pastedPlan.trim() || importingPlan} onClick={sendReadyPlanToOracle}>
                  Enviar ao Oráculo
                </Button>
              </div>
            </div>
            {sendingReadyPlan ? (
              <InlineFeedback className="mt-3" tone="info" title="Enviando plano ao Oráculo" description="O texto continua preservado enquanto a proposta é preparada." />
            ) : null}
            {readyPlanError ? (
              <InlineFeedback
                className="mt-3"
                tone="error"
                title={readyPlanError.title}
                description={readyPlanError.description}
                occurrenceId={readyPlanError.occurrenceId}
                actionLabel="Tentar novamente"
                onAction={sendReadyPlanToOracle}
                actionLoading={sendingReadyPlan}
              />
            ) : null}
            {sentToOracle ? (
              <InlineFeedback className="mt-3" tone="success" title="Plano enviado ao Oráculo" description="Confira a proposta no painel lateral antes de gravar objetivos e projetos." />
            ) : null}
          </Card>
          {review ? <ReviewResult review={review} /> : null}
        </div>
      ) : !plan ? (
        <Card>
          <p className="text-base font-semibold text-text">Nenhum Plano Estratégico ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie a estrutura anual para começar a desdobrar objetivos por área, trimestre e mês.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Plus} loading={sessionLauncher.isStarting(strategicRequest)} onClick={startStrategicSession}>
              Planejar o ano com o Oráculo
            </Button>
            <Button variant="ghost" icon={Upload} onClick={openReadyPlanImport}>
              Importar plano pronto
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="border-y border-border-subtle py-5" aria-labelledby="strategic-summary-title">
            <p className="text-xs font-medium text-text-tertiary">Resumo do plano · {plan.year}</p>
            <h2 id="strategic-summary-title" className="mt-1 text-lg font-semibold text-text">Direção executiva</h2>
            <p className="mt-2 max-w-4xl break-words text-sm leading-6 text-text-secondary">{plan.executiveSummary}</p>
            {plan.themes.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.themes.map((theme) => (
                  <span key={theme} className="rounded-full bg-status-neutral-bg px-2.5 py-1 text-xs font-medium text-status-neutral">
                    {theme}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

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
              <p className="mt-4 break-words text-sm leading-6 text-text-secondary">{plan.profile.mainPain}</p>
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

          <div className="max-w-2xl">
            <ListBlock title="Rituais de acompanhamento" items={plan.rituals} />
          </div>
        </div>
      )}
      </div>

      {builderOpen ? <ObjectiveBuilder level="strategic" onClose={() => setBuilderOpen(false)} /> : null}
    </div>
  );
}
