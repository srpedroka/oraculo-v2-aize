function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function documentTypeLabel(value: unknown) {
  const type = asText(value);
  if (type === "strategic") return "PLANO ESTRATÉGICO";
  if (type === "quarterly") return "PLANO TRIMESTRAL";
  if (type === "monthly") return "PLANO MENSAL";
  if (type === "month_close") return "FECHAMENTO MENSAL";
  if (type === "quarter_close") return "FECHAMENTO TRIMESTRAL";
  if (type === "kpi_history") return "HISTÓRICO DE KPIs";
  return "DOCUMENTO ORÁCULO";
}

function actionLine(action: any) {
  const details = [
    asText(action.responsavel) ? `dono: ${asText(action.responsavel)}` : "",
    asText(action.prazo) ? `prazo: ${asText(action.prazo)}` : "",
    asText(action.criterio) ? `critério: ${asText(action.criterio)}` : "",
  ].filter(Boolean);
  return `- ${asText(action.descricao, "Ação-chave")}${details.length ? ` (${details.join(" · ")})` : ""}`;
}

function objectiveBlock(objective: any) {
  const header = `*${asText(objective.numero, "1")}. ${asText(objective.titulo, "Objetivo")}*`;
  const meta = [
    asText(objective.tipo) ? `Tipo: ${asText(objective.tipo)}` : "",
    asText(objective.atual) ? `Baseline: ${asText(objective.atual)}` : "",
    asText(objective.indicador) ? `Indicador: ${asText(objective.indicador)}` : "",
    asText(objective.meta) ? `Meta: ${asText(objective.meta)}` : "",
    asText(objective.responsavel) ? `Responsável: ${asText(objective.responsavel)}` : "",
    asText(objective.status_final) ? `Status final: ${asText(objective.status_final)}` : "",
    objective.progresso_final !== null && objective.progresso_final !== undefined ? `Progresso: ${objective.progresso_final}%` : "",
  ].filter(Boolean);
  const result = asText(objective.resultado) ? [`Resultado esperado: ${asText(objective.resultado)}`] : [];
  const source = asText(objective.fonte) ? [`Fonte: ${asText(objective.fonte)}`] : [];
  const link = asText(objective.vinculo) ? [`Vínculo: ${asText(objective.vinculo)}`] : [];
  const strategies = asArray<string>(objective.estrategias).length ? [`Estratégias: ${asArray<string>(objective.estrategias).join("; ")}`] : [];
  const deliverables = asArray<string>(objective.entregas).length ? [`Entregas: ${asArray<string>(objective.entregas).join("; ")}`] : [];
  const actions = asArray<any>(objective.acoes).map(actionLine);
  const evidence = asText(objective.evidencia) ? [`Evidência: ${asText(objective.evidencia)}`] : [];
  return [header, ...meta, ...result, ...source, ...link, ...strategies, ...deliverables, ...actions, ...evidence].filter(Boolean).join("\n");
}

export function renderPlanForWhatsApp(content: any) {
  const title = [
    documentTypeLabel(content?.tipo),
    asText(content?.area).toUpperCase(),
    asText(content?.periodo).toUpperCase(),
  ].filter(Boolean).join(" · ");

  const header = [
    `*${title}*`,
    asText(content?.empresa) ? `Empresa: ${asText(content.empresa)}` : "",
    asText(content?.gestor) ? `Gestor: ${asText(content.gestor)}` : "",
  ].filter(Boolean);

  const context = asArray<string>(content?.contexto_rapido);
  if (context.length) {
    header.push("");
    header.push("*Contexto rápido*");
    header.push(...context.slice(0, 4).map((item) => `- ${item}`));
  }

  const strategic = content?.strategic && typeof content.strategic === "object" ? content.strategic : {};
  const renunciations = asArray<string>(strategic.renuncias);
  const risks = asArray<string>(strategic.riscos);
  const pendingDecisions = asArray<string>(strategic.decisoes_pendentes);
  const historicalLessons = asArray<string>(strategic.aprendizados_historicos);
  if (renunciations.length || risks.length || pendingDecisions.length || historicalLessons.length) {
    header.push("");
    header.push("*Escolhas, riscos e aprendizados*");
    if (renunciations.length) header.push(`Renúncias: ${renunciations.join("; ")}`);
    if (risks.length) header.push(`Riscos: ${risks.join("; ")}`);
    if (pendingDecisions.length) header.push(`Decisões pendentes: ${pendingDecisions.join("; ")}`);
    if (historicalLessons.length) header.push(`Aprendizados anteriores: ${historicalLessons.join("; ")}`);
  }

  const objectives = asArray<any>(content?.objetivos);
  const blocks = [header.join("\n")];

  for (let index = 0; index < objectives.length; index += 2) {
    blocks.push(objectives.slice(index, index + 2).map(objectiveBlock).join("\n\n"));
  }

  const focus = asArray<string>(content?.foco_aprendizado);
  const closing = [];
  if (focus.length) {
    closing.push("*Foco de aprendizado*");
    closing.push(...focus.slice(0, 5).map((item) => `- ${item}`));
  }
  if (content?.fechamento) {
    const close = content.fechamento;
    if (asText(close.resumo)) {
      closing.push("*Revisão*");
      closing.push(asText(close.resumo));
    }
    if (close.percentual !== null && close.percentual !== undefined) closing.push(`Conclusão: ${close.percentual}%`);
    const decisions = asArray<string>(close.decisoes).filter(Boolean);
    if (decisions.length) closing.push(`Decisões: ${decisions.join("; ")}`);
  }
  if (asText(content?.frase_de_foco)) {
    closing.push("");
    closing.push(`_${asText(content.frase_de_foco)}_`);
  }
  if (closing.length) blocks.push(closing.join("\n"));

  return blocks.filter((block) => block.trim()).join("\n\n---\n\n");
}
