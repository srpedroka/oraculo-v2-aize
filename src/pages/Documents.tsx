import { Archive, FileText, Printer, RefreshCw, Upload } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AsyncDialogFallback } from "../components/AsyncDialogFallback";
import { PlanDocumentView } from "../components/PlanDocument";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import { OperationalArchiveDialog } from "../features/lifecycle/OperationalArchiveDialog";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";
import { usePaginatedPlanDocuments } from "../state/use-paginated-records";
import type { PlanDocument, PlanDocumentOrigin, PlanDocumentType } from "../types";

const HistoricalImportDialog = lazy(() => import("../features/history/HistoricalImportDialog").then((module) => ({ default: module.HistoricalImportDialog })));

const TYPE_LABEL: Record<PlanDocumentType, string> = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento Mensal",
  quarter_close: "Fechamento Trimestral",
  strategic_review: "Revisão Estratégica",
  kpi_history: "Histórico de KPIs",
  company_profile: "Perfil da empresa",
};

const ORIGIN_LABEL: Record<PlanDocumentOrigin, string> = {
  session: "Sessão",
  historical: "Histórico",
};

function documentAreaName(document: PlanDocument, areas: { id: string; name: string }[]) {
  if (!document.areaId) return "Empresa";
  return areas.find((area) => area.id === document.areaId)?.name ?? "Área";
}

export function Documents() {
  const { state, dispatch } = useAppState();
  const [typeFilter, setTypeFilter] = useState<"all" | PlanDocumentType>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<RecoverableFeedback | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reopenBackup, setReopenBackup] = useState<Record<string, unknown> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isOwner = state.currentMembership?.role === "owner";
  const canImportHistory = useMemo(() => {
    if (isOwner) return true;
    if (state.currentMembership?.role !== "coordinator") return false;
    const membershipId = state.currentMembership.id;
    return state.areas.some((area) => area.coordinatorId === membershipId);
  }, [isOwner, state.areas, state.currentMembership]);

  const knownAreas = useMemo(() => [...state.areas, ...state.archivedAreas], [state.areas, state.archivedAreas]);
  const documentsQuery = usePaginatedPlanDocuments(state.activeOrgId, {
    type: typeFilter === "all" ? null : typeFilter,
    areaId: areaFilter === "all" ? null : areaFilter,
    period: periodFilter,
  });
  const queryFeedback = useMemo(
    () => documentsQuery.error
      ? recoverableFeedback(
          documentsQuery.error,
          "Não consegui carregar os documentos.",
          "A lista não foi tratada como vazia. Tente novamente para recuperar os documentos salvos.",
          "DOCUMENTS_LOAD_FAILED",
        )
      : null,
    [documentsQuery.error],
  );
  const filteredDocuments = documentsQuery.items;

  const selectedDocument = filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0] ?? null;
  const canManageSelected = Boolean(
    selectedDocument &&
      (state.currentMembership?.role === "owner" ||
        (selectedDocument.areaId &&
          state.currentMembership?.role === "coordinator" &&
          state.areas.some((area) => area.id === selectedDocument.areaId && area.coordinatorId === state.currentMembership?.id))),
  );
  const selectedImportBackup =
    selectedDocument?.origin === "historical" &&
    selectedDocument.content &&
    typeof selectedDocument.content === "object" &&
    selectedDocument.content.import_backup &&
    typeof selectedDocument.content.import_backup === "object"
      ? (selectedDocument.content.import_backup as Record<string, unknown>)
      : null;
  const canReopenImport = Boolean(canImportHistory && selectedImportBackup);

  function archiveDocument(reason: string) {
    if (!selectedDocument) return;
    setArchiveBusy(true);
    setArchiveError(null);
    dispatch({
      type: "set_operational_item_archived",
      entityType: "plan_document",
      entityId: selectedDocument.id,
      archived: true,
      reason,
      onSuccess: () => {
        setArchiveBusy(false);
        setArchiveOpen(false);
        setSelectedId(null);
      },
      onError: (message) => {
        setArchiveBusy(false);
        setArchiveError(recoverableFeedback(
          message,
          "Não consegui arquivar este documento.",
          "O documento continua na lista. Tente novamente.",
          "DOCUMENT_ARCHIVE_FAILED",
        ));
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Comprovação dos planos e fechamentos</p>
          <h1 className="text-2xl font-semibold text-text">Documentos</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
            Confira o que foi gravado pelo Oráculo, imprima em PDF e consulte a memória importada da empresa.
            {canImportHistory
              ? " Históricos antigos entram aqui somente depois da sua confirmação."
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImportHistory ? (
            <Button
              icon={Upload}
              onClick={() => {
                setReopenBackup(null);
                setImportOpen(true);
              }}
            >
              Importar histórico
            </Button>
          ) : null}
          {selectedDocument ? (
            <>
              {canReopenImport ? (
                <Button
                  variant="ghost"
                  icon={RefreshCw}
                  onClick={() => {
                    setReopenBackup(selectedImportBackup);
                    setImportOpen(true);
                  }}
                >
                  Reabrir importação
                </Button>
              ) : null}
              {canManageSelected ? (
                <Button
                  variant="quiet"
                  size="icon"
                  icon={Archive}
                  onClick={() => {
                    setArchiveError(null);
                    setArchiveOpen(true);
                  }}
                  aria-label="Arquivar documento"
                  title="Retirar documento da lista ativa"
                />
              ) : null}
              <Link
                to={`/documentos/${selectedDocument.id}/imprimir`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white"
              >
                <Printer className="h-4 w-4" />
                Exportar PDF
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {statusMessage ? <InlineFeedback tone="success" title={statusMessage} /> : null}

      {queryFeedback ? (
        <InlineFeedback
          tone="error"
          title={queryFeedback.title}
          description={queryFeedback.description}
          occurrenceId={queryFeedback.occurrenceId}
          actionLabel="Tentar novamente"
          onAction={() => {
            if (documentsQuery.isFetchNextPageError) void documentsQuery.fetchNextPage();
            else void documentsQuery.refetch();
          }}
          actionLoading={documentsQuery.isFetching}
        />
      ) : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
            Tipo
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | PlanDocumentType)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text">
              <option value="all">Todos</option>
              {(Object.keys(TYPE_LABEL) as PlanDocumentType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
            Área
            <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text">
              <option value="all">Todos</option>
              <option value="company">Empresa</option>
              {knownAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}{area.archivedAt ? " (arquivada)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-text-tertiary">
            Período
            <input
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value)}
              placeholder="Todos ou ex.: T3 2026"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text"
            />
          </label>
        </div>
      </Card>

      {selectedDocument ? (
        <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="max-h-80 overflow-y-auto rounded-card border border-border bg-surface xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)]" aria-label="Lista de documentos">
            {filteredDocuments.map((document) => {
              const active = document.id === selectedDocument.id;
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedId(document.id)}
                  className={[
                    "w-full border-b border-border-subtle p-4 text-left transition-colors last:border-b-0",
                    active ? "bg-fill-active" : "bg-surface hover:bg-fill-hover",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">{document.title}</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {TYPE_LABEL[document.type]} · {documentAreaName(document, knownAreas)} · {document.period}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                        <span>{ORIGIN_LABEL[document.origin]}</span>
                        <span>Versão {document.version}</span>
                        {document.origin === "historical" ? (
                          <span className="rounded-full bg-[#F0F0F2] px-2 py-0.5 font-medium text-text-secondary">Histórico</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {documentsQuery.hasNextPage ? (
              <Button
                variant="ghost"
                className="w-full"
                loading={documentsQuery.isFetchingNextPage}
                onClick={() => void documentsQuery.fetchNextPage()}
              >
                Carregar mais
              </Button>
            ) : null}
          </aside>
          <div className="min-w-0 md:max-h-[70vh] md:overflow-y-auto md:pr-1 xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)]">
            <PlanDocumentView document={selectedDocument} />
          </div>
        </div>
      ) : documentsQuery.isLoading ? (
        <Card className="text-center">
          <p className="text-sm text-text-secondary">Carregando documentos...</p>
        </Card>
      ) : documentsQuery.isError ? null : (
        <Card className="text-center">
          <p className="text-base font-semibold text-text">Nenhum documento padrão ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Quando você confirma um plano ou fechamento, o comprovante aparece aqui.
            {canImportHistory ? " Para consultar decisões passadas, importe o primeiro histórico da empresa." : ""}
          </p>
          {canImportHistory ? (
            <div className="mt-4 flex justify-center">
              <Button
                icon={Upload}
                onClick={() => {
                  setReopenBackup(null);
                  setImportOpen(true);
                }}
              >
                Importar histórico
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {archiveOpen && selectedDocument ? (
        <OperationalArchiveDialog
          eyebrow="Documento"
          title={`Arquivar ${selectedDocument.title}?`}
          description="O documento deixa a lista principal e o contexto ativo do Oráculo, mas permanece disponível no Arquivo, na auditoria e nos backups."
          confirmLabel="Arquivar documento"
          busy={archiveBusy}
          error={archiveError}
          onClose={() => {
            if (archiveBusy) return;
            setArchiveOpen(false);
            setArchiveError(null);
          }}
          onConfirm={archiveDocument}
        />
      ) : null}
      {importOpen ? (
        <Suspense fallback={<AsyncDialogFallback label="Abrindo importação..." />}>
          <HistoricalImportDialog
            open
            initialBackup={reopenBackup}
            onClose={() => {
              setImportOpen(false);
              setReopenBackup(null);
            }}
            onSaved={(documentId, options) => {
              if (documentId) setSelectedId(documentId);
              setStatusMessage(
                options?.newVersion
                  ? "Nova versão salva. A anterior continua no histórico."
                  : "Histórico salvo em Documentos.",
              );
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
