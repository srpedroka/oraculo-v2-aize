import { Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { createMessageId, generateWeeklyReview, respondToUserMessage } from "../lib/oracle";
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
};

function proposalTitle(proposal: Record<string, unknown> | null) {
  if (!proposal) return "";
  const type = String(proposal.type ?? "");
  if (type === "save_strategic_plan") return "Plano Estratégico";
  if (type === "save_quarterly_plan") return "Plano Trimestral";
  if (type === "save_monthly_plan") return "Plano Mensal";
  return "Proposta";
}

export function OraclePanel() {
  const { state, dispatch } = useAppState();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(state.objectives[0]?.id ?? "");
  const [evidenceText, setEvidenceText] = useState("");
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
    dispatch({
      type: "add_chat_message",
      message: { id: createMessageId("user"), author: "user", text },
    });
    if (state.aiSettings?.hasKey) {
      dispatch({ type: "send_oracle_message", text, context: location.pathname });
    } else {
      dispatch({
        type: "add_chat_message",
        message: { id: createMessageId("oracle"), author: "oracle", text: respondToUserMessage(text, state) },
      });
    }
    setMessage("");
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
                <h2 className="truncate text-sm font-semibold">
                  {activeSession ? SESSION_TYPE_LABEL[activeSession.type] : "Oráculo"}
                </h2>
                <p className="truncate text-xs text-white/75">
                  {activeSession ? `${PHASE_LABEL[activeSession.phase] ?? activeSession.phase} · ${activeSession.period}` : `IA Estratégica · ${state.organization?.name}`}
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

          <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-4">
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
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="bg-[#25D366] hover:bg-[#20BD5A]"
                    onClick={() => dispatch({ type: "confirm_session_proposal", sessionId: activeSession.id })}
                  >
                    Confirmar e gravar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setMessage("Quero ajustar: ")}>
                    Ajustar
                  </Button>
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

          <form onSubmit={submitMessage} className="flex items-center gap-2 border-t border-black/5 bg-[#F0F0F0] px-3 py-3">
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
    </aside>
  );
}
