import { FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlanDocumentView } from "../components/PlanDocument";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";
import type { PlanDocument, PlanDocumentOrigin, PlanDocumentType } from "../types";

const TYPE_LABEL: Record<PlanDocumentType, string> = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento Mensal",
  quarter_close: "Fechamento Trimestral",
  strategic_review: "Revisão Estratégica",
  kpi_history: "Histórico de KPIs",
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
  const { state } = useAppState();
  const [typeFilter, setTypeFilter] = useState<"all" | PlanDocumentType>("all");
  const [originFilter, setOriginFilter] = useState<"all" | PlanDocumentOrigin>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const knownAreas = useMemo(() => [...state.areas, ...state.archivedAreas], [state.areas, state.archivedAreas]);
  const periods = useMemo(() => [...new Set(state.planDocuments.map((document) => document.period))], [state.planDocuments]);

  const filteredDocuments = useMemo(
    () =>
      state.planDocuments.filter((document) => {
        if (typeFilter !== "all" && document.type !== typeFilter) return false;
        if (originFilter !== "all" && document.origin !== originFilter) return false;
        if (areaFilter !== "all") {
          if (areaFilter === "company" && document.areaId) return false;
          if (areaFilter !== "company" && document.areaId !== areaFilter) return false;
        }
        if (periodFilter !== "all" && document.period !== periodFilter) return false;
        return true;
      }),
    [areaFilter, originFilter, periodFilter, state.planDocuments, typeFilter],
  );

  const selectedDocument = filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Oráculo</p>
          <h1 className="text-2xl font-semibold text-text">Documentos</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
            Planos, fechamentos e históricos salvos para leitura, impressão e envio pelo WhatsApp.
          </p>
        </div>
        {selectedDocument ? (
          <Link
            to={`/documentos/${selectedDocument.id}/imprimir`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white"
          >
            <Printer className="h-4 w-4" />
            Exportar PDF
          </Link>
        ) : null}
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
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
            Origem
            <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as "all" | PlanDocumentOrigin)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text">
              <option value="all">Todas</option>
              <option value="session">Sessão</option>
              <option value="historical">Histórico</option>
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
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-text">
              <option value="all">Todos</option>
              {periods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {selectedDocument ? (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-2">
            {filteredDocuments.map((document) => {
              const active = document.id === selectedDocument.id;
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedId(document.id)}
                  className={[
                    "w-full rounded-2xl border p-4 text-left transition",
                    active ? "border-accent bg-white" : "border-border bg-surface hover:border-accent/30",
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
          </aside>
          <PlanDocumentView document={selectedDocument} />
        </div>
      ) : (
        <Card className="text-center">
          <p className="text-base font-semibold text-text">Nenhum documento padrão ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Confirme um plano estratégico, trimestral, mensal ou fechamento para o Oráculo gerar o primeiro documento.
          </p>
        </Card>
      )}
    </div>
  );
}
