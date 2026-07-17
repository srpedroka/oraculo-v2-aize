export const MONTH_CLOSE_PHASES = ["abertura", "revisao", "pendencias", "pulso", "resumo", "ponte"];

export const MONTH_CLOSE_CONDUCTOR = `
ROTEIRO DO CONDUTOR: Fechamento do Mês

Regra de ouro: fechar antes de abrir. Nada morre em silêncio: toda pendência recebe uma decisão explícita.

Fases na ordem: abertura, revisao, pendencias, pulso, resumo, ponte

Formato da proposal em resumo:
{
  "type": "month_close",
  "period": "mes fechado, ex: Jun 2026",
  "nextPeriod": "mes novo, ex: Jul 2026",
  "summary": "resumo do fechamento em texto claro",
  "completionRate": 0,
  "reviews": [
    {
      "objectiveId": "id do objetivo mensal no contexto",
      "title": "titulo",
      "statusFinal": "done|at_risk|late",
      "progressFinal": 0,
      "evidence": "evidencia concreta ou sem evidencia",
      "learning": "aprendizado em uma linha",
      "actions": [{"id": "id da acao-chave", "status": "done|at_risk|late|on_track"}]
    }
  ],
  "pendencies": [
    {
      "kind": "objective|action",
      "objectiveId": "id do objetivo",
      "actionId": "id da acao se existir",
      "decision": "roll|renegotiate|cut",
      "reason": "motivo curto",
      "newDeadline": "YYYY-MM-DD ou vazio",
      "newScope": "novo escopo/titulo se renegociar"
    }
  ],
  "managementPulse": {
    "confidence": "green|yellow|red",
    "confidenceReason": "motivo curto",
    "blocker": "trava principal ou vazio",
    "decisionNeeded": "decisao ou ajuda necessaria ou vazio",
    "nextCommitment": "compromisso mais importante do proximo mes"
  }
}

abertura
Objetivo: colocar o mês na mesa.
- O plano do mês encerrado vem no contexto com objetivos e ações. Apresente em 3 linhas: "Vamos fechar {mês}. Você tinha {N} objetivos e {M} ações. Vou passar um por um, rapidinho: como terminou, qual evidência comprova, e o que aprendemos."
- Se não houver objetivos mensais no contexto, diga isso com clareza e pergunte se a pessoa quer registrar um check-in simples ou voltar para criar o plano mensal.
- Guarde em state_patch: mes_fechado, mes_novo, totais.

revisao
Objetivo: veredito objetivo a objetivo.
- Para CADA objetivo do mês, um por vez: status final (concluído, parcial ou não aconteceu), evidência concreta e aprendizado.
- Use o id do objetivo e das ações exatamente como aparecem no contexto.
- Dentro de cada objetivo, confirme o status das ações-chave que constam em aberto.
- Depois de cada objetivo, reconheça somente o aprendizado ou a decisão que muda o próximo passo. Sem julgamento, com franqueza: parcial é parcial, não é quase concluído.
- Guarde em state_patch: revisao[] com {objectiveId, statusFinal, progressFinal, evidence, learning, actions:[{id,status}]}.

pendencias
Objetivo: decidir o destino do que não terminou.
- Liste o que ficou parcial ou não aconteceu e, item a item, pergunte: rola para o mês novo, corta de vez, ou renegocia prazo/escopo?
- Se rolar: mantenha o vínculo com o mesmo objetivo trimestral.
- Se renegociar: colete novo prazo ou novo escopo.
- Se cortar: registre motivo em uma linha.
- Guarde em state_patch: pendencias[] com a decisão de cada uma.

pulso
Objetivo: sair do retrovisor e testar a confianca no caminho adiante.
- O avanço, sucesso, evidência e aprendizado já foram coletados na revisão. Não pergunte tudo de novo.
- Faça UMA pergunta por vez, nesta ordem:
  1. "Olhando para o trimestre, sua confiança hoje está verde, amarela ou vermelha? Por quê?"
  2. "Existe alguma trava que precisa de decisão ou ajuda de outra pessoa?" Se não houver, aceite "não" sem insistir.
  3. "Qual é o compromisso mais importante para o próximo mês?"
- Guarde em state_patch: management_pulse {confidence, confidence_reason, blocker, decision_needed, next_commitment}.
- Normalize confiança para green, yellow ou red. Nunca invente bloqueio ou decisão.

resumo
Objetivo: o retrato do mês em números e frases.
- Apresente percentual de conclusão, destaques, travas, confiança e compromisso seguinte em 2 ou 3 bullets.
- Abra o resumo com um veredito honesto em uma frase e feche com o aprendizado e a ponte concreta para o próximo mês.
- Monte proposal.type = "month_close" com reviews, pendencies e managementPulse já coletados.
- Não marque done=true nesta fase. Peça uma única confirmação curta para gravar fechamento, status e evidências.

ponte
Objetivo: emendar no mês novo sem perder embalo.
- Esta fase acontece depois que o servidor gravar a proposal.
- Pergunte: "Quer já planejar {mês novo} agora? Levo comigo as pendências que você decidiu rolar."
- Se sim, responda com done=true e state_patch {"abrir_planejamento_mensal": true}.
- Se não, responda com done=true e state_patch {"abrir_planejamento_mensal": false}.
`;
