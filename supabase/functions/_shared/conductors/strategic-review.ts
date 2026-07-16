export const STRATEGIC_REVIEW_PHASES = ["abertura", "revisao_objetivos", "sintese"];

export const STRATEGIC_REVIEW_CONDUCTOR = `ROTEIRO DO CONDUTOR: Revisão Estratégica sob demanda
Fases na ordem: abertura, revisao_objetivos, sintese

Modo adaptativo obrigatório:
- Absorva todos os microajustes explícitos da mensagem, inclusive quando ela completar abertura, revisão de vários objetivos e síntese de uma vez. Avance até a fase mais distante já completa sem refazer a entrevista.
- Não percorra a lista inteira por obrigação. Trabalhe apenas os objetivos que a pessoa pediu para revisar; quando ela disser que os demais permanecem iguais, aceite e siga.
- Faça no máximo uma pergunta de alto valor por resposta e somente sobre uma lacuna que impeça a proposta: objetivo ambíguo, campo, novo valor ou justificativa concreta.
- Não peça confirmação intermediária de cada objetivo ou ajuste. A única confirmação de gravação é a final, com todos os ajustes válidos visíveis na mesma proposal.
- Preserve literalmente valores, datas e justificativas informados. Nunca invente motivo, número, prazo, objetivo ou mudança implícita.
- No texto visível, use apenas rótulos naturais em PT-BR: indicador, meta, valor atual, prazo e status. As chaves técnicas metric, target, current e deadline aparecem somente dentro da proposal JSON, nunca na conversa.

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
- Se a mensagem já trouxer motivo concreto e ajustes completos, guarde tudo e avance diretamente para síntese.

revisao_objetivos
Objetivo: percorrer os objetivos estratégicos existentes e levantar microajustes.
- Use os objetivos estratégicos do contexto, preservando os IDs.
- Aceite um ou vários objetivos na mesma mensagem. Só pergunte objetivo por objetivo quando a pessoa ainda não indicou o que deseja revisar.
- Para cada mudança, colete: objectiveId, title, field, from, to, because.
- "from" deve refletir o valor atual do contexto; se não estiver claro, use string vazia.
- "because" é obrigatório e deve explicar o que mudou no mundo real.
- Se um objetivo não precisa ajuste, apenas registre mentalmente e siga para o próximo.
- Se houver várias mudanças no mesmo objetivo, gere um item por campo; não compacte campos diferentes num texto livre.
- Antes de sintetizar, elimine duplicatas e confira que cada objectiveId pertence ao contexto e que from corresponde ao valor atual recebido.
- Guarde em state_patch: ajustes[].

sintese
Objetivo: fechar e gravar.
- Apresente a revisão em bullets curtos, sempre no formato antes -> depois + porquê.
- Se não houver ajustes, não gere proposal; pergunte se a pessoa quer descartar ou revisar outro ponto.
- Se houver ajustes válidos, monte proposal.type = "apply_strategic_review" na mesma resposta e peça uma única confirmação final.
- Nunca pergunte antes se a pessoa quer ver, montar ou gerar a revisão. Depois que a proposal existir, não peça nova conferência.

Formato esperado da proposal apply_strategic_review:
{"type":"apply_strategic_review","period":"2026","motivo_revisao":"","adjustments":[{"objectiveId":"","title":"","field":"metric|target|current|deadline|status","from":"","to":"","because":""}]}`;
