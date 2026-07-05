import { Loader2, Maximize2, Minimize2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { importPlanFile, PLAN_FILE_ACCEPT } from "../lib/fileImport";
import { createMessageId, generateWeeklyReview } from "../lib/oracle";
import { useAppState } from "../state/store";
import { Button } from "./ui/Button";

const SESSION_TYPE_LABEL = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento do Mês",
  quarter_close: "Fechamento do Trimestre",
};

const SESSION_PHASES = {
  strategic: ["abertura", "direcionadores", "swot", "tema_do_ano", "objetivos", "projetos", "rituais", "sintese"],
  quarterly: ["abertura", "alinhamento", "anual_da_area", "diagnostico", "objetivos_do_trimestre", "foco_de_aprendizado", "sintese"],
  monthly: ["abertura", "relembrar", "objetivos_do_mes", "acoes_chave", "realismo", "sintese"],
  month_close: ["abertura", "revisao", "pendencias", "resumo", "ponte"],
  quarter_close: ["abertura", "revisao_trimestre", "aprendizado_do_time", "balanco"],
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
  resumo: "Resumo",
  ponte: "Ponte",
  revisao_trimestre: "Revisão do trimestre",
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
    <div className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-2xl border border-black/10 bg-white p-3 text-[12px] leading-5 text-[#5F6368]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A7D82]">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-[#1D1D1F]">Plano Estratégico {asText(proposal.year)}</p>
        <p className="text-[12px] text-[#7A7D82]">
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
                {meta.length ? <p className="mt-1 text-[11px] text-[#7A7D82]">{meta.join(" · ")}</p> : null}
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
              <p className="mt-1 text-[11px] text-[#7A7D82]">
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
  const learningFocus = asTextArray(proposal.learningFocus ?? proposal.foco_aprendizado);

  return (
    <div className="mt-3 max-h-[42vh] space-y-3 overflow-auto rounded-2xl border border-black/10 bg-white p-3 text-[12px] leading-5 text-[#5F6368]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A7D82]">Prévia do que será gravado</p>
        <p className="mt-1 text-base font-semibold text-[#1D1D1F]">Plano Trimestral {asText(proposal.period)}</p>
        <p className="text-[12px] text-[#7A7D82]">
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
              <p className="mt-1 text-[11px] text-[#7A7D82]">
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
                <p className="mt-1 text-[11px] text-[#7A7D82]">
                  {[
                    asText(objective.metric) ? `Indicador: ${asText(objective.metric)}` : "",
                    asText(objective.target) ? `Meta: ${asText(objective.target)}` : "",
                    asText(objective.owner) ? `Dono: ${asText(objective.owner)}` : "",
                    asText(objective.parentTitle) ? `Vínculo anual: ${asText(objective.parentTitle)}` : "",
                  ].filter(Boolean).join(" · ") || "Sem indicador, meta, dono ou vínculo explícitos no arquivo."}
                </p>
                <ChipList items={deliverables} />
              </div>
            );
          })}
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

export function OraclePanel() {
  const { state, dispatch } = useAppState();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(state.objectives[0]?.id ?? "");
  const [evidenceText, setEvidenceText] = useState("");
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // Trava o botao de confirmar enquanto a gravacao esta em voo, evitando duplo submit.
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mode = state.ui.oracleMode;
  const isDashboard = location.pathname === "/";
  const activeSession = state.activeSession;
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

  // Libera o botao quando a proposta e aplicada/descartada (pendingProposal some) ou troca a sessao.
  useEffect(() => {
    if (!activeSession?.pendingProposal) setConfirmingSessionId(null);
  }, [activeSession?.id, activeSession?.pendingProposal]);

  useEffect(() => {
    function syncNarrowMode() {
      if (window.innerWidth < 1024 && state.ui.oracleMode === "normal") {
        dispatch({ type: "set_oracle_mode", mode: "minimized" });
      }
    }

    syncNarrowMode();
    window.addEventListener("resize", syncNarrowMode);
    return () => window.removeEventListener("resize", syncNarrowMode);
  }, [dispatch, state.ui.oracleMode]);

  useEffect(() => {
    if (mode === "minimized") return;
    const frame = window.requestAnimationFrame(() => {
      const messagesList = messagesListRef.current;
      if (messagesList) messagesList.scrollTop = messagesList.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSession?.id, activeSession?.phase, mode, state.chatMessages.length]);

  function setMode(nextMode: typeof mode) {
    dispatch({ type: "set_oracle_mode", mode: nextMode });
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    if (activeSession) {
      dispatch({ type: "send_session_message", sessionId: activeSession.id, text });
      setMessage("");
      return;
    }
    dispatch({ type: "send_oracle_message", text, context: location.pathname });
    setMessage("");
  }

  async function processAttachment(file: File | undefined) {
    if (!file) return;
    setAttachmentLoading(true);
    setAttachmentError(null);

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

      if (activeSession) {
        dispatch({ type: "send_session_message", sessionId: activeSession.id, text });
      } else {
        dispatch({ type: "send_oracle_message", text, context: `arquivo:${location.pathname}` });
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Não consegui ler esse arquivo.");
    } finally {
      setAttachmentLoading(false);
    }
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    void processAttachment(file);
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
        type="button"
        onClick={() => setMode("normal")}
        className="fixed right-0 top-1/2 z-40 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-[#0B6B5C] bg-[#075E54] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:w-12"
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
      className={[
        "fixed bottom-4 right-4 top-4 z-40 w-[calc(100vw-2rem)] transition-[max-width] duration-200",
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
                    ? `Conduzindo ${SESSION_TYPE_LABEL[activeSession.type]} · ${PHASE_LABEL[activeSession.phase] ?? activeSession.phase} · ${activeSession.period}`
                    : `IA Estratégica · ${state.organization?.name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode(mode === "expanded" ? "normal" : "expanded")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={mode === "expanded" ? "Voltar ao normal" : "Expandir"}
              >
                {mode === "expanded" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMode("minimized")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar Oráculo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {activeSession ? (
            <div className="border-b border-black/5 bg-[#075E54] px-4 pb-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${phaseProgress}%` }} />
              </div>
            </div>
          ) : null}

          <div ref={messagesListRef} className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-4">
            {state.chatMessages.map((chatMessage) => (
              <div
                key={chatMessage.id}
                className={[
                  "max-w-[84%] rounded-xl px-3 py-2 text-[13px] leading-5 shadow-sm",
                  chatMessage.author === "oracle"
                    ? "mr-auto rounded-tl-sm bg-white text-[#1D1D1F]"
                    : "ml-auto rounded-tr-sm bg-[#DCF8C6] text-[#1D1D1F]",
                ].join(" ")}
              >
                <p>{chatMessage.text}</p>
              </div>
            ))}
          </div>

          {activeSession?.pendingProposal ? (
            <div className="border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <div className="rounded-2xl bg-white/90 p-3 shadow-sm">
                <p className="text-sm font-semibold text-[#1D1D1F]">Pronto para gravar</p>
                <p className="mt-1 text-xs leading-5 text-[#5F6368]">
                  {proposalTitle(activeSession.pendingProposal)} preparado. Confirme para salvar no sistema ou peça ajustes na conversa.
                </p>
                <StrategicProposalPreview proposal={activeSession.pendingProposal} />
                <QuarterlyProposalPreview proposal={activeSession.pendingProposal} />
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    className="w-full bg-[#25D366] hover:bg-[#20BD5A]"
                    disabled={confirmingSessionId === activeSession.id}
                    onClick={() => {
                      if (confirmingSessionId === activeSession.id) return;
                      setConfirmingSessionId(activeSession.id);
                      dispatch({ type: "confirm_session_proposal", sessionId: activeSession.id });
                    }}
                  >
                    {confirmingSessionId === activeSession.id ? "Gravando…" : "Confirmar e gravar"}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={confirmingSessionId === activeSession.id}
                      onClick={() => setMessage("Quero ajustar: ")}
                    >
                      Ajustar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={confirmingSessionId === activeSession.id}
                      onClick={() => dispatch({ type: "abandon_session", sessionId: activeSession.id })}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isDashboard ? (
            <div className="space-y-3 border-t border-black/5 bg-[#EFEAE2] px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((current) => !current)}
                  className="h-9 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] shadow-sm transition hover:bg-[#F7F7F7]"
                >
                  Registrar evidência
                </button>
                <button
                  type="button"
                  onClick={runWeeklyReview}
                  className="h-9 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] shadow-sm transition hover:bg-[#F7F7F7]"
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

          <div className="border-t border-black/5 bg-[#F0F0F0] px-3 py-3">
            {attachmentError ? <p className="mb-2 px-1 text-xs leading-5 text-[#B42318]">{attachmentError}</p> : null}
            <form onSubmit={submitMessage} className="flex items-center gap-2">
              <input ref={attachmentInputRef} className="sr-only" type="file" accept={PLAN_FILE_ACCEPT} onChange={handleAttachmentChange} />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#5F6368] shadow-sm transition hover:bg-[#F7F7F7] disabled:cursor-wait disabled:opacity-60"
                disabled={attachmentLoading}
                aria-label="Anexar arquivo"
                title="Anexar PDF, PPTX, DOCX ou TXT"
              >
                {attachmentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={activeSession ? "Responda à condução do Oráculo" : "Escreva para o Oráculo"}
                className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-sm text-[#1D1D1F]"
              />
              <button
                type="submit"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:bg-[#20BD5A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!message.trim()}
                aria-label="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
