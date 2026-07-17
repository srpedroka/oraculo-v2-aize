import type { ReferenceCase, ReferencePhase } from "./strategic-reference-cases.ts";

export type GenerativePhase = Extract<ReferencePhase, "Q2A" | "Q2B" | "Q2C" | "Q2D">;

export interface BaselineCheck {
  id: string;
  status: "pass" | "fail" | "not-applicable";
  evidence: string;
}

export interface BaselineRunSummary {
  phase: ReferencePhase;
  caseId: string;
  round: number;
  status: "measured" | "execution-error";
  qualityStatus?: "approved" | "blocked";
  rubricScores: Array<{ rubricId: string; score: number }>;
  criticalFailureCandidates: string[];
  failedChecks: string[];
  generationCostUsd: number;
  judgeCostUsd: number;
  latencyMs: number;
  defectClasses: string[];
  reportPath: string;
}

export function phaseRunStopReason(run: BaselineRunSummary) {
  if (run.status === "execution-error") return "erro tecnico registrado";
  if (run.qualityStatus === "blocked") return "gate de qualidade bloqueado";
  return null;
}

export interface RegressionDeterministicResult {
  caseId: string;
  status: "pass" | "fail" | "pending-human";
}

export interface RegressionComparisonInput {
  baselineRuns: BaselineRunSummary[];
  currentRuns: BaselineRunSummary[];
  baselineManagerTurns: Record<string, number>;
  currentManagerTurns: Record<string, number>;
  expectedRunKeys: string[];
  deterministic: RegressionDeterministicResult[];
  expectedDeterministicCaseIds: string[];
  coveredDeliveryIds: string[];
  expectedDeliveryIds: string[];
  cleanupFailures: string[];
  inputMismatches: string[];
  runtimeMismatches: string[];
  cumulativeCostUsd: number;
  authorizedLimitUsd: number;
  minimumPerRubric: number;
  minimumJointAverage: number;
  maximumRubricRegression: number;
  maximumMedianTurnIncreaseRatio: number;
}

export interface RegressionComparisonResult {
  status: "approved-automatic" | "blocked";
  reasons: string[];
  baseline: ReturnType<typeof aggregateBaseline>;
  current: ReturnType<typeof aggregateBaseline>;
  rubricComparison: Array<{
    rubricId: string;
    baselineAverage: number | null;
    currentAverage: number | null;
    delta: number | null;
  }>;
  managerTurns: {
    baselineMedian: number;
    currentMedian: number;
    increaseRatio: number | null;
  };
}

const SESSION_PROPOSAL_TYPES: Record<string, string> = {
  strategic: "save_strategic_plan",
  quarterly: "save_quarterly_plan",
  monthly: "save_monthly_plan",
  month_close: "month_close",
  quarter_close: "quarter_close",
  strategic_review: "apply_strategic_review",
};

const PHASE_TO_BLOCK: Record<ReferencePhase, string> = {
  Q2A: "tests/evals/strategic-quality/cases/q2a-annual.json",
  Q2B: "tests/evals/strategic-quality/cases/q2b-quarterly.json",
  Q2C: "tests/evals/strategic-quality/cases/q2c-monthly.json",
  Q2D: "tests/evals/strategic-quality/cases/q2d-reviews.json",
  Q2E: "tests/evals/strategic-quality/cases/q2e-information-outputs.json",
};

export function blockPathForPhase(phase: ReferencePhase): string {
  return PHASE_TO_BLOCK[phase];
}

export function expectedProposalType(item: ReferenceCase): string | null {
  return item.sessionType ? SESSION_PROPOSAL_TYPES[item.sessionType] ?? null : null;
}

export function isGenerativeCase(item: ReferenceCase): boolean {
  return Boolean(item.sessionType && item.expected.judgePolicy === "required");
}

export function expectedPeriod(item: ReferenceCase): string {
  if (item.sessionType === "strategic" || item.sessionType === "strategic_review") return "2027";
  if (item.sessionType === "quarterly") return "T3 2027";
  if (item.sessionType === "monthly") return "Jul 2027";
  if (item.sessionType === "month_close") return "Jun 2027";
  if (item.sessionType === "quarter_close") return "T2 2027";
  throw new Error(`${item.caseId}: caso sem periodo de sessao`);
}

export function buildManagerTurns(item: ReferenceCase): string[] {
  const confirmedFacts = [
    "Informacoes confirmadas para este caso sintetico:",
    ...item.input.facts.map((fact) => `- ${fact}`),
    `Contexto superior: ${item.input.upperLevelContext}`,
    "Use somente estas informacoes e o contexto cadastrado. Nao invente numero, pessoa, prazo, vinculo ou decisao.",
  ].join("\n");
  return [
    item.input.opening,
    confirmedFacts,
    executionSupplement(item),
    "Continue com a proxima pergunta realmente necessaria. Se os dados forem suficientes, apresente a sintese e a proposta final completa; nao crie dados para preencher lacunas.",
    "Considere tudo o que ja foi confirmado. Se ainda houver lacuna bloqueante, diga qual e pare nela; caso contrario, apresente agora a proposta final para uma unica confirmacao.",
  ];
}

function annualSupplement(item: ReferenceCase) {
  const specificObjective = item.riskId === "ANNUAL-ACTIVITY-AS-STRATEGY"
    ? "Objetivo 3: reduzir o fechamento de 12 para 5 dias e elevar areas com dados padronizados de 30% para 90% ate 31/10/2027; fontes: relatorio mensal e log de uso; responsavel: PERSON_FIXTURE_MANAGER; estrategias: padronizar processo e governanca de dados. Projeto vinculado: implantar sistema de gestao ate 30/06/2027, com aceite por integracao validada e 90% das areas treinadas."
    : item.riskId === "ANNUAL-REPEATED-GOAL"
      ? "Objetivo 3: elevar entregas no prazo de 81% para 95% ate 31/12/2027; fonte: relatorio de expedicao; responsavel: PERSON_FIXTURE_MANAGER; estrategias: planejar capacidade por gargalo e revisar fornecedores criticos mensalmente."
      : "Objetivo 3: elevar entregas no prazo de 82% para 94% ate 31/12/2027; fonte: relatorio de expedicao; responsavel: PERSON_FIXTURE_MANAGER; estrategias: planejar capacidade por gargalo e revisar fornecedores criticos.";
  return [
    "Dados concretos adicionais confirmados pelo gestor sintetico para completar o plano anual:",
    "- Perfil: empresa industrial B2B, receita anual atual de R$ 120 milhoes, margem operacional de 8% e capacidade de entrega limitada.",
    "- Proposito: simplificar operacoes criticas dos clientes. Visao: crescer com previsibilidade ate 2029. Valores: clareza, responsabilidade e melhoria continua.",
    "- SWOT: forcas equipe tecnica e carteira recorrente; fraquezas margem instavel e dados fragmentados; oportunidades padronizacao e expansao na carteira; ameacas gargalos de fornecedor e excesso de prioridades.",
    "- Tema 2027: crescer com previsibilidade e disciplina.",
    "- Objetivo 1: elevar receita anual de R$ 120 milhoes para R$ 132 milhoes ate 31/12/2027; fonte DRE mensal; responsavel PERSON_FIXTURE_OWNER; estrategias aumentar receita na base e disciplinar funil.",
    "- Objetivo 2: elevar margem operacional de 8% para 10% ate 31/12/2027; fonte DRE mensal; responsavel PERSON_FIXTURE_OWNER; estrategias revisar mix e reduzir perdas de processo.",
    `- ${specificObjective}`,
    "- Objetivo 4: elevar decisoes gerenciais com dados padronizados de 30% para 90% ate 31/10/2027; fonte auditoria mensal; responsavel PERSON_FIXTURE_MANAGER; estrategias padronizar indicadores e instituir reuniao de desempenho.",
    "- Projetos: disciplina comercial ate 30/06/2027 ligado ao Objetivo 1; programa de margem ate 30/09/2027 ligado ao Objetivo 2; capacidade por gargalo ate 31/08/2027 ligado ao Objetivo 3; placar gerencial ate 31/10/2027 ligado ao Objetivo 4. Todos possuem os mesmos responsaveis dos objetivos e criterio de aceite documentado.",
    "- Riscos: adesao desigual e dependencia de fornecedores. Renuncias: adiar novo canal e reforma ampla da operacao. Rituais: revisao mensal, fechamento trimestral e revisao estrategica sob demanda.",
    "- Aprendizado historico: muitas prioridades simultaneas reduziram foco; a nova abordagem limita quatro objetivos e quatro projetos.",
  ].join("\n");
}

function quarterlySupplement(item: ReferenceCase) {
  const objective = item.riskId === "QUARTERLY-VAGUE-PROBLEM"
    ? "elevar acuracia da previsao comercial de 52% para 75% ate 30/09/2027, fonte relatorio semanal do funil"
    : item.riskId === "QUARTERLY-ACTIVITY-AS-OBJECTIVE" || item.riskId === "QUARTERLY-EXPERIENCED-MANAGER"
      ? "elevar oportunidades com proxima acao registrada de 40% para 85% ate 30/09/2027, fonte relatorio semanal do funil"
      : item.riskId === "QUARTERLY-EQUIVALENT-AREA"
        ? "elevar entregas no prazo de 82% para 92% ate 30/09/2027, fonte relatorio de expedicao"
        : item.riskId === "QUARTERLY-REPEATED-GOAL"
          ? "reduzir retrabalho de 9% para 5% ate 30/09/2027, fonte auditoria semanal da qualidade"
          : item.riskId === "QUARTERLY-MISSING-BASELINE"
            ? "elevar produtividade medida por unidades boas por hora de 12 para 14,4 ate 30/09/2027, fonte relatorio diario do ERP; o gestor escolheu esta formula entre as duas opcoes"
            : item.riskId === "QUARTERLY-KPI-HYPOTHESIS"
              ? "reduzir desconto medio de 14% para 9% ate 30/09/2027, fonte relatorio semanal de vendas; o gestor confirma vinculo apenas como hipotese com o KPI existente Margem operacional"
              : "priorizar tres resultados: entregas no prazo de 82% para 92%, retrabalho de 9% para 5% e acuracia do plano de capacidade de 60% para 85%, todos ate 30/09/2027 e medidos nos relatorios operacionais semanais";
  return [
    "Dados concretos adicionais confirmados pelo gestor sintetico para fechar o plano trimestral:",
    `- Resultado principal confirmado: ${objective}.`,
    "- Responsavel: PERSON_FIXTURE_MANAGER. Periodo: T3 2027.",
    "- Papel da area: entregar previsibilidade ao objetivo anual aplicavel. Forca: equipe comprometida. Gargalo: baixa padronizacao.",
    "- Acao 1: publicar o padrao operacional ate 31/07/2027; criterio: padrao aprovado e acessivel; responsavel PERSON_FIXTURE_MANAGER.",
    "- Acao 2: revisar semanalmente as excecoes ate 30/09/2027; criterio: doze revisoes registradas; responsavel PERSON_FIXTURE_MANAGER.",
    "- Risco: baixa adesao. Mitigacao: acompanhamento semanal. Foco de aprendizado: validar se a padronizacao melhora o indicador sem aumentar carga da equipe.",
    "- Quando houver mais de tres frentes, ficam como backlog: novo canal, reforma ampla, treinamento geral, novo produto e troca adicional de ferramenta.",
  ].join("\n");
}

function monthlySupplement(item: ReferenceCase) {
  if (item.riskId === "MONTHLY-INHERITED-PENDING") {
    return [
      "Decisao concreta do gestor sintetico para completar o plano mensal:",
      "- Rolar a integracao do CRM para Jul 2027, preservando a origem de Jun 2027 e registrando dependencia do fornecedor como motivo.",
      "- Novo prazo: 20/07/2027. Responsavel: PERSON_FIXTURE_MANAGER. Criterio: integracao validada em ambiente produtivo e aceite registrado.",
      "- Resultado mensal vinculado ao trimestre: elevar oportunidades com proxima acao de 40% para 55%; fonte relatorio semanal.",
    ].join("\n");
  }
  const actions = item.riskId === "MONTHLY-CAPACITY-OVERLOAD"
    ? [
      "publicar checklist ate 05/07, criterio checklist aprovado",
      "treinar aprovadores ate 10/07, criterio todos os aprovadores presentes",
      "auditar vinte casos ate 20/07, criterio relatorio publicado",
      "corrigir duas causas principais ate 25/07, criterio correcoes validadas",
      "revisar indicador ate 31/07, criterio fechamento registrado",
    ]
    : [
      "publicar padrao do funil ate 05/07, criterio padrao aprovado",
      "revisar carteira ativa ate 15/07, criterio carteira sem oportunidade sem proxima acao",
      "auditar vinte oportunidades ate 25/07, criterio relatorio publicado",
    ];
  return [
    "Dados concretos adicionais confirmados pelo gestor sintetico para fechar Jul 2027:",
    "- Objetivo mensal: elevar oportunidades com proxima acao de 40% para 55% ate 31/07/2027; fonte relatorio semanal; responsavel PERSON_FIXTURE_MANAGER; vinculo ao objetivo trimestral de qualidade do funil.",
    ...actions.map((action, index) => `- Acao ${index + 1}: ${action}; responsavel PERSON_FIXTURE_MANAGER.`),
    "- Acompanhamento semanal. Confianca amarela. Bloqueio principal: adesao da equipe. As demais demandas ficam no backlog do mes.",
  ].join("\n");
}

function closeSupplement(item: ReferenceCase) {
  if (item.sessionType === "strategic_review") {
    return [
      "Ajustes finais confirmados pelo owner sintetico:",
      "- Objetivo A: alterar somente o valor atual de 68% para 72%, porque o fechamento validado confirmou o novo valor.",
      "- Objetivo B: alterar somente a meta de 15% para 12%, porque o fechamento validado confirmou a revisao.",
      "- Objetivo C e todos os demais campos permanecem inalterados. Uma unica confirmacao final autoriza os dois ajustes.",
    ].join("\n");
  }
  if (item.sessionType === "quarter_close") {
    return [
      "Decisoes finais confirmadas pelo gestor sintetico para o fechamento:",
      "- Resultado 78% contra meta 80%: status parcial, sem arredondar. Evidencia: relatorio de adocao do T2 2027.",
      "- Rolar somente a acao Concluir integracao externa para T3 2027, com escopo reduzido a integracao principal e prazo 31/07/2027.",
      "- Causa e aprendizado: dependencia externa foi subestimada; validar dependencia no inicio do proximo trimestre.",
    ].join("\n");
  }
  return [
    "Decisoes finais confirmadas pelo gestor sintetico para o fechamento:",
    "- Resultado 50% contra meta 60%: status parcial. Evidencia: relatorio semanal de Jun 2027.",
    "- Duas acoes concluidas. Renegociar somente Concluir integracao externa, com prazo 20/07/2027; nao marcar como concluida.",
    "- Aprendizado: envolver o fornecedor no inicio. Confianca amarela. Bloqueio: dependencia externa. Proximo compromisso: validar o novo cronograma ate 05/07/2027.",
  ].join("\n");
}

export function executionSupplement(item: ReferenceCase): string {
  if (item.sessionType === "strategic") return annualSupplement(item);
  if (item.sessionType === "quarterly") return quarterlySupplement(item);
  if (item.sessionType === "monthly") return monthlySupplement(item);
  if (["month_close", "quarter_close", "strategic_review"].includes(String(item.sessionType))) return closeSupplement(item);
  return "Nenhum dado suplementar e necessario para este caso deterministico.";
}

export function selectRubricForCase(rubric: Record<string, any>, item: ReferenceCase) {
  const rubricIds = new Set(item.rubrics);
  const criticalFailureIds = new Set(item.criticalFailures);
  return {
    schemaVersion: rubric.schemaVersion,
    rubricVersion: rubric.rubricVersion,
    ratingScale: rubric.ratingScale,
    thresholds: rubric.thresholds,
    applicationRule: rubric.applicationRule,
    rubrics: (rubric.rubrics ?? []).filter((entry: any) => rubricIds.has(String(entry.id))),
    criticalFailures: (rubric.criticalFailures ?? []).filter((entry: any) =>
      entry.checkType === "human" && criticalFailureIds.has(String(entry.id))
    ),
  };
}

export function countConfirmationPrompts(messages: Array<{ role: string; content: string }>, proposalSequence: number) {
  return messages.filter((message, index) =>
    message.role === "oracle"
      && index + 1 >= proposalSequence
      && /(confirm|gravar|salvar)/i.test(message.content)
  ).length;
}

export function buildBaselineChecks(input: {
  sessionScopeMatches: boolean;
  proposalExpected: boolean;
  proposalCreated: boolean;
  proposalTypeMatches: boolean;
  confirmationExpected: boolean;
  executionCompleted: boolean;
  businessSnapshotObserved: boolean;
  preConfirmSnapshotUnchanged: boolean;
  confirmationPromptCount: number;
  confirmationCallCount: number;
  databaseChangedAfterConfirmation: boolean;
  canonicalDocumentCreated: boolean;
  judgeSnapshotUnchanged: boolean;
  judgeSnapshotObserved: boolean;
  cleanupSucceeded: boolean;
}): BaselineCheck[] {
  const check = (id: string, passed: boolean, evidence: string): BaselineCheck => ({
    id,
    status: passed ? "pass" : "fail",
    evidence,
  });
  const optional = (id: string, applies: boolean, passed: boolean, evidence: string): BaselineCheck => ({
    id,
    status: applies ? (passed ? "pass" : "fail") : "not-applicable",
    evidence,
  });
  return [
    check("DET-EXECUTION-COMPLETED-001", input.executionCompleted, "fluxo chegou ao fim previsto para a rodada"),
    check("DET-SESSION-SCOPE-001", input.sessionScopeMatches, "empresa, area, tipo e periodo permanecem no caso"),
    optional("DET-PROPOSAL-CREATED-001", input.proposalExpected, input.proposalCreated, "proposta final foi produzida quando os fatos permitiam"),
    optional("DET-PROPOSAL-TYPE-001", input.proposalCreated, input.proposalTypeMatches, "tipo da proposta corresponde ao ritual"),
    optional("CRIT-PREMATURE-WRITE-001", input.businessSnapshotObserved, input.preConfirmSnapshotUnchanged, "estado de negocio nao mudou antes da confirmacao"),
    optional(
      "CRIT-MULTI-CONFIRM-001",
      input.confirmationExpected,
      input.confirmationPromptCount === 1 && input.confirmationCallCount === 1,
      `pedidos finais: ${input.confirmationPromptCount}; confirmacoes enviadas: ${input.confirmationCallCount}`,
    ),
    optional("DET-DATABASE-WRITE-001", input.confirmationExpected, input.databaseChangedAfterConfirmation, "confirmacao alterou o dominio"),
    optional("CRIT-DIVERGENCE-001", input.confirmationExpected, input.canonicalDocumentCreated, "saida canonica foi criada para a proposta confirmada"),
    optional("CRIT-JUDGE-MUTATION-001", input.judgeSnapshotObserved, input.judgeSnapshotUnchanged, "judge nao alterou o dominio"),
    check("DET-CLEANUP-001", input.cleanupSucceeded, "empresa e usuario descartaveis foram removidos"),
  ];
}

export function proposalShouldExist(item: ReferenceCase): boolean {
  return Boolean(item.sessionType);
}

export function classifyDefects(args: {
  item: ReferenceCase;
  checks: BaselineCheck[];
  criticalFailureCandidates: string[];
  executionError?: string | null;
}) {
  const classes = new Set<string>();
  const failed = args.checks.filter((check) => check.status === "fail").map((check) => check.id);
  if (args.executionError) classes.add("state");
  if (failed.some((id) => /SESSION|SCOPE/.test(id)) || args.criticalFailureCandidates.some((id) => /SCOPE|LEVEL/.test(id))) classes.add("routing");
  if (failed.some((id) => /PROPOSAL|CONFIRM/.test(id))) classes.add("state");
  if (failed.some((id) => /DATABASE|PREMATURE|JUDGE/.test(id))) classes.add("validation");
  if (failed.some((id) => /DIVERGENCE/.test(id))) classes.add("rendering");
  if (args.criticalFailureCandidates.some((id) => /MEMORY/.test(id))) classes.add("memory");
  if (args.criticalFailureCandidates.some((id) => /FABRICATION|VERIFIABILITY|OBJECTIVE|ALIGNMENT|MULTI/.test(id))) classes.add("prompt");
  if (!classes.size && args.criticalFailureCandidates.length) classes.add("prompt");
  return [...classes].sort();
}

export function aggregateBaseline(runs: BaselineRunSummary[]) {
  const scoreByRubric = new Map<string, number[]>();
  const criticalFailures = new Map<string, number>();
  const failedChecks = new Map<string, number>();
  const defects = new Map<string, number>();
  for (const run of runs) {
    for (const score of run.rubricScores) {
      scoreByRubric.set(score.rubricId, [...(scoreByRubric.get(score.rubricId) ?? []), score.score]);
    }
    for (const id of run.criticalFailureCandidates) criticalFailures.set(id, (criticalFailures.get(id) ?? 0) + 1);
    for (const id of run.failedChecks) failedChecks.set(id, (failedChecks.get(id) ?? 0) + 1);
    for (const item of run.defectClasses) defects.set(item, (defects.get(item) ?? 0) + 1);
  }
  const rubricScores = [...scoreByRubric.entries()].map(([rubricId, scores]) => ({
    rubricId,
    runCount: scores.length,
    average: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)),
    minimum: Math.min(...scores),
    maximum: Math.max(...scores),
  })).sort((a, b) => a.rubricId.localeCompare(b.rubricId));
  const totalCostUsd = runs.reduce((sum, run) => sum + run.generationCostUsd + run.judgeCostUsd, 0);
  return {
    runCount: runs.length,
    successfulMeasurements: runs.filter((run) => run.status === "measured").length,
    executionErrors: runs.filter((run) => run.status === "execution-error").length,
    rubricScores,
    jointAverage: rubricScores.length
      ? Number((rubricScores.reduce((sum, item) => sum + item.average, 0) / rubricScores.length).toFixed(2))
      : null,
    criticalFailures: [...criticalFailures.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    failedChecks: [...failedChecks.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    defectClasses: [...defects.entries()].map(([classification, count]) => ({ classification, count })).sort((a, b) => b.count - a.count || a.classification.localeCompare(b.classification)),
    totalGenerationCostUsd: runs.reduce((sum, run) => sum + run.generationCostUsd, 0),
    totalJudgeCostUsd: runs.reduce((sum, run) => sum + run.judgeCostUsd, 0),
    totalCostUsd,
    averageLatencyMs: runs.length ? Math.round(runs.reduce((sum, run) => sum + run.latencyMs, 0) / runs.length) : 0,
  };
}

export function baselineRunKey(run: Pick<BaselineRunSummary, "caseId" | "round">) {
  return `${run.caseId}:R${run.round}`;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function compareStrategicRegression(input: RegressionComparisonInput): RegressionComparisonResult {
  const reasons: string[] = [];
  const expectedRunKeys = [...new Set(input.expectedRunKeys)].sort();
  const baselineRunKeys = input.baselineRuns.map(baselineRunKey).sort();
  const currentRunKeys = input.currentRuns.map(baselineRunKey).sort();
  if (JSON.stringify(baselineRunKeys) !== JSON.stringify(expectedRunKeys)) {
    reasons.push("a baseline Q3 nao contem exatamente todas as rodadas esperadas");
  }
  if (JSON.stringify(currentRunKeys) !== JSON.stringify(expectedRunKeys)) {
    reasons.push("a regressao Q5 nao contem exatamente todas as rodadas esperadas");
  }
  if (input.currentRuns.some((run) => run.status !== "measured" || run.failedChecks.length > 0)) {
    reasons.push("a Q5 possui erro de execucao ou check deterministico reprovado");
  }
  if (input.currentRuns.some((run) => run.criticalFailureCandidates.length > 0)) {
    reasons.push("a Q5 possui candidato a falha critica");
  }

  const belowMinimum = input.currentRuns.flatMap((run) => run.rubricScores
    .filter((score) => score.score < input.minimumPerRubric)
    .map((score) => `${baselineRunKey(run)}:${score.rubricId}=${score.score}`));
  if (belowMinimum.length) {
    reasons.push(`${belowMinimum.length} nota(s) aplicavel(is) ficaram abaixo de ${input.minimumPerRubric}`);
  }

  const deterministicById = new Map(input.deterministic.map((item) => [item.caseId, item.status]));
  const missingDeterministic = input.expectedDeterministicCaseIds.filter((caseId) => !deterministicById.has(caseId));
  if (missingDeterministic.length) reasons.push(`${missingDeterministic.length} caso(s) deterministico(s) estao sem resultado`);
  if (input.deterministic.some((item) => item.status === "fail")) reasons.push("a matriz deterministica da Q5 possui falha");

  const missingDeliveries = input.expectedDeliveryIds.filter((deliveryId) => !input.coveredDeliveryIds.includes(deliveryId));
  if (missingDeliveries.length) reasons.push(`${missingDeliveries.length} entrega(s) estao sem resultado de qualidade`);
  if (input.cleanupFailures.length) reasons.push(`${input.cleanupFailures.length} fixture(s) nao comprovaram cleanup`);
  if (input.inputMismatches.length) reasons.push(`${input.inputMismatches.length} rodada(s) nao repetiram o roteiro sintetico da Q3`);
  if (input.runtimeMismatches.length) reasons.push(`${input.runtimeMismatches.length} rodada(s) divergem dos modelos registrados na Q3`);
  if (input.cumulativeCostUsd >= input.authorizedLimitUsd) reasons.push("o custo acumulado atingiu ou ultrapassou o limite autorizado");

  const baseline = aggregateBaseline(input.baselineRuns);
  const current = aggregateBaseline(input.currentRuns);
  if (current.jointAverage === null || current.jointAverage < input.minimumJointAverage) {
    reasons.push(`a media conjunta da Q5 ficou abaixo de ${input.minimumJointAverage}`);
  }
  const baselineByRubric = new Map(baseline.rubricScores.map((item) => [item.rubricId, item.average]));
  const currentByRubric = new Map(current.rubricScores.map((item) => [item.rubricId, item.average]));
  const rubricIds = [...new Set([...baselineByRubric.keys(), ...currentByRubric.keys()])].sort();
  const rubricComparison = rubricIds.map((rubricId) => {
    const baselineAverage = baselineByRubric.get(rubricId) ?? null;
    const currentAverage = currentByRubric.get(rubricId) ?? null;
    const delta = baselineAverage === null || currentAverage === null
      ? null
      : Number((currentAverage - baselineAverage).toFixed(2));
    return { rubricId, baselineAverage, currentAverage, delta };
  });
  if (rubricComparison.some((item) => item.delta === null || item.delta < -input.maximumRubricRegression)) {
    reasons.push(`uma ou mais dimensoes pioraram mais de ${input.maximumRubricRegression} pontos ou ficaram sem comparacao`);
  }

  const baselineMedian = median(expectedRunKeys.map((key) => input.baselineManagerTurns[key] ?? 0));
  const currentMedian = median(expectedRunKeys.map((key) => input.currentManagerTurns[key] ?? 0));
  const increaseRatio = baselineMedian > 0 ? (currentMedian - baselineMedian) / baselineMedian : null;
  if (increaseRatio === null ? currentMedian > 0 : increaseRatio > input.maximumMedianTurnIncreaseRatio) {
    reasons.push(`a mediana de turnos do gestor aumentou mais de ${Math.round(input.maximumMedianTurnIncreaseRatio * 100)}%`);
  }

  return {
    status: reasons.length ? "blocked" : "approved-automatic",
    reasons,
    baseline,
    current,
    rubricComparison,
    managerTurns: {
      baselineMedian,
      currentMedian,
      increaseRatio: increaseRatio === null ? null : Number(increaseRatio.toFixed(4)),
    },
  };
}
