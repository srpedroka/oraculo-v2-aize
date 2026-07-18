import { describe, expect, it } from "vitest";
import {
  matchingQuarterlyObjective,
  monthlyCapacityDecisionEnvelope,
  monthlyExperiencedActionsChallengeEnvelope,
  monthlyInheritedPendingEnvelope,
  parseCompleteMonthlyReadyBlock,
  parseInheritedMonthlyPendingBlock,
} from "./monthly-ready-block.ts";
import { normalizeProposalConfirmationEnvelope, validateAdaptiveEnvelope } from "./session-adaptive.ts";
import { validateMonthlyGuidanceEnvelope } from "./monthly-guidance.ts";

const completeBlock = `Dados concretos adicionais confirmados pelo gestor sintetico para fechar Jul 2027:
- Objetivo mensal: elevar oportunidades com proxima acao de 40% para 55% ate 31/07/2027; fonte relatorio semanal; responsavel PERSON_FIXTURE_MANAGER; vinculo ao objetivo trimestral de qualidade do funil.
- Acao 1: publicar checklist ate 05/07, criterio checklist aprovado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 2: treinar aprovadores ate 10/07, criterio todos os aprovadores presentes; responsavel PERSON_FIXTURE_MANAGER.
- Acao 3: auditar vinte casos ate 20/07, criterio relatorio publicado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 4: corrigir duas causas principais ate 25/07, criterio correcoes validadas; responsavel PERSON_FIXTURE_MANAGER.
- Acao 5: revisar indicador ate 31/07, criterio fechamento registrado; responsavel PERSON_FIXTURE_MANAGER.
- Acompanhamento semanal. Confianca amarela. Bloqueio principal: adesao da equipe. As demais demandas ficam no backlog do mes.`;

const inheritedBlock = `Decisao concreta do gestor para completar o plano mensal:
- Rolar a integracao do CRM para Jul 2027, preservando a origem de Jun 2027 e registrando dependencia do fornecedor como motivo.
- Novo prazo: 20/07/2027. Responsavel: PERSON_FIXTURE_MANAGER. Criterio: integracao validada em ambiente produtivo e aceite registrado.
- Resultado mensal vinculado ao trimestre: elevar oportunidades com proxima acao de 40% para 55%; fonte relatorio semanal.`;

const experiencedActionList = `Informacoes confirmadas para este caso:
- Acao um: publicar padrao do funil ate dia cinco.
- Acao dois: revisar carteira ativa ate dia quinze.
- Acao tres: auditar vinte oportunidades ate dia vinte e cinco.
- O acompanhamento sera semanal, com confianca e bloqueio.`;

const experiencedConversation = `manager: Para este mes, quero elevar oportunidades de quarenta para cinquenta e cinco por cento. Tenho tres acoes com datas e criterios completos.
oracle: Quais sao as tres acoes, com dono, prazo e criterio de conclusao?`;

describe("complete monthly ready block Q4V", () => {
  it("extracts a complete capacity choice without inventing fields", () => {
    const parsed = parseCompleteMonthlyReadyBlock(completeBlock, "Jul 2027");

    expect(parsed).toMatchObject({
      result: "Elevar oportunidades com proxima acao de 40% para 55%",
      metric: "oportunidades com proxima acao",
      current: "40%",
      target: "55%",
      source: "relatorio semanal",
      deadline: "2027-07-31",
      owner: "PERSON_FIXTURE_MANAGER",
      quarterlyLinkHint: "qualidade do funil",
      cadence: "Semanal",
      confidence: "amarela",
      blocker: "Adesao da equipe",
      backlog: "As demais demandas ficam no backlog do mes",
    });
    expect(parsed?.actions).toHaveLength(5);
    expect(parsed?.actions[0]).toEqual({
      description: "Publicar checklist",
      completionCriterion: "Checklist aprovado",
      deadline: "2027-07-05",
      owner: "PERSON_FIXTURE_MANAGER",
    });
  });

  it("does not activate for an incomplete block or a deadline outside the month", () => {
    expect(parseCompleteMonthlyReadyBlock("Objetivo mensal: elevar adoção de 40% para 55%.", "Jul 2027")).toBeNull();
    expect(parseCompleteMonthlyReadyBlock(completeBlock.replace("05/07", "05/08"), "Jul 2027")).toBeNull();
  });

  it("links only one safe quarterly candidate", () => {
    const candidate = { id: "q-1", title: "Elevar qualidade do funil comercial", period: "T3 2027" };
    expect(matchingQuarterlyObjective("qualidade do funil", [candidate])).toEqual(candidate);
    expect(matchingQuarterlyObjective("qualidade do funil", [candidate, { id: "q-2", title: "Qualidade do funil de parceiros" }])).toBeNull();
    expect(matchingQuarterlyObjective("funil", [candidate])).toBeNull();
  });

  it("challenges overload with the previous overcommitment and one actionable question", () => {
    const message = [
      "A equipe tem capacidade estimada para cinco acoes relevantes.",
      "Tres acoes contribuem diretamente para o objetivo trimestral; duas reduzem risco operacional.",
      "As demais podem ser adiadas sem comprometer a meta do trimestre.",
    ].join("\n");
    const envelope = monthlyCapacityDecisionEnvelope(
      { type: "monthly" },
      message,
      "Mes anterior terminou com sete acoes abertas por excesso de compromisso.",
    ) as any;

    expect(envelope.reply).toContain("sete ações abertas por excesso de compromisso");
    expect(envelope.reply).toContain("três ações ligadas ao objetivo trimestral e duas para reduzir risco");
    expect(envelope.reply.match(/\?/g)).toHaveLength(1);
    expect(envelope.state_patch._adaptive).toMatchObject({ readiness: "partial", blocking_gap: "cinco ações prioritárias executáveis" });
    expect(envelope.proposal).toBeUndefined();
    expect(validateAdaptiveEnvelope({
      envelope,
      sessionType: "monthly",
      currentPhase: "abertura",
      phases: ["abertura", "relembrar", "resultados_do_mes", "acoes_chave", "capacidade", "sintese"],
      sessionState: {},
      previousOracleReply: "Qual resultado precisa mudar?",
      userMessage: message,
    })).toEqual([]);
  });

  it("extracts a complete inherited pending decision without asking for another action", () => {
    expect(parseInheritedMonthlyPendingBlock(inheritedBlock, "Jul 2027")).toEqual({
      item: "integracao do CRM",
      origin: "Jun 2027",
      reason: "dependencia do fornecedor",
      deadline: "2027-07-20",
      owner: "PERSON_FIXTURE_MANAGER",
      completionCriterion: "integracao validada em ambiente produtivo e aceite registrado",
      resultBase: "elevar oportunidades com proxima acao",
      metric: "oportunidades com proxima acao",
      current: "40%",
      target: "55%",
      source: "relatorio semanal",
    });
    expect(parseInheritedMonthlyPendingBlock(inheritedBlock, "Ago 2027")).toBeNull();
  });

  it("builds a valid proposal when exactly one quarterly parent exists", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      is: async () => ({
        data: [{ id: "quarterly-1", title: "Elevar qualidade do funil comercial", period: "T3 2027" }],
        error: null,
      }),
    };
    const envelope = await monthlyInheritedPendingEnvelope(
      { from: () => query },
      { type: "monthly", period: "Jul 2027", org_id: "org-1", area_id: "area-1" },
      inheritedBlock,
    );
    const normalized = normalizeProposalConfirmationEnvelope(envelope as any, "monthly") as any;

    expect(normalized.proposal).toMatchObject({
      type: "save_monthly_plan",
      pendingDecisions: [{
        item: "integracao do CRM",
        origin: "Jun 2027",
        reason: "dependencia do fornecedor",
        decision: "roll",
      }],
      blockers: ["Dependencia do fornecedor"],
      objectives: [{
        result: "Elevar oportunidades com proxima acao de 40% para 55%",
        linkedQuarterlyObjectiveId: "quarterly-1",
        actions: [{ deadline: "2027-07-20", owner: "PERSON_FIXTURE_MANAGER" }],
      }],
    });
    expect(validateMonthlyGuidanceEnvelope({
      envelope: normalized,
      sessionPeriod: "Jul 2027",
      userMessage: inheritedBlock,
    })).toEqual([]);
  });

  it("challenges capacity once after an experienced manager lists the actions", () => {
    const envelope = monthlyExperiencedActionsChallengeEnvelope(
      { type: "monthly", period: "Jul 2027" },
      experiencedActionList,
      experiencedConversation,
    ) as any;

    expect(envelope).toMatchObject({
      next_phase: "capacidade",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          blocking_gap: "teste de capacidade e renuncia",
        },
      },
    });
    expect(envelope.reply).toMatch(/capacidade real do time/i);
    expect(envelope.reply).toMatch(/backlog/i);
  });

  it("does not repeat the capacity challenge or intercept a complete block", () => {
    expect(monthlyExperiencedActionsChallengeEnvelope(
      { type: "monthly", period: "Jul 2027" },
      experiencedActionList,
      `${experiencedConversation}\noracle: Elas cabem na capacidade real do time, e o que fica no backlog?`,
    )).toBeNull();
    expect(monthlyExperiencedActionsChallengeEnvelope(
      { type: "monthly", period: "Jul 2027" },
      completeBlock,
      experiencedConversation,
    )).toBeNull();
  });
});
