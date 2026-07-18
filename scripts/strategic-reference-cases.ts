export type ReferencePhase = "Q2A" | "Q2B" | "Q2C" | "Q2D" | "Q2E";
export type ReferenceChannel = "web" | "whatsapp" | "derived";
export type ConfirmationPolicy = "single-final" | "explicit-choice-before-write" | "no-write" | "not-applicable";
export type MutationPolicy = "proposal-confirmation" | "read-only" | "conditional-explicit-target" | "deterministic-only";
export type JudgePolicy = "required" | "optional" | "not-applicable";

export interface ReferenceCaseManifest {
  schemaVersion: 1;
  catalogVersion: string;
  rubricVersion: string;
  gateStatus: "candidate-for-owner-review" | "owner-approved";
  executionPolicy: {
    referenceCasesOnly: boolean;
    productionAccess: boolean;
    runtimeMutation: boolean;
    providerCalls: boolean;
    expectedCostUsd: number;
  };
  blocks: Array<{
    phase: ReferencePhase;
    file: string;
    minimumCases: number;
    requiredDeliverables: string[];
    requiredRiskIds: string[];
  }>;
}

export interface ReferenceCase {
  caseId: string;
  riskId: string;
  title: string;
  deliveryId: string;
  classification: string;
  channels: ReferenceChannel[];
  sessionType: string | null;
  methods: string[];
  rubrics: string[];
  criticalFailures: string[];
  input: {
    areaName?: string | null;
    opening: string;
    facts: string[];
    upperLevelContext: string;
    histories: string[];
    competingContext: string[];
  };
  expected: {
    requiredBehaviors: string[];
    forbiddenBehaviors: string[];
    minimumEvidence: string[];
    confirmationPolicy: ConfirmationPolicy;
    mutationPolicy: MutationPolicy;
    judgePolicy: JudgePolicy;
  };
}

export interface ReferenceCaseBlock {
  schemaVersion: 1;
  catalogVersion: string;
  phase: ReferencePhase;
  title: string;
  cases: ReferenceCase[];
}

interface RubricLike {
  rubricVersion: string;
  rubrics: Array<{ id: string }>;
  criticalFailures: Array<{ id: string }>;
}

interface CoverageLike {
  deliverables: Array<{
    id: string;
    classification: string;
    phase: string;
    channels: string[];
    sessionTypes: string[];
    rubrics: string[];
    methods: string[];
  }>;
}

export interface ValidatedReferenceCatalog {
  caseCount: number;
  phaseCounts: Record<ReferencePhase, number>;
  coveredDeliverables: string[];
  coveredCriticalFailures: string[];
}

const PHASES: ReferencePhase[] = ["Q2A", "Q2B", "Q2C", "Q2D", "Q2E"];
const CONFIRMATION_POLICIES = new Set<ConfirmationPolicy>([
  "single-final",
  "explicit-choice-before-write",
  "no-write",
  "not-applicable",
]);
const MUTATION_POLICIES = new Set<MutationPolicy>([
  "proposal-confirmation",
  "read-only",
  "conditional-explicit-target",
  "deterministic-only",
]);
const JUDGE_POLICIES = new Set<JudgePolicy>(["required", "optional", "not-applicable"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nonEmptyStrings(value: unknown, field: string): asserts value is string[] {
  assert(Array.isArray(value) && value.length > 0, `${field} deve ter ao menos um item`);
  assert(value.every((item) => typeof item === "string" && item.trim().length > 0), `${field} contem item vazio`);
}

function assertSynthetic(value: unknown, field: string): void {
  const source = JSON.stringify(value);
  const forbidden = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\+55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,
    /\bsk-[A-Za-z0-9_-]{8,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\b/,
  ];
  assert(forbidden.every((pattern) => !pattern.test(source)), `${field} contem identificador ou credencial proibida`);
}

export function validateReferenceCaseCatalog(args: {
  manifest: ReferenceCaseManifest;
  blocks: ReferenceCaseBlock[];
  rubric: RubricLike;
  coverage: CoverageLike;
}): ValidatedReferenceCatalog {
  const { manifest, blocks, rubric, coverage } = args;
  assert(manifest.schemaVersion === 1, "schemaVersion do manifesto deve ser 1");
  assert(manifest.catalogVersion.trim().length > 0, "catalogVersion obrigatoria");
  assert(manifest.rubricVersion === rubric.rubricVersion, "rubrica do catalogo diverge da rubrica vigente");
  assert(manifest.gateStatus === "candidate-for-owner-review" || manifest.gateStatus === "owner-approved", "gateStatus invalido");
  assert(manifest.executionPolicy.referenceCasesOnly, "Q2 deve conter somente casos de referencia");
  assert(!manifest.executionPolicy.productionAccess, "Q2 nao pode acessar producao");
  assert(!manifest.executionPolicy.runtimeMutation, "Q2 nao pode mutar runtime");
  assert(!manifest.executionPolicy.providerCalls, "Q2 nao pode chamar provider");
  assert(manifest.executionPolicy.expectedCostUsd === 0, "Q2 deve ter custo esperado zero");
  assert(manifest.blocks.length === PHASES.length, "manifesto deve declarar Q2A a Q2E");
  assert(blocks.length === PHASES.length, "todos os blocos Q2A a Q2E devem estar carregados");

  const rubricIds = new Set(rubric.rubrics.map((item) => item.id));
  const criticalFailureIds = new Set(rubric.criticalFailures.map((item) => item.id));
  const deliverables = new Map(coverage.deliverables.map((item) => [item.id, item]));
  const blockByPhase = new Map(blocks.map((block) => [block.phase, block]));
  const manifestByPhase = new Map(manifest.blocks.map((block) => [block.phase, block]));
  assert(blockByPhase.size === PHASES.length, "fase Q2 duplicada ou ausente nos blocos");
  assert(manifestByPhase.size === PHASES.length, "fase Q2 duplicada ou ausente no manifesto");

  const caseIds = new Set<string>();
  const riskIds = new Set<string>();
  const coveredDeliverables = new Set<string>();
  const coveredCriticalFailures = new Set<string>();
  const phaseCounts = Object.fromEntries(PHASES.map((phase) => [phase, 0])) as Record<ReferencePhase, number>;

  for (const phase of PHASES) {
    const block = blockByPhase.get(phase);
    const declaration = manifestByPhase.get(phase);
    assert(block, `bloco ${phase} ausente`);
    assert(declaration, `declaracao ${phase} ausente`);
    assert(block.schemaVersion === 1, `${phase}: schemaVersion deve ser 1`);
    assert(block.catalogVersion === manifest.catalogVersion, `${phase}: catalogVersion divergente`);
    assert(block.phase === phase, `${phase}: fase divergente`);
    assert(block.title.trim().length > 0, `${phase}: titulo obrigatorio`);
    assert(block.cases.length >= declaration.minimumCases, `${phase}: minimo de casos nao atendido`);
    nonEmptyStrings(declaration.requiredRiskIds, `${phase}.requiredRiskIds`);
    assert(new Set(declaration.requiredRiskIds).size === declaration.requiredRiskIds.length, `${phase}: riskId obrigatorio duplicado`);
    phaseCounts[phase] = block.cases.length;

    for (const item of block.cases) {
      assert(new RegExp(`^${phase}-[A-Z0-9-]+-\\d{3}$`).test(item.caseId), `${item.caseId}: formato invalido`);
      assert(!caseIds.has(item.caseId), `${item.caseId}: caseId duplicado`);
      assert(!riskIds.has(item.riskId), `${item.riskId}: riskId duplicado`);
      caseIds.add(item.caseId);
      riskIds.add(item.riskId);

      const deliverable = deliverables.get(item.deliveryId);
      assert(deliverable, `${item.caseId}: entrega desconhecida ${item.deliveryId}`);
      assert(deliverable.classification === item.classification, `${item.caseId}: classificacao divergente da entrega`);
      assert(deliverable.phase.includes(phase), `${item.caseId}: entrega ${item.deliveryId} nao declara ${phase}`);
      assert(item.channels.length > 0, `${item.caseId}: canal obrigatorio`);
      assert(item.channels.every((channel) => channel === "derived" || deliverable.channels.includes(channel)), `${item.caseId}: canal nao suportado`);
      assert(item.sessionType === null || deliverable.sessionTypes.includes(item.sessionType), `${item.caseId}: ritual nao suportado`);
      nonEmptyStrings(item.methods, `${item.caseId}.methods`);
      nonEmptyStrings(item.rubrics, `${item.caseId}.rubrics`);
      nonEmptyStrings(item.criticalFailures, `${item.caseId}.criticalFailures`);
      assert(item.methods.every((method) => deliverable.methods.includes(method)), `${item.caseId}: metodo fora da cobertura`);
      assert(item.rubrics.every((rubricId) => rubricIds.has(rubricId) && deliverable.rubrics.includes(rubricId)), `${item.caseId}: rubrica fora da cobertura`);
      assert(item.criticalFailures.every((failureId) => criticalFailureIds.has(failureId)), `${item.caseId}: falha critica desconhecida`);

      assert(item.input.opening.trim().length > 0, `${item.caseId}: abertura obrigatoria`);
      if (item.input.areaName !== undefined && item.input.areaName !== null) {
        assert(item.input.areaName.trim().length > 0, `${item.caseId}: areaName nao pode ser vazia`);
      }
      nonEmptyStrings(item.input.facts, `${item.caseId}.input.facts`);
      assert(item.input.upperLevelContext.trim().length > 0, `${item.caseId}: contexto superior deve ser explicito, inclusive quando ausente`);
      assert(Array.isArray(item.input.histories), `${item.caseId}.input.histories deve ser lista`);
      assert(Array.isArray(item.input.competingContext), `${item.caseId}.input.competingContext deve ser lista`);
      nonEmptyStrings(item.expected.requiredBehaviors, `${item.caseId}.expected.requiredBehaviors`);
      nonEmptyStrings(item.expected.forbiddenBehaviors, `${item.caseId}.expected.forbiddenBehaviors`);
      nonEmptyStrings(item.expected.minimumEvidence, `${item.caseId}.expected.minimumEvidence`);
      assert(CONFIRMATION_POLICIES.has(item.expected.confirmationPolicy), `${item.caseId}: politica de confirmacao invalida`);
      assert(MUTATION_POLICIES.has(item.expected.mutationPolicy), `${item.caseId}: politica de mutacao invalida`);
      assert(JUDGE_POLICIES.has(item.expected.judgePolicy), `${item.caseId}: politica de judge invalida`);

      if (item.expected.mutationPolicy === "proposal-confirmation") {
        assert(["single-final", "explicit-choice-before-write"].includes(item.expected.confirmationPolicy), `${item.caseId}: proposta exige confirmacao`);
      }
      if (["read-only", "deterministic-only"].includes(item.expected.mutationPolicy)) {
        assert(["no-write", "not-applicable"].includes(item.expected.confirmationPolicy), `${item.caseId}: fluxo sem escrita nao pode pedir confirmacao de gravacao`);
      }
      if (item.methods.includes("ai-judge-read-only")) {
        assert(item.expected.judgePolicy !== "not-applicable", `${item.caseId}: metodo de judge sem politica correspondente`);
      } else {
        assert(item.expected.judgePolicy !== "required", `${item.caseId}: judge obrigatorio sem metodo ai-judge-read-only`);
      }

      coveredDeliverables.add(item.deliveryId);
      item.criticalFailures.forEach((failureId) => coveredCriticalFailures.add(failureId));
      assertSynthetic(item, item.caseId);
    }

    for (const deliveryId of declaration.requiredDeliverables) {
      assert(block.cases.some((item) => item.deliveryId === deliveryId), `${phase}: entrega ${deliveryId} sem caso`);
    }
    for (const riskId of declaration.requiredRiskIds) {
      assert(block.cases.some((item) => item.riskId === riskId), `${phase}: risco ${riskId} sem caso`);
    }
  }

  for (const failureId of criticalFailureIds) {
    assert(coveredCriticalFailures.has(failureId), `falha critica ${failureId} sem caso de referencia`);
  }

  assertSynthetic({ manifest, blocks }, "catalogo Q2");
  return {
    caseCount: caseIds.size,
    phaseCounts,
    coveredDeliverables: [...coveredDeliverables].sort(),
    coveredCriticalFailures: [...coveredCriticalFailures].sort(),
  };
}
