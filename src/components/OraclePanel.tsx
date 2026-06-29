import { ChevronRight, Maximize2, Minimize2, Send, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { createMessageId, generateWeeklyReview, respondToUserMessage } from "../lib/oracle";
import { useAppState } from "../state/store";
import { Button } from "./ui/Button";

export function OraclePanel() {
  const { state, dispatch } = useAppState();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(state.objectives[0]?.id ?? "");
  const [evidenceText, setEvidenceText] = useState("");
  const mode = state.ui.oracleMode;
  const isDashboard = location.pathname === "/";

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
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-text shadow-card"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        Beto
        <span className="h-2 w-2 rounded-full bg-[#B42318]" />
      </button>
    );
  }

  return (
    <aside
      className={[
        "fixed bottom-4 right-4 top-4 z-30 flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-[width] duration-200 lg:static lg:min-h-screen lg:rounded-none lg:border-y-0 lg:border-r-0",
        mode === "expanded" ? "lg:w-[560px]" : "lg:w-[360px]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#ECECEF] text-sm font-semibold text-text">
            B
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-[#30D158]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text">Beto <span className="font-medium text-text-secondary">(IA Estratégica)</span></h2>
            <p className="text-xs text-text-tertiary">Oráculo da {state.organization?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            size="icon"
            icon={mode === "expanded" ? Minimize2 : Maximize2}
            onClick={() => setMode(mode === "expanded" ? "normal" : "expanded")}
            aria-label={mode === "expanded" ? "Voltar ao normal" : "Expandir"}
          />
          <Button variant="quiet" size="icon" icon={ChevronRight} onClick={() => setMode("minimized")} aria-label="Minimizar" />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {state.chatMessages.map((chatMessage) => (
          <div
            key={chatMessage.id}
            className={[
              "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6",
              chatMessage.author === "oracle"
                ? "mr-auto bg-[#F0F0F2] text-text"
                : "ml-auto bg-[#E8F2FF] text-text",
            ].join(" ")}
          >
            {chatMessage.text}
          </div>
        ))}
      </div>

      {isDashboard ? (
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEvidenceOpen((current) => !current)}>
              Registrar evidência
            </Button>
            <Button variant="ghost" className="flex-1" onClick={runWeeklyReview}>
              Revisão semanal
            </Button>
          </div>
          {evidenceOpen ? (
            <div className="space-y-2 rounded-2xl border border-border bg-[#FAFAFB] p-3">
              <select
                value={selectedObjectiveId}
                onChange={(event) => setSelectedObjectiveId(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
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
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
              <Button className="w-full" onClick={saveEvidence} disabled={!evidenceText.trim() || !selectedObjectiveId}>
                Salvar evidência
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submitMessage} className="flex gap-2 border-t border-border p-4">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Escreva para o Oráculo"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm"
        />
        <Button type="submit" size="icon" icon={Send} aria-label="Enviar mensagem" />
      </form>
      <div className="hidden">
        V2: a resposta determinística do painel será substituída por uma chamada ao modelo real, mantendo a régua determinística.
      </div>
    </aside>
  );
}
