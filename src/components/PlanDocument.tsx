import type { ReactNode } from "react";
import type { PlanDocument, PlanDocumentType } from "../types";

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

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function Section({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <section className="plan-document-section space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold text-text-tertiary">{String(index).padStart(2, "0")}</span>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-text-secondary">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function KeyValue({ label, value }: { label: string; value: unknown }) {
  const text = asText(value);
  if (!text) return null;
  return (
    <p className="text-sm leading-6 text-text-secondary">
      <span className="font-medium text-text">{label}: </span>
      {text}
    </p>
  );
}

function ObjectiveBlock({ objective }: { objective: Record<string, unknown> }) {
  const actions = asArray<Record<string, unknown>>(objective.acoes);
  const deliverables = asArray<string>(objective.entregas);
  const strategies = asArray<string>(objective.estrategias);
  const meta = [
    asText(objective.tipo),
    asText(objective.atual) ? `Baseline: ${asText(objective.atual)}` : "",
    asText(objective.indicador) ? `Indicador: ${asText(objective.indicador)}` : "",
    asText(objective.meta) ? `Meta: ${asText(objective.meta)}` : "",
    asText(objective.responsavel) ? `Responsável: ${asText(objective.responsavel)}` : "",
    asText(objective.status_final) ? `Status final: ${asText(objective.status_final)}` : "",
    objective.progresso_final !== null && objective.progresso_final !== undefined ? `Progresso: ${objective.progresso_final}%` : "",
  ].filter(Boolean);

  return (
    <article className="plan-document-block grid gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0 md:grid-cols-[76px_1fr]">
      <div className="text-5xl font-light leading-none text-text-tertiary">{asText(objective.numero, "1")}</div>
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-xl font-semibold leading-7 text-text">{asText(objective.titulo, "Objetivo")}</h3>
          {meta.length ? <p className="mt-2 text-xs font-medium leading-5 text-text-tertiary">{meta.join(" · ")}</p> : null}
        </div>
        <KeyValue label="Resultado esperado" value={objective.resultado} />
        <KeyValue label="Fonte" value={objective.fonte} />
        <KeyValue label="Vínculo" value={objective.vinculo} />
        {strategies.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">Estratégias</p>
            <TextList items={strategies} />
          </div>
        ) : null}
        {deliverables.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">Entregas</p>
            <TextList items={deliverables} />
          </div>
        ) : null}
        {actions.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            {actions.map((action, index) => (
              <div key={`${asText(action.codigo)}-${index}`} className="grid gap-2 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[1fr_140px_140px]">
                <div>
                  <p className="text-sm font-medium leading-6 text-text">{asText(action.codigo)} {asText(action.descricao, "Ação-chave")}</p>
                  {asText(action.criterio) ? <p className="text-xs leading-5 text-text-tertiary">Critério: {asText(action.criterio)}</p> : null}
                </div>
                <p className="text-xs leading-5 text-text-secondary">Dono: {asText(action.responsavel, "A definir")}</p>
                <p className="text-xs leading-5 text-text-secondary">Prazo: {asText(action.prazo, "A definir")}</p>
              </div>
            ))}
          </div>
        ) : null}
        <KeyValue label="Evidência" value={objective.evidencia} />
        <KeyValue label="Decisão" value={objective.decisao} />
      </div>
    </article>
  );
}

function StrategicSection({ content }: { content: Record<string, unknown> }) {
  const strategic = asRecord(content.strategic);
  if (!Object.keys(strategic).length) return null;
  const drivers = asRecord(strategic.direcionadores);
  const swot = asRecord(strategic.swot);
  const projects = asArray<Record<string, unknown>>(strategic.projetos);
  const swotGroups = [
    { title: "Forças", items: asArray<string>(swot.forcas) },
    { title: "Fraquezas", items: asArray<string>(swot.fraquezas) },
    { title: "Oportunidades", items: asArray<string>(swot.oportunidades) },
    { title: "Ameaças", items: asArray<string>(swot.ameacas) },
  ].filter((group) => group.items.length);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2">
        <KeyValue label="Propósito" value={drivers.proposito} />
        <KeyValue label="Visão" value={drivers.visao} />
        <KeyValue label="Temas" value={asArray<string>(strategic.temas).join("; ")} />
        <KeyValue label="Renúncias" value={asArray<string>(strategic.renuncias).join("; ")} />
        <KeyValue label="Riscos" value={asArray<string>(strategic.riscos).join("; ")} />
        <KeyValue label="Decisões pendentes" value={asArray<string>(strategic.decisoes_pendentes).join("; ")} />
        <KeyValue label="Aprendizados anteriores" value={asArray<string>(strategic.aprendizados_historicos).join("; ")} />
        <KeyValue label="Rituais" value={asArray<string>(strategic.rituais).join("; ")} />
      </div>
      {swotGroups.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {swotGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">{group.title}</p>
              <TextList items={group.items} />
            </div>
          ))}
        </div>
      ) : null}
      {projects.length ? (
        <div className="space-y-2 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">Projetos Prioritários</p>
          <div className="grid gap-2 md:grid-cols-2">
            {projects.map((project, index) => (
              <div key={`${asText(project.nome)}-${index}`} className="rounded-xl border border-border p-4">
                <p className="font-semibold text-text">{asText(project.nome, "Projeto")}</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {[asText(project.responsavel) ? `Dono: ${asText(project.responsavel)}` : "", asText(project.prazo) ? `Prazo: ${asText(project.prazo)}` : "", asText(project.vinculo) ? `Vínculo: ${asText(project.vinculo)}` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlanDocumentView({ document, printMode = false }: { document: PlanDocument; printMode?: boolean }) {
  const content = document.content ?? {};
  const type = document.type;
  const isHistorical = document.origin === "historical";
  const rawHistory = asText(content.raw);
  const historicalSource = asText(content.source);
  const historicalNote = asText(content.note);
  const historicalSummary = asText(content.summary) || asText(asRecord(content.classification).summary);
  const historicalMetadata = asRecord(content.source_metadata);
  const hasImportBackup = Boolean(content.import_backup && typeof content.import_backup === "object");
  const objectives = asArray<Record<string, unknown>>(content.objetivos);
  const context = asArray<string>(content.contexto_rapido);
  const focus = asArray<string>(content.foco_aprendizado);
  const closing = asRecord(content.fechamento);
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(document.createdAt));

  if (isHistorical) {
    return (
      <article className={["plan-document mx-auto bg-white text-text", printMode ? "max-w-[210mm] px-0 py-0" : "rounded-[18px] border border-border p-6 shadow-card lg:p-10"].join(" ")}>
        <header className="plan-document-header border-b border-border pb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">{asText(content.empresa, "Empresa")}</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-text">{document.title}</h1>
              <p className="mt-2 text-sm text-text-secondary">
                {DOCUMENT_TYPE_LABEL[type]} · {asText(content.area, "Empresa")} · {asText(content.periodo, document.period)}
              </p>
              {historicalSummary ? <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{historicalSummary}</p> : null}
              {hasImportBackup ? (
                <span className="mt-3 inline-flex rounded-full bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                  Importado com revisão
                </span>
              ) : null}
            </div>
            <div className="text-left text-xs leading-5 text-text-tertiary sm:text-right">
              <p>Versão {document.version}</p>
              <p>Importado como histórico</p>
              {historicalSource ? <p className="mt-1">Fonte: {historicalSource}</p> : null}
            </div>
          </div>
        </header>

        <div className="space-y-10 py-8">
          {(historicalSource || historicalNote || Object.keys(historicalMetadata).length) ? (
            <Section index={1} title="Origem">
              <div className="grid gap-3 md:grid-cols-2">
                <KeyValue label="Fonte" value={historicalSource} />
                <KeyValue label="Nota" value={historicalNote} />
                <KeyValue label="Empresa de origem" value={historicalMetadata.sourceCompany} />
                <KeyValue label="Área no documento" value={historicalMetadata.sourceAreaLabel} />
                <KeyValue label="Responsável" value={historicalMetadata.managerName} />
                <KeyValue label="Ano" value={historicalMetadata.year} />
                <KeyValue label="Trimestre" value={historicalMetadata.quarter ? `T${historicalMetadata.quarter}` : ""} />
                <KeyValue label="Versão de origem" value={historicalMetadata.sourceVersion} />
              </div>
            </Section>
          ) : null}

          <Section index={historicalSource || historicalNote || Object.keys(historicalMetadata).length ? 2 : 1} title="Texto Importado">
            <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface px-4 py-4 text-sm leading-6 text-text-secondary">
              {rawHistory || "Documento histórico sem texto disponível."}
            </div>
          </Section>
        </div>

        {printMode ? (
          <footer className="plan-document-footer border-t border-border pt-8 text-center">
            <p className="mt-8 text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Histórico importado no Oráculo · {generatedAt}</p>
          </footer>
        ) : null}
      </article>
    );
  }

  return (
    <article className={["plan-document mx-auto bg-white text-text", printMode ? "max-w-[210mm] px-0 py-0" : "rounded-[18px] border border-border p-6 shadow-card lg:p-10"].join(" ")}>
      <header className="plan-document-header border-b border-border pb-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">{asText(content.empresa, "Empresa")}</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-text">{document.title}</h1>
            <p className="mt-2 text-sm text-text-secondary">
              {DOCUMENT_TYPE_LABEL[type]} · {asText(content.area, "Empresa")} · {asText(content.periodo, document.period)}
            </p>
          </div>
          <div className="text-left text-xs leading-5 text-text-tertiary sm:text-right">
            <p>Versão {document.version}</p>
            <p>Gerado pelo Oráculo</p>
          </div>
        </div>
      </header>

      <div className="space-y-10 py-8">
        {context.length ? (
          <Section index={1} title="Contexto Rápido">
            <TextList items={context} />
          </Section>
        ) : null}

        <Section index={context.length ? 2 : 1} title={type === "strategic" ? "Estrutura Estratégica" : "Referência"}>
          {type === "strategic" ? (
            <StrategicSection content={content} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <KeyValue label="Objetivo anual" value={asRecord(content.referencia).objetivo_anual} />
              <KeyValue label="Objetivos do trimestre" value={asArray<string>(asRecord(content.referencia).objetivos_trimestre).join("; ")} />
            </div>
          )}
        </Section>

        {objectives.length ? (
          <Section index={context.length ? 3 : 2} title={type.includes("close") ? "Revisão dos Objetivos" : "Objetivos e Ações"}>
            <div className="space-y-7">
              {objectives.map((objective, index) => (
                <ObjectiveBlock key={`${asText(objective.titulo)}-${index}`} objective={objective} />
              ))}
            </div>
          </Section>
        ) : null}

        {Object.keys(closing).length ? (
          <Section index={context.length ? 4 : 3} title="Fechamento">
            <div className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Resumo" value={closing.resumo} />
              <KeyValue label="Conclusão" value={closing.percentual !== null && closing.percentual !== undefined ? `${closing.percentual}%` : ""} />
              <KeyValue label="Aprendizados" value={asArray<string>(closing.aprendizados).join("; ")} />
              <KeyValue label="Pendências" value={asArray<string>(closing.pendencias).join("; ")} />
              <KeyValue label="Decisões" value={asArray<string>(closing.decisoes).join("; ")} />
              <KeyValue label="Próximo período" value={closing.proximo_periodo} />
            </div>
          </Section>
        ) : null}

        {focus.length ? (
          <Section index={Object.keys(closing).length ? 5 : 4} title="Foco de Aprendizado">
            <TextList items={focus} />
          </Section>
        ) : null}
      </div>

      {asText(content.frase_de_foco) ? (
        <footer className="plan-document-footer border-t border-border pt-8 text-center">
          <p className="text-lg font-medium italic leading-8 text-text-secondary">{asText(content.frase_de_foco)}</p>
          {printMode ? <p className="mt-8 text-[10px] not-italic uppercase tracking-[0.16em] text-text-tertiary">Gerado pelo Oráculo · {generatedAt}</p> : null}
        </footer>
      ) : null}
    </article>
  );
}
