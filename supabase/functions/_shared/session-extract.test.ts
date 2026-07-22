import { describe, expect, it } from "vitest";
import {
  extractionFailureReply,
  extractionUsageMetadata,
  parsePlanningSessionStructure,
  PLANNING_SESSION_STRUCTURE_OUTPUT,
  planningProseText,
  PROSE_ONLY_CONTRACT,
  SESSION_EXTRACTION_PROMPT,
  sessionExtractionMessage,
} from "./session-extract.ts";

describe("session prose split", () => {
  it("keeps reply out of the structural schema", () => {
    expect(PLANNING_SESSION_STRUCTURE_OUTPUT.schema.required).toEqual([
      "state_patch",
      "next_phase",
      "proposal",
      "done",
    ]);
    expect(PLANNING_SESSION_STRUCTURE_OUTPUT.schema.properties).not.toHaveProperty("reply");
    expect(PROSE_ONLY_CONTRACT).toContain("sem JSON");
    expect(SESSION_EXTRACTION_PROMPT).toContain("extrator estrutural");
  });

  it("accepts natural prose and unwraps a legacy reply safely", () => {
    expect(planningProseText("Qual resultado precisa mudar primeiro?")).toBe("Qual resultado precisa mudar primeiro?");
    expect(planningProseText(JSON.stringify({ reply: "Vamos fechar o foco." }))).toBe("Vamos fechar o foco.");
  });

  it("builds a bounded extraction payload with explicit sources", () => {
    const payload = JSON.parse(sessionExtractionMessage({
      sessionType: "quarterly",
      period: "T3 2026",
      currentPhase: "diagnostico",
      allowedPhases: ["diagnostico", "sintese"],
      state: { objetivo: "Aumentar conversao" },
      userMessage: "Diego assume ate setembro.",
      previousOracleReply: "Quem assume esse objetivo?",
      oracleReply: "Fechado. Qual evidencia vamos usar?",
      recentConversation: "gestor: Diego assume ate setembro.",
      planContext: "Objetivo anual: reorganizar Comercial",
      situationKind: "quarterly_focus",
    }));
    expect(payload.estado_anterior.objetivo).toBe("Aumentar conversao");
    expect(payload.mensagem_do_gestor).toContain("Diego");
    expect(payload.fala_anterior_do_oraculo).toContain("Quem assume");
    expect(payload.fases_permitidas).toEqual(["diagnostico", "sintese"]);
  });

  it("bounds oversized session state before sending it to the extractor", () => {
    const payload = JSON.parse(sessionExtractionMessage({
      sessionType: "monthly",
      period: "Ago 2026",
      currentPhase: "diagnostico",
      allowedPhases: ["diagnostico"],
      state: { material: "x".repeat(50_000) },
      userMessage: "Vamos seguir.",
      oracleReply: "Qual e o proximo compromisso?",
      planContext: "",
    }));
    expect(JSON.stringify(payload.estado_anterior).length).toBeLessThanOrEqual(40_040);
    expect(payload.estado_anterior).toHaveProperty("conteudo_parcial");
  });

  it("parses only safe structural values", () => {
    const parsed = parsePlanningSessionStructure(JSON.stringify({
      state_patch: { responsavel: "Diego" },
      next_phase: "sintese",
      proposal: null,
      done: false,
    }));
    expect(parsed.state_patch).toEqual({ responsavel: "Diego" });
    expect(() => parsePlanningSessionStructure(JSON.stringify({
      reply: "campo indevido",
      state_patch: {},
      next_phase: null,
      proposal: null,
      done: false,
    }))).toThrow("campo inesperado");
  });

  it("emits sanitized telemetry and a recoverable failure", () => {
    const metadata = extractionUsageMetadata({
      attempt: 2,
      latencyMs: 1234.6,
      repairReasons: ["invalid_json_envelope", "invalid_json_envelope"],
      sessionType: "monthly",
      channel: "whatsapp",
    });
    expect(metadata).toEqual({
      aiFunction: "background",
      action: "session_structure_extraction",
      extractionAttempt: 2,
      extractionLatencyMs: 1235,
      extractionRepairReasons: ["invalid_json_envelope"],
      extractionRepairCount: 1,
      sessionType: "monthly",
      channel: "whatsapp",
    });
    expect(JSON.stringify(metadata)).not.toMatch(/mensagem|reply|prompt|documento|telefone/i);
    expect(extractionFailureReply()).toContain("não consegui organizar os dados");
  });
});
