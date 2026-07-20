import { CheckCircle2, FileText, Loader2, Maximize2, Minimize2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { importPlanFile, PLAN_FILE_ACCEPT } from "../lib/fileImport";
import { createMessageId, generateWeeklyReview } from "../lib/oracle";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";
import type { ConfirmSessionProposalResult } from "../state/store-contract";
import { Button } from "./ui/Button";
import { InlineFeedback } from "./ui/InlineFeedback";
import { ReadableText } from "./ui/ReadableText";

type ChatTarget =
  | { kind: "session"; sessionId: string }
  | { kind: "oracle"; context: string };

type PendingChatMessage = ChatTarget & { text: string };
type AttachmentRetry =
  | { kind: "file"; file: File }
  | { kind: "text"; payload: PendingChatMessage };

const SESSION_TYPE_LABEL = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento do Mês",
  quarter_close: "Fechamento do Trimestre",
  strategic_review: "Revisão Estratégica",
};

const SESSION_PHASES = {
  strategic: ["abertura", "direcionadores", "swot", "tema_do_ano", "objetivos", "projetos", "rituais", "sintese"],
  quarterly: ["abertura", "alinhamento", "anual_da_area", "diagnostico", "objetivos_do_trimestre", "foco_de_aprendizado", "sintese"],
  monthly: ["abertura", "relembrar", "objetivos_do_mes", "acoes_chave", "realismo", "sintese"],
  month_close: ["abertura", "revisao", "pendencias", "pulso", "resumo", "ponte"],
  quarter_close: ["abertura", "revisao_trimestre", "aprendizado_do_time", "balanco"],
  strategic_review: ["abertura", "revisao_objetivos", "sintese"],
};

const PHASE_LABEL: Record<string, string> = {
  abertura: "Abertura",
  direcionadores: "Direcionadores",
  swot: "SWOT",
  tema_do_ano: "Tema do ano",
  objetivos: "Objetivos",
  projetos: "Projetos",
  rituais: "Rituais",
  sintese: "Síntese",
  alinhamento: "Alinhamento",
  anual_da_area: "Anual da área",
  diagnostico: "Diagnóstico",
  objetivos_do_trimestre: "Objetivos do trimestre",
  foco_de_aprendizado: "Foco de aprendizado",
  relembrar: "Relembrar",
  objetivos_do_mes: "Objetivos do mês",
  acoes_chave: "Ações-chave",
  realismo: "Realismo",
  revisao: "Revisão",
  pendencias: "Pendências",
  pulso: "Pulso de gestão",
  resumo: "Resumo",
  ponte: "Ponte",
  revisao_trimestre: "Revisão do trimestre",
  revisao_objetivos: "Revisão dos objetivos",
  aprendizado_do_time: "Aprendizado do time",
  balanco: "Balanço",
};

function proposalTitle(proposal: Record<string, unknown> | null) {
  if (!proposal) return "";
  const type = String(proposal.type ?? "");
  if (type === "save_strategic_plan") return "Plano Estratégico";
  if (type === "save_quarterly_plan") return "Plano Trimestral";
  if (type === "save_monthly_plan") return "Plano Mensal";
  if (type === "month_close") return "Fechamento do Mês";
  if (type === "quarter_close") return "Fechamento do Trimestre";
  if (type === "apply_strategic_review") return "Revisão Estratégica";
  return "Proposta";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length) : [];
}

const KPI_LABEL: Record<string, string> = {
  revenue: "Faturamento",
  operating_margin: "Margem operacional",
  production: "Produção",
  cash: "Caixa",
};

function KpiLinkPreview({ objective }: { objective: Record<string, unknown> }) {
  const links = asRecordArray(objective.kpiLinks ?? objective.kpi_links);
  if (!links.length) return null;
  return (
    <p className="mt-1 text-[11px] text-[#5F6368]">
      <span className="font-medium text-[#1D1D1F]">KPIs confirmados: </span>
      {links.map((link) => KPI_LABEL[asText(link.kpiKey ?? link.kpi_key)] ?? asText(link.kpiKey ?? link.kpi_key)).filter(Boolean).join(", ")}
    </p>
  );
}

function DetailLine({ label, value }: { label: string; value: unknown }) {
  const text = asText(value);
  if (!text) return null;
  return (
    <p>
      <span className="font-medium text-[#1D1D1F]">{label}: </span>
      <span>{text}</span>
    </p>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 6).map((item) => (
        <span key={item} className="rounded-full bg-[#F0F0F2] px-2 py-1 text-[11px] font-medium text-[#5F6368]">
          {item}
        </span>
      ))}
    </div>
  );
}

function MissingInfoSummary({ proposal }: { proposal: Record<string, unknown> }) {
  const drivers = asRecord(proposal.drivers);
  const objectives = asRecordArray(proposal.objectives);
  const projects = asRecordArray(proposal.projects);
  const missing: string[] = [];

  if (!asText(drivers.purpose)) missing.push("propósito");
  if (!asText(drivers.vision)) missing.push("visão");

  const objectivesWithoutMetric = objectives.filter((objective) => !asText(objective.metric)).length;
  const objectivesWithoutTarget = objectives.filter((objective) => !asText(objective.target)).length;
  const objectivesWithoutOwner = objectives.filter((objective) => !asText(objective.owner)).length;
  const projectsWithoutDeadline = projects.filter((project) => !asText(project.deadline)).length;

  if (objectivesWithoutMetric) missing.push(`${objectivesWithoutMetric} objetivo(s) sem indicador explícito`);
  if (objectivesWithoutTarget) missing.push(`${objectivesWithoutTarget} objetivo(s) sem meta explícita`);
  if (objectivesWithoutOwner) missing.push(`${objectivesWithoutOwner} objetivo(s) sem responsável explícito`);
  if (projectsWithoutDeadline) missing.push(`${projectsWithoutDeadline} projeto(s) sem prazo explícito`);

  if (!missing.length) return null;

  return (
    <div className="rounded-xl bg-[#FFF8E8] px-3 py-2 text-[12px] leading-5 text-[#7A4E12]">
      <span className="font-semibold">Campos em branco por não estarem explícitos: </span>
      {missing.join("; ")}.
    </div>
  );
}

function StrategicProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  if (asText(proposal.type) !== "save_strategic_plan") return null;

  const drivers = asRecord(proposal.drivers);
  const swot = asRecord(proposal.swot);
  const profile = asRecord(proposal.profile);
  const themes = asTextArray(proposal.themes);
  const values = asTextArray(drivers.values);
  const objectives = asRecordArray(proposal.objectives);
  const projects = asRecordArray(proposal.projects);
  const rituals = asTextArray(proposal.rituals);

  return (
    <div tabIndex={0} aria-label="Conteúdo da proposta" className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-2xl border border-black/10 bg-white p-3 text-[12px] leading-5 text-[#5F6368]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-[#1D1D1F]">Plano Estratégico {asText(proposal.year)}</p>
        <p className="text-[12px] text-text-tertiary">
          Será salvo como plano anual, objetivos estratégicos e projetos prioritários depois da sua confirmação.
        </p>
      </div>

      {themes.length ? (
        <div className="rounded-xl bg-[#F7F7F8] p-3">
          <p className="mb-2 font-semibold text-[#1D1D1F]">Tema do ano</p>
          <ChipList items={themes} />
        </div>
      ) : null}

      <div className="grid gap-2">
        <DetailLine label="Setor" value={profile.sector} />
        <DetailLine label="Dor principal" value={profile.mainPain ?? profile.main_pain} />
        <DetailLine label="Propósito" value={drivers.purpose} />
        <DetailLine label="Visão" value={drivers.vision} />
        <ChipList items={values} />
      </div>

      {objectives.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F]">Objetivos estratégicos ({objectives.length})</p>
          {objectives.map((objective, index) => {
            const meta = [
              asText(objective.metric) ? `Indicador: ${asText(objective.metric)}` : "",
              asText(objective.target) ? `Meta: ${asText(objective.target)}` : "",
              asText(objective.owner) ? `Dono: ${asText(objective.owner)}` : "",
            ].filter(Boolean);
            return (
              <div key={`${asText(objective.title)}-${index}`} className="rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
                <p className="font-semibold text-[#1D1D1F]">{asText(objective.title) || `Objetivo ${index + 1}`}</p>
                {asText(objective.result) ? <p className="mt-1">{asText(objective.result)}</p> : null}
                {meta.length ? <p className="mt-1 text-[11px] text-text-tertiary">{meta.join(" · ")}</p> : null}
                <KpiLinkPreview objective={objective} />
              </div>
            );
          })}
        </div>
      ) : null}

      {projects.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F]">Projetos prioritários ({projects.length})</p>
          {projects.map((project, index) => (
            <div key={`${asText(project.name)}-${index}`} className="rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
              <p className="font-semibold text-[#1D1D1F]">{asText(project.name) || `Projeto ${index + 1}`}</p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {[
                  asText(project.owner) ? `Dono: ${asText(project.owner)}` : "",
                  asText(project.deadline) ? `Prazo: ${asText(project.deadline)}` : "",
                  asText(project.linkedObjectiveTitle) ? `Ligado a: ${asText(project.linkedObjectiveTitle)}` : "",
                ].filter(Boolean).join(" · ") || "Sem dono, prazo ou vínculo explícitos no arquivo."}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        {asTextArray(swot.strengths).length || asTextArray(swot.weaknesses).length ? (
          <p>
            <span className="font-medium text-[#1D1D1F]">SWOT: </span>
            {[
              asTextArray(swot.strengths).length ? `${asTextArray(swot.strengths).length} força(s)` : "",
              asTextArray(swot.weaknesses).length ? `${asTextArray(swot.weaknesses).length} fraqueza(s)` : "",
              asTextArray(swot.opportunities).length ? `${asTextArray(swot.opportunities).length} oportunidade(s)` : "",
              asTextArray(swot.threats).length ? `${asTextArray(swot.threats).length} ameaça(s)` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {rituals.length ? (
          <p>
            <span className="font-medium text-[#1D1D1F]">Rituais: </span>
            {rituals.join("; ")}
          </p>
        ) : null}
      </div>

      <MissingInfoSummary proposal={proposal} />
    </div>
  );
}

function QuarterlyProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  if (asText(proposal.type) !== "save_quarterly_plan") return null;

  const areaRole = asRecord(proposal.areaRole);
  const diagnosis = asRecord(proposal.diagnosis);
  const annualObjectives = asRecordArray(proposal.annualObjectives);
  const quarterlyObjectives = asRecordArray(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre);
  const sharedActions = asRecordArray(proposal.sharedActions ?? proposal.acoesTransversais);
  const learningFocus = asTextArray(proposal.learningFocus ?? proposal.foco_aprendizado);

  return (
    <div tabIndex={0} aria-label="Conteúdo da proposta" className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-2xl border border-black/10 bg-white p-3 text-[12px] leading-5 text-[#5F6368]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-[#1D1D1F]">Plano Trimestral {asText(proposal.period)}</p>
        <p className="text-[12px] text-text-tertiary">
          Será salvo no departamento escolhido, com objetivo anual da área quando necessário e objetivos do trimestre.
        </p>
      </div>

      {asText(areaRole.mission) || asTextArray(areaRole.contribution).length ? (
        <div className="rounded-xl bg-[#F7F7F8] p-3">
          <p className="mb-1 font-semibold text-[#1D1D1F]">Papel da área</p>
          <DetailLine label="Missão" value={areaRole.mission} />
          <ChipList items={asTextArray(areaRole.contribution)} />
        </div>
      ) : null}

      {annualObjectives.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F]">Objetivos anuais da área ({annualObjectives.length})</p>
          {annualObjectives.map((objective, index) => (
            <div key={`${asText(objective.title)}-${index}`} className="rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
              <p className="font-semibold text-[#1D1D1F]">{asText(objective.title) || `Objetivo anual ${index + 1}`}</p>
              {asText(objective.result) ? <p className="mt-1">{asText(objective.result)}</p> : null}
              <p className="mt-1 text-[11px] text-text-tertiary">
                {[
                  asText(objective.metric) ? `Indicador: ${asText(objective.metric)}` : "",
                  asText(objective.target) ? `Meta: ${asText(objective.target)}` : "",
                  asText(objective.owner) ? `Dono: ${asText(objective.owner)}` : "",
                ].filter(Boolean).join(" · ") || "Sem indicador, meta ou dono explícitos no arquivo."}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {quarterlyObjectives.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F]">Objetivos do trimestre ({quarterlyObjectives.length})</p>
          {quarterlyObjectives.map((objective, index) => {
            const deliverables = asTextArray(objective.deliverables ?? objective.entregas);
            return (
              <div key={`${asText(objective.title)}-${index}`} className="rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
                <p className="font-semibold text-[#1D1D1F]">{asText(objective.title) || `Objetivo trimestral ${index + 1}`}</p>
                {asText(objective.result) ? <p className="mt-1">{asText(objective.result)}</p> : null}
                <p className="mt-1 text-[11px] text-text-tertiary">
                  {[
                    asText(objective.metric) ? `Indicador: ${asText(objective.metric)}` : "",
                    asText(objective.target) ? `Meta: ${asText(objective.target)}` : "",
                    asText(objective.owner) ? `Dono: ${asText(objective.owner)}` : "",
                    asText(objective.parentTitle) ? `Vínculo anual: ${asText(objective.parentTitle)}` : "",
                  ].filter(Boolean).join(" · ") || "Sem indicador, meta, dono ou vínculo explícitos no arquivo."}
                </p>
                <KpiLinkPreview objective={objective} />
                <ChipList items={deliverables} />
              </div>
            );
          })}
        </div>
      ) : null}

      {sharedActions.length ? (
        <div className="space-y-2 rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
          <p className="font-semibold text-[#1D1D1F]">Ações transversais ({sharedActions.length})</p>
          {sharedActions.map((action, index) => (
            <p key={`${asText(action.description ?? action.descricao)}-${index}`}>
              <span className="font-medium text-[#1D1D1F]">{asText(action.description ?? action.descricao)}</span>
              {[asText(action.owner ?? action.responsavel), asText(action.deadline ?? action.prazo)]
                .filter(Boolean).length ? ` · ${[
                  asText(action.owner ?? action.responsavel) ? `Dono: ${asText(action.owner ?? action.responsavel)}` : "",
                  asText(action.deadline ?? action.prazo) ? `Prazo: ${asText(action.deadline ?? action.prazo)}` : "",
                ].filter(Boolean).join(" · ")}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        {asTextArray(diagnosis.strengths).length || asTextArray(diagnosis.weaknesses).length ? (
          <p>
            <span className="font-medium text-[#1D1D1F]">Diagnóstico: </span>
            {[
              asTextArray(diagnosis.strengths).length ? `${asTextArray(diagnosis.strengths).length} força(s)` : "",
              asTextArray(diagnosis.weaknesses).length ? `${asTextArray(diagnosis.weaknesses).length} gargalo(s)` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {learningFocus.length ? (
          <p>
            <span className="font-medium text-[#1D1D1F]">Foco de aprendizado: </span>
            {learningFocus.join("; ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MonthlyProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  if (asText(proposal.type) !== "save_monthly_plan") return null;

  const alignment = asRecord(proposal.quarterlyAlignment ?? proposal.alinhamento_trimestral);
  const objectives = asRecordArray(proposal.objectives ?? proposal.objetivos_mes);
  const actions = objectives.flatMap((objective) => asRecordArray(objective.actions ?? objective.acoes));
  const pendingDecisions = asRecordArray(proposal.pendingDecisions ?? proposal.decisoes_pendentes);
  const blockers = asTextArray(proposal.blockers ?? proposal.bloqueios);
  const risks = asTextArray(proposal.risks ?? proposal.riscos);

  return (
    <div tabIndex={0} aria-label="Conteúdo da proposta" className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-card border border-border bg-surface p-3 text-xs leading-5 text-text-secondary">
      <div>
        <p className="text-caption font-semibold uppercase text-text-tertiary">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-text">Plano Mensal {asText(proposal.period)}</p>
        <p>Até cinco ações serão salvas com seus responsáveis, prazos e critérios de conclusão.</p>
      </div>

      <div className="grid gap-1 border-y border-border-subtle py-2">
        <DetailLine label="Vínculo trimestral" value={alignment.quarterlyObjectiveTitle ?? alignment.objectiveTitle ?? alignment.rationale} />
        <DetailLine label="Cadência" value={proposal.cadence ?? proposal.cadencia} />
        <DetailLine label="Próximo compromisso" value={proposal.nextCommitment ?? proposal.proximo_compromisso} />
      </div>

      {objectives.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-text">Resultados do mês ({objectives.length})</p>
          {objectives.map((objective, index) => (
            <div key={`${asText(objective.title)}-${index}`} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
              <p className="font-semibold text-text">{asText(objective.title) || `Resultado ${index + 1}`}</p>
              <DetailLine label="Resultado" value={objective.result} />
              <p className="text-caption text-text-tertiary">
                {[
                  asText(objective.current) ? `Atual: ${asText(objective.current)}` : "",
                  asText(objective.target) ? `Meta: ${asText(objective.target)}` : "",
                  asText(objective.owner) ? `Dono: ${asText(objective.owner)}` : "",
                  asText(objective.deadline) ? `Prazo: ${asText(objective.deadline)}` : "",
                ].filter(Boolean).join(" · ") || "Campos materiais não informados serão mantidos em branco."}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {actions.length ? (
        <div className="space-y-1 border-t border-border-subtle pt-2">
          <p className="font-semibold text-text">Ações ({actions.length})</p>
          {actions.map((action, index) => (
            <p key={`${asText(action.description ?? action.descricao)}-${index}`}>
              <span className="font-medium text-text">{asText(action.description ?? action.descricao) || `Ação ${index + 1}`}</span>
              {[
                asText(action.owner ?? action.responsavel) ? `Dono: ${asText(action.owner ?? action.responsavel)}` : "",
                asText(action.deadline ?? action.prazo) ? `Prazo: ${asText(action.deadline ?? action.prazo)}` : "",
                asText(action.completionCriterion ?? action.criterio_conclusao) ? `Conclui quando: ${asText(action.completionCriterion ?? action.criterio_conclusao)}` : "",
              ].filter(Boolean).length ? ` · ${[
                asText(action.owner ?? action.responsavel) ? `Dono: ${asText(action.owner ?? action.responsavel)}` : "",
                asText(action.deadline ?? action.prazo) ? `Prazo: ${asText(action.deadline ?? action.prazo)}` : "",
                asText(action.completionCriterion ?? action.criterio_conclusao) ? `Conclui quando: ${asText(action.completionCriterion ?? action.criterio_conclusao)}` : "",
              ].filter(Boolean).join(" · ")}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {pendingDecisions.length || blockers.length || risks.length ? (
        <div className="grid gap-1 border-t border-border-subtle pt-2">
          {pendingDecisions.length ? <DetailLine label="Decisões pendentes" value={`${pendingDecisions.length} registrada(s)`} /> : null}
          {blockers.length ? <DetailLine label="Bloqueios" value={blockers.join("; ")} /> : null}
          {risks.length ? <DetailLine label="Riscos" value={risks.join("; ")} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function CloseProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  const type = asText(proposal.type);
  if (type !== "month_close" && type !== "quarter_close") return null;

  const reviews = asRecordArray(proposal.reviews ?? proposal.revisao ?? proposal.revisao_tri);
  const pendencies = asRecordArray(proposal.pendencies ?? proposal.pendencias);
  const pulse = asRecord(proposal.managementPulse ?? proposal.management_pulse);
  const learnings = asTextArray(proposal.learnings ?? proposal.aprendizados ?? proposal.learningBalance ?? proposal.balanco_aprendizado);
  const title = type === "month_close" ? "Fechamento do Mês" : "Fechamento do Trimestre";

  return (
    <div tabIndex={0} aria-label="Conteúdo da proposta" className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-card border border-border bg-surface p-3 text-xs leading-5 text-text-secondary">
      <div>
        <p className="text-caption font-semibold uppercase text-text-tertiary">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-text">{title} {asText(proposal.period ?? proposal.periodo)}</p>
        <p>Resultados, evidências, aprendizados e compromissos serão registrados após uma confirmação.</p>
      </div>

      <DetailLine label="Resumo" value={proposal.summary ?? proposal.resumo} />

      {reviews.length ? (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <p className="font-semibold text-text">Resultados revisados ({reviews.length})</p>
          {reviews.map((review, index) => (
            <div key={`${asText(review.objectiveTitle ?? review.title ?? review.objectiveId)}-${index}`} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
              <p className="font-semibold text-text">{asText(review.objectiveTitle ?? review.title) || `Objetivo ${index + 1}`}</p>
              <p>
                {[
                  asText(review.expected ?? review.target) ? `Esperado: ${asText(review.expected ?? review.target)}` : "",
                  asText(review.achieved ?? review.actual ?? review.progressFinal) ? `Realizado: ${asText(review.achieved ?? review.actual ?? review.progressFinal)}` : "",
                  asText(review.statusFinal ?? review.status) ? `Status: ${asText(review.statusFinal ?? review.status)}` : "",
                ].filter(Boolean).join(" · ")}
              </p>
              <DetailLine label="Evidência" value={review.evidence ?? review.evidencia} />
              <DetailLine label="Aprendizado" value={review.learning ?? review.aprendizado} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-1 border-t border-border-subtle pt-2">
        {learnings.length ? <DetailLine label="Aprendizados" value={learnings.join("; ")} /> : null}
        {pendencies.length ? <DetailLine label="Pendências" value={`${pendencies.length} com decisão registrada`} /> : null}
        <DetailLine label="Confiança" value={pulse.confidence ?? pulse.confianca ?? proposal.confidence} />
        <DetailLine label="Bloqueio" value={pulse.blocker ?? pulse.bloqueio} />
        <DetailLine label="Próximo compromisso" value={pulse.next_commitment ?? pulse.nextCommitment ?? proposal.nextCommitment} />
        <DetailLine label="Próximo período" value={proposal.nextPeriod ?? proposal.next_period} />
      </div>
    </div>
  );
}

function fieldLabel(value: unknown) {
  const field = asText(value);
  if (field === "metric") return "Indicador";
  if (field === "target") return "Meta";
  if (field === "current") return "Valor atual";
  if (field === "deadline") return "Prazo";
  if (field === "status") return "Status";
  return field || "Campo";
}

function StrategicReviewProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  if (asText(proposal.type) !== "apply_strategic_review") return null;

  const adjustments = asRecordArray(proposal.adjustments ?? proposal.ajustes);
  const unchanged = asTextArray(proposal.unchanged ?? proposal.permaneceIgual ?? proposal.permanece_igual);

  return (
    <div tabIndex={0} aria-label="Conteúdo da proposta" className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-2xl border border-black/10 bg-white p-3 text-[12px] leading-5 text-[#5F6368]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Prévia do que será ajustado</p>
        <p className="mt-1 text-base font-semibold text-[#1D1D1F]">Revisão Estratégica {asText(proposal.period ?? proposal.periodo)}</p>
        <p className="text-[12px] text-text-tertiary">
          Só objetivos estratégicos existentes serão ajustados depois da sua confirmação.
        </p>
      </div>

      <DetailLine label="Motivo" value={proposal.motivo_revisao ?? proposal.motivoRevisao ?? proposal.reason} />

      {adjustments.length ? (
        <div className="space-y-2">
          <p className="font-semibold text-[#1D1D1F]">Vai mudar ({adjustments.length})</p>
          {adjustments.map((adjustment, index) => (
            <div key={`${asText(adjustment.objectiveId ?? adjustment.objetivo_id)}-${index}`} className="rounded-xl border border-black/10 bg-[#FBFBFC] p-3">
              <p className="font-semibold text-[#1D1D1F]">{asText(adjustment.title ?? adjustment.titulo) || `Objetivo ${index + 1}`}</p>
              <p className="mt-1">
                <span className="font-medium text-[#1D1D1F]">{fieldLabel(adjustment.field ?? adjustment.campo)}: </span>
                {asText(adjustment.from ?? adjustment.de) || "em branco"} → {asText(adjustment.to ?? adjustment.para) || "em branco"}
              </p>
              <DetailLine label="Por quê" value={adjustment.because ?? adjustment.porque ?? adjustment.justificativa} />
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-[#FFF8E8] px-3 py-2 text-[#7A4E12]">Nenhum ajuste estruturado ainda.</p>
      )}

      <div className="border-t border-border-subtle pt-2">
        <p className="font-semibold text-text">Permanece igual</p>
        <p className="mt-1">{unchanged.length ? unchanged.join("; ") : "Tudo o que não aparece em Vai mudar será preservado."}</p>
      </div>
    </div>
  );
}

function ProposalPreview({ proposal }: { proposal: Record<string, unknown> }) {
  return (
    <>
      <StrategicProposalPreview proposal={proposal} />
      <QuarterlyProposalPreview proposal={proposal} />
      <MonthlyProposalPreview proposal={proposal} />
      <CloseProposalPreview proposal={proposal} />
      <StrategicReviewProposalPreview proposal={proposal} />
    </>
  );
}

function AttachmentReceipt({ value }: { value: string }) {
  const [header, ...content] = value.split(/\n\n/);
  const fileName = header.replace(/^Arquivo anexado no chat do app:\s*/i, "").trim();
  return (
    <details className="text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text">
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{fileName || "Arquivo enviado"}</span>
      </summary>
      <ReadableText value={content.join("\n\n")} className="mt-2 border-t border-border-subtle pt-2 text-xs" />
    </details>
  );
}

export function OraclePanel() {
  const { state, dispatch } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(state.objectives[0]?.id ?? "");
  const [evidenceText, setEvidenceText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<RecoverableFeedback | null>(null);
  const [failedMessage, setFailedMessage] = useState<PendingChatMessage | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<RecoverableFeedback | null>(null);
  const [attachmentRetry, setAttachmentRetry] = useState<AttachmentRetry | null>(null);
  // Trava o botao de confirmar enquanto a gravacao esta em voo, evitando duplo submit.
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<RecoverableFeedback | null>(null);
  const [abandoningSessionId, setAbandoningSessionId] = useState<string | null>(null);
  const [abandonError, setAbandonError] = useState<RecoverableFeedback | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [adjustingSessionId, setAdjustingSessionId] = useState<string | null>(null);
  const [discardConfirmSessionId, setDiscardConfirmSessionId] = useState<string | null>(null);
  const [proposalSuccess, setProposalSuccess] = useState<ConfirmSessionProposalResult | null>(null);
  const [proposalNotice, setProposalNotice] = useState<string | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const mode = state.ui.oracleMode;
  const previousModeRef = useRef(mode);
  const isDashboard = location.pathname === "/";
  const availableSessions = useMemo(() => {
    if (state.planningSessions.length) return state.planningSessions;
    return state.activeSession ? [state.activeSession] : [];
  }, [state.activeSession, state.planningSessions]);
  const activeSession = useMemo(
    () => availableSessions.find((session) => session.id === selectedSessionId) ?? availableSessions[0] ?? null,
    [availableSessions, selectedSessionId],
  );
  const visibleMessages = useMemo(() => {
    const conversationId = activeSession?.conversationId
      ?? state.chatMessages.at(-1)?.conversationId
      ?? null;
    if (!conversationId) return state.chatMessages;
    return state.chatMessages.filter((chatMessage) => chatMessage.conversationId === conversationId);
  }, [activeSession?.conversationId, state.chatMessages]);
  const activeArea = activeSession?.areaId
    ? state.areas.find((area) => area.id === activeSession.areaId) ?? null
    : null;
  const confirmedDocument = proposalSuccess?.document
    ?? state.planDocuments.find((document) => document.sessionId === proposalSuccess?.sessionId)
    ?? null;
  const phases = activeSession ? SESSION_PHASES[activeSession.type] : [];
  const phaseIndex = activeSession ? Math.max(0, phases.indexOf(activeSession.phase)) : 0;
  const phaseProgress = phases.length ? ((phaseIndex + 1) / phases.length) * 100 : 0;

  const selectedObjective = useMemo(
    () => state.objectives.find((objective) => objective.id === selectedObjectiveId),
    [selectedObjectiveId, state.objectives],
  );

  useEffect(() => {
    if (!selectedObjectiveId && state.objectives[0]) {
      setSelectedObjectiveId(state.objectives[0].id);
    }
  }, [selectedObjectiveId, state.objectives]);

  useEffect(() => {
    if (selectedSessionId && availableSessions.some((session) => session.id === selectedSessionId)) return;
    setSelectedSessionId(availableSessions[0]?.id ?? null);
  }, [availableSessions, selectedSessionId]);

  // Libera o botao quando a proposta e aplicada/descartada (pendingProposal some) ou troca a sessao.
  useEffect(() => {
    if (!activeSession?.pendingProposal) {
      setConfirmingSessionId(null);
      setConfirmationError(null);
      setAbandoningSessionId(null);
      setAbandonError(null);
      setAdjustingSessionId(null);
      setDiscardConfirmSessionId(null);
    }
  }, [activeSession?.id, activeSession?.pendingProposal]);

  useEffect(() => {
    setConfirmationError(null);
    setAbandonError(null);
  }, [activeSession?.id]);

  useEffect(() => {
    if (mode === "minimized") return;
    const frame = window.requestAnimationFrame(() => {
      const messagesList = messagesListRef.current;
      if (messagesList) messagesList.scrollTop = messagesList.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSession?.id, activeSession?.phase, mode, visibleMessages.length]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;
    if (previousMode === mode) return;
    const frame = window.requestAnimationFrame(() => {
      if (mode === "minimized") launcherRef.current?.focus();
      else if (previousMode === "minimized") panelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  function setMode(nextMode: typeof mode) {
    dispatch({ type: "set_oracle_mode", mode: nextMode });
  }

  function dispatchChatPayload(payload: PendingChatMessage, onSuccess: () => void, onError: (message: string) => void) {
    if (payload.kind === "session") {
      dispatch({ type: "send_session_message", sessionId: payload.sessionId, text: payload.text, onSuccess, onError });
      return;
    }
    dispatch({ type: "send_oracle_message", text: payload.text, context: payload.context, onSuccess, onError });
  }

  function sendChatMessage(payload: PendingChatMessage) {
    if (sendingMessage) return;
    if (payload.kind === "session") {
      setProposalSuccess(null);
      setProposalNotice(null);
    }
    setSendingMessage(true);
    setMessageError(null);
    setFailedMessage(payload);
    dispatchChatPayload(
      payload,
      () => {
        setSendingMessage(false);
        setFailedMessage(null);
        setMessageError(null);
        if (payload.kind === "session") setAdjustingSessionId(null);
        setMessage((current) => current.trim() === payload.text ? "" : current);
      },
      (errorMessage) => {
        setSendingMessage(false);
        setMessageError(recoverableFeedback(
          errorMessage,
          "Não consegui enviar sua mensagem.",
          "Seu texto continua no campo. Tente novamente quando estiver pronto.",
          "ORACLE_MESSAGE_SEND_FAILED",
        ));
      },
    );
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sendingMessage) return;
    const payload: PendingChatMessage = activeSession
      ? { kind: "session", sessionId: activeSession.id, text }
      : { kind: "oracle", context: location.pathname, text };
    sendChatMessage(payload);
  }

  function sendAttachmentPayload(payload: PendingChatMessage) {
    if (attachmentLoading) return;
    setAttachmentLoading(true);
    setAttachmentError(null);
    setAttachmentRetry({ kind: "text", payload });
    dispatchChatPayload(
      payload,
      () => {
        setAttachmentLoading(false);
        setAttachmentRetry(null);
      },
      (errorMessage) => {
        setAttachmentLoading(false);
        setAttachmentError(recoverableFeedback(
          errorMessage,
          "Não consegui enviar este arquivo ao Oráculo.",
          "O conteúdo já extraído continua preservado. Tente novamente sem selecionar o arquivo outra vez.",
          "ORACLE_ATTACHMENT_SEND_FAILED",
        ));
      },
    );
  }

  async function processAttachment(file: File | undefined) {
    if (!file || attachmentLoading) return;
    setAttachmentLoading(true);
    setAttachmentError(null);
    setAttachmentRetry({ kind: "file", file });

    try {
      const imported = await importPlanFile(file);
      const contextLimit = activeSession ? 24000 : 18000;
      const safeText =
        imported.text.length > contextLimit
          ? `${imported.text.slice(0, contextLimit)}\n\n[Texto cortado pelo limite de contexto. Se precisar, peça o restante do arquivo antes de concluir.]`
          : imported.text;
      const text = [
        `Arquivo anexado no chat do app: ${imported.fileName}`,
        imported.warning ? `Aviso: ${imported.warning}` : "",
        "Texto extraído:",
        safeText,
      ].filter(Boolean).join("\n\n");
      const payload: PendingChatMessage = activeSession
        ? { kind: "session", sessionId: activeSession.id, text }
        : { kind: "oracle", context: `arquivo:${location.pathname}`, text };
      setAttachmentLoading(false);
      sendAttachmentPayload(payload);
    } catch (error) {
      setAttachmentLoading(false);
      setAttachmentError(recoverableFeedback(
        error,
        "Não consegui ler este arquivo.",
        "Nada foi enviado ou gravado. Confira o formato e tente novamente.",
        "ORACLE_ATTACHMENT_READ_FAILED",
      ));
    }
  }

  function retryAttachment() {
    if (!attachmentRetry) return;
    if (attachmentRetry.kind === "file") void processAttachment(attachmentRetry.file);
    else sendAttachmentPayload(attachmentRetry.payload);
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    void processAttachment(file);
  }

  function confirmProposal(sessionId: string) {
    if (confirmingSessionId || abandoningSessionId) return;
    setConfirmationError(null);
    setAbandonError(null);
    setConfirmingSessionId(sessionId);
    dispatch({
      type: "confirm_session_proposal",
      sessionId,
      onSuccess: (result) => {
        setConfirmingSessionId(null);
        setProposalSuccess(result);
        setProposalNotice(null);
        setAdjustingSessionId(null);
        setDiscardConfirmSessionId(null);
      },
      onError: (errorMessage) => {
        setConfirmingSessionId(null);
        setConfirmationError(recoverableFeedback(
          errorMessage,
          "Não consegui gravar esta proposta.",
          "A proposta continua disponível e nada foi perdido. Tente novamente.",
          "SESSION_PROPOSAL_CONFIRM_FAILED",
        ));
      },
    });
  }

  function abandonProposal(sessionId: string) {
    if (confirmingSessionId || abandoningSessionId) return;
    setConfirmationError(null);
    setAbandonError(null);
    setAbandoningSessionId(sessionId);
    dispatch({
      type: "abandon_session",
      sessionId,
      onSuccess: () => {
        setAbandoningSessionId(null);
        setDiscardConfirmSessionId(null);
        setAdjustingSessionId(null);
        setProposalNotice("Proposta descartada. Nenhum dado foi gravado.");
      },
      onError: (errorMessage) => {
        setAbandoningSessionId(null);
        setAbandonError(recoverableFeedback(
          errorMessage,
          "Não consegui descartar esta proposta.",
          "A proposta continua disponível. Tente novamente ou siga ajustando pela conversa.",
          "SESSION_PROPOSAL_ABANDON_FAILED",
        ));
      },
    });
  }

  function beginProposalAdjustment(sessionId: string) {
    setConfirmationError(null);
    setAbandonError(null);
    setProposalNotice(null);
    setDiscardConfirmSessionId(null);
    setAdjustingSessionId(sessionId);
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
  }

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setConfirmationError(null);
    setAbandonError(null);
    setProposalSuccess(null);
    setProposalNotice(null);
    setAdjustingSessionId(null);
    setDiscardConfirmSessionId(null);
  }

  function openConfirmedDocument() {
    setMode("minimized");
    navigate(confirmedDocument ? `/documentos/${confirmedDocument.id}/imprimir` : "/documentos");
  }

  function runWeeklyReview() {
    dispatch({
      type: "add_chat_message",
      message: { id: createMessageId("oracle"), author: "oracle", text: generateWeeklyReview(state) },
    });
  }

  function saveEvidence() {
    const text = evidenceText.trim();
    if (!text || !selectedObjectiveId) return;
    dispatch({
      type: "add_evidence",
      evidence: {
        id: `ev-${Date.now()}`,
        objectiveId: selectedObjectiveId,
        text,
        date: new Date().toISOString().slice(0, 10),
      },
    });
    dispatch({
      type: "add_chat_message",
      message: {
        id: createMessageId("user"),
        author: "user",
        text: `Registrar evidência: ${text}`,
      },
    });
    dispatch({
      type: "add_chat_message",
      message: {
        id: createMessageId("oracle"),
        author: "oracle",
        text: `Registrado em ${selectedObjective?.title ?? "objetivo selecionado"}. Agora essa evolução fica rastreável.`,
      },
    });
    setEvidenceText("");
    setEvidenceOpen(false);
  }

  if (mode === "minimized") {
    return (
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setMode("normal")}
        className="fixed right-[4.25rem] top-1.5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#0B6B5C] bg-[#075E54] text-white shadow-card transition sm:right-0 sm:top-1/2 sm:h-16 sm:w-11 sm:-translate-y-1/2 sm:rounded-l-2xl sm:rounded-r-none sm:border-r-0 sm:shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:hover:w-12"
        aria-label="Abrir Oráculo"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <Sparkles className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[#075E54] bg-[#25D366]" />
        </span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Oráculo"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setMode("minimized");
        }
      }}
      className={[
        "oracle-panel-frame fixed z-40 transition-[max-width] duration-200 motion-reduce:transition-none",
        mode === "expanded" ? "max-w-[560px]" : "max-w-[420px]",
      ].join(" ")}
    >
      <div className="flex h-full rounded-[34px] border border-[#D5D5DA] bg-[#111] p-2 shadow-[0_22px_70px_rgba(0,0,0,0.25)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-[#E9E0D2]">
          <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
                O
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#075E54] bg-[#25D366]" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Oráculo</h2>
                <p className="truncate text-xs text-white/75">
                  {activeSession
                    ? `${SESSION_TYPE_LABEL[activeSession.type]} em andamento`
                    : `IA Estratégica · ${state.organization?.name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode(mode === "expanded" ? "normal" : "expanded")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={mode === "expanded" ? "Voltar ao normal" : "Expandir"}
              >
                {mode === "expanded" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMode("minimized")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar Oráculo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {activeSession ? (
            <div className="space-y-2 border-b border-black/5 bg-[#075E54] px-4 pb-3 text-white">
              {availableSessions.length > 1 ? (
                <label className="block">
                  <span className="sr-only">Condução atual</span>
                  <select
                    aria-label="Condução atual"
                    value={activeSession.id}
                    onChange={(event) => selectSession(event.target.value)}
                    className="h-8 w-full rounded-control border border-white/25 bg-white/10 px-2 text-xs font-medium text-white outline-none focus:border-white"
                  >
                    {availableSessions.map((session) => {
                      const area = session.areaId ? state.areas.find((item) => item.id === session.areaId)?.name : "Empresa inteira";
                      return (
                        <option key={session.id} value={session.id} className="text-text">
                          {SESSION_TYPE_LABEL[session.type]} · {area || "Área"} · {session.period}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
              <div>
                <p className="truncate text-xs font-semibold">{SESSION_TYPE_LABEL[activeSession.type]}</p>
                <p className="truncate text-[11px] text-white/75">
                  {state.organization?.name} · {activeArea?.name ?? "Empresa inteira"} · {activeSession.period}
                </p>
                <p className="truncate text-[11px] text-white/75">
                  {PHASE_LABEL[activeSession.phase] ?? "Condução"} · etapa {phaseIndex + 1} de {phases.length || 1}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${phaseProgress}%` }} />
              </div>
            </div>
          ) : null}

          <div ref={messagesListRef} tabIndex={0} aria-label="Mensagens do Oráculo" className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-4">
            {!visibleMessages.length ? (
              <div className="mx-auto mt-4 max-w-[280px] rounded-xl border border-black/5 bg-white/80 px-3 py-3 text-center shadow-sm">
                <p className="text-sm font-semibold text-[#1D1D1F]">
                  {activeSession ? "Condução pronta para continuar" : "Comece uma conversa com o Oráculo"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#5F6368]">
                  {activeSession
                    ? "Escreva sua resposta ou anexe um plano para seguir deste ponto."
                    : "Conte o que você quer planejar, revisar ou atualizar."}
                </p>
              </div>
            ) : null}
            {visibleMessages.map((chatMessage) => (
              <div
                key={chatMessage.id}
                className={[
                  "max-w-[84%] rounded-xl px-3 py-2 text-[13px] leading-5 shadow-sm",
                  chatMessage.author === "oracle"
                    ? "mr-auto rounded-tl-sm bg-white text-[#1D1D1F]"
                    : "ml-auto rounded-tr-sm bg-[#DCF8C6] text-[#1D1D1F]",
                ].join(" ")}
              >
                {chatMessage.text.startsWith("Arquivo anexado no chat do app:") ? (
                  <AttachmentReceipt value={chatMessage.text} />
                ) : (
                  <ReadableText value={chatMessage.text} className="space-y-1 text-[13px] leading-5" />
                )}
              </div>
            ))}
          </div>

          {proposalSuccess ? (
            <div className="border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <div role="status" className="rounded-card border border-status-success/25 bg-status-success-bg p-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text">{proposalSuccess.replayed ? "Registro já estava gravado" : "Registro gravado"}</p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      {confirmedDocument
                        ? `${confirmedDocument.title} (v${confirmedDocument.version}) está salvo em Documentos.`
                        : proposalSuccess.reply}
                    </p>
                    <Button className="mt-2" size="sm" variant="secondary" icon={FileText} onClick={openConfirmedDocument}>
                      {confirmedDocument ? "Abrir documento" : "Abrir Documentos"}
                    </Button>
                  </div>
                  <button type="button" onClick={() => setProposalSuccess(null)} className="rounded-control p-1 text-text-secondary hover:bg-white" aria-label="Fechar confirmação">
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {proposalNotice && !activeSession?.pendingProposal ? (
            <div className="border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <InlineFeedback tone="success" title={proposalNotice} description="Você pode iniciar ou retomar outra condução quando quiser." />
            </div>
          ) : null}

          {activeSession?.pendingProposal && !proposalSuccess ? (
            <div className="border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <div className="rounded-card border border-border bg-surface/95 p-3 shadow-card">
                <p className="text-sm font-semibold text-text">
                  {adjustingSessionId === activeSession.id ? "Ajustando a proposta" : "Pronto para conferir"}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {proposalTitle(activeSession.pendingProposal)} · {activeArea?.name ?? "Empresa inteira"} · {activeSession.period}
                </p>
                <ProposalPreview proposal={activeSession.pendingProposal} />
                {confirmationError ? (
                  <InlineFeedback
                    className="mt-3"
                    tone="error"
                    title={confirmationError.title}
                    description="Sua proposta continua pronta e nada foi duplicado."
                    occurrenceId={confirmationError.occurrenceId}
                    actionLabel="Tentar novamente"
                    onAction={() => confirmProposal(activeSession.id)}
                    actionLoading={confirmingSessionId === activeSession.id}
                  />
                ) : null}
                {abandonError ? (
                  <InlineFeedback
                    className="mt-3"
                    tone="error"
                    title={abandonError.title}
                    description={abandonError.description}
                    occurrenceId={abandonError.occurrenceId}
                    actionLabel="Tentar novamente"
                    onAction={() => abandonProposal(activeSession.id)}
                    actionLoading={abandoningSessionId === activeSession.id}
                  />
                ) : null}

                {discardConfirmSessionId === activeSession.id ? (
                  <div role="alert" className="mt-3 rounded-card border border-status-warning/25 bg-status-warning-bg p-3">
                    <p className="text-sm font-semibold text-text">Descartar este rascunho?</p>
                    <p className="mt-1 text-xs text-text-secondary">A proposta será encerrada sem gravar dados.</p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setDiscardConfirmSessionId(null)}>Manter proposta</Button>
                      <Button variant="danger" size="sm" loading={abandoningSessionId === activeSession.id} onClick={() => abandonProposal(activeSession.id)}>Descartar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      loading={confirmingSessionId === activeSession.id}
                      disabled={abandoningSessionId === activeSession.id || adjustingSessionId === activeSession.id}
                      onClick={() => confirmProposal(activeSession.id)}
                    >
                      Confirmar e gravar
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={confirmingSessionId === activeSession.id || abandoningSessionId === activeSession.id}
                        onClick={() => beginProposalAdjustment(activeSession.id)}
                      >
                        Ajustar
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        className="w-full"
                        disabled={confirmingSessionId === activeSession.id || abandoningSessionId === activeSession.id}
                        onClick={() => setDiscardConfirmSessionId(activeSession.id)}
                      >
                        Descartar proposta
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {isDashboard && !activeSession && !proposalSuccess ? (
            <div className="space-y-3 border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((current) => !current)}
                  className="h-11 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] shadow-sm transition hover:bg-[#F7F7F7]"
                >
                  Registrar evidência
                </button>
                <button
                  type="button"
                  onClick={runWeeklyReview}
                  className="h-11 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] shadow-sm transition hover:bg-[#F7F7F7]"
                >
                  Revisão semanal
                </button>
              </div>
              {evidenceOpen ? (
                <div className="space-y-2 rounded-2xl bg-white/80 p-3 shadow-sm">
                  <select
                    value={selectedObjectiveId}
                    onChange={(event) => setSelectedObjectiveId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                  >
                    {!state.objectives.length ? <option value="">Nenhum objetivo disponível</option> : null}
                    {state.objectives.map((objective) => (
                      <option key={objective.id} value={objective.id}>
                        {objective.title}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={evidenceText}
                    onChange={(event) => setEvidenceText(event.target.value)}
                    rows={3}
                    placeholder="O que prova o avanço?"
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <Button className="w-full bg-[#25D366] hover:bg-[#20BD5A]" onClick={saveEvidence} disabled={!evidenceText.trim() || !selectedObjectiveId}>
                    Salvar evidência
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="oracle-panel-composer border-t border-black/5 bg-[#F0F0F0] px-3 pt-3">
            {attachmentError ? (
              <InlineFeedback
                className="mb-2"
                tone="error"
                title={attachmentError.title}
                description={attachmentError.description}
                occurrenceId={attachmentError.occurrenceId}
                actionLabel="Tentar novamente"
                onAction={retryAttachment}
                actionLoading={attachmentLoading}
              />
            ) : null}
            {sendingMessage ? (
              <InlineFeedback className="mb-2" tone="info" title="Oráculo está pensando" description="Sua mensagem continua preservada até a resposta chegar." />
            ) : null}
            {messageError ? (
              <InlineFeedback
                className="mb-2"
                tone="error"
                title={messageError.title}
                description={messageError.description}
                occurrenceId={messageError.occurrenceId}
                actionLabel="Tentar novamente"
                onAction={failedMessage ? () => sendChatMessage(failedMessage) : undefined}
                actionLoading={sendingMessage}
              />
            ) : null}
            <form onSubmit={submitMessage} className="flex items-center gap-2">
              <input ref={attachmentInputRef} className="sr-only" type="file" accept={PLAN_FILE_ACCEPT} onChange={handleAttachmentChange} aria-label="Selecionar arquivo para o Oráculo" />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#5F6368] shadow-sm transition hover:bg-[#F7F7F7] disabled:cursor-wait disabled:opacity-60"
                disabled={attachmentLoading}
                aria-label="Anexar arquivo"
                title="Anexar PDF, PPTX, DOCX ou TXT"
              >
                {attachmentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <input
                ref={messageInputRef}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (!sendingMessage) {
                    setMessageError(null);
                    setFailedMessage(null);
                  }
                }}
                placeholder={adjustingSessionId === activeSession?.id ? "O que você quer mudar?" : activeSession ? "Responda à condução do Oráculo" : "Escreva para o Oráculo"}
                className="h-11 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-sm text-[#1D1D1F]"
              />
              <button
                type="submit"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:bg-[#20BD5A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!message.trim() || sendingMessage}
                aria-busy={sendingMessage || undefined}
                aria-label="Enviar mensagem"
              >
                {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
