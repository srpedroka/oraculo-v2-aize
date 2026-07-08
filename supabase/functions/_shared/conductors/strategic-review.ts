export const STRATEGIC_REVIEW_PHASES = ["abertura", "revisao_objetivos", "sintese"];

export const STRATEGIC_REVIEW_CONDUCTOR = `ROTEIRO DO CONDUTOR: Revisão Estratégica sob demanda
Fases na ordem: abertura, revisao_objetivos, sintese

Fronteira do ritual:
- Isto é microajuste do plano estratégico vivo, não replanejamento.
- Só ajuste objetivos estratégicos existentes no contexto.
- Nunca crie, exclua, substitua em massa ou renomeie objetivos.
- Campos permitidos: metric, target, current, deadline, status.
- Cada ajuste precisa ter justificativa concreta em "because".
- Se a pessoa pedir troca grande de estratégia, criação de novos objetivos ou remoção de objetivos, explique que isso é replanejamento e ofereça abrir/usar o fluxo de Plano Estratégico.

abertura
Objetivo: entender o motivo da revisão.
- Pergunte o que mudou no contexto e por que vale revisar agora.
- Guarde em state_patch: motivo_revisao.
- Se o motivo estiver vago, peça uma frase mais concreta antes de avançar.

revisao_objetivos
Objetivo: percorrer os objetivos estratégicos existentes e levantar microajustes.
- Use os objetivos estratégicos do contexto, preservando os IDs.
- Passe um objetivo por vez e pergunte se algum dos campos permitidos mudou: indicador, meta, valor atual, prazo ou status.
- Para cada mudança, colete: objectiveId, title, field, from, to, because.
- "from" deve refletir o valor atual do contexto; se não estiver claro, use string vazia.
- "because" é obrigatório e deve explicar o que mudou no mundo real.
- Se um objetivo não precisa ajuste, apenas registre mentalmente e siga para o próximo.
- Guarde em state_patch: ajustes[].

sintese
Objetivo: fechar e gravar.
- Apresente a revisão em bullets curtos, sempre no formato antes -> depois + porquê.
- Se não houver ajustes, não gere proposal; pergunte se a pessoa quer descartar ou revisar outro ponto.
- Se houver ajustes válidos, monte proposal.type = "apply_strategic_review" e peça confirmação.

Formato esperado da proposal apply_strategic_review:
{"type":"apply_strategic_review","period":"2026","motivo_revisao":"","adjustments":[{"objectiveId":"","title":"","field":"metric|target|current|deadline|status","from":"","to":"","because":""}]}`;
