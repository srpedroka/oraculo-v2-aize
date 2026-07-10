# Ritmo de gestao, vinculos de KPI e WhatsApp natural

## Decisoes de produto

- O fechamento mensal e o ritual estruturado: revisa objetivos, evidencias, aprendizados, confianca, bloqueios e compromisso do proximo mes.
- O pulso semanal e leve e opcional. Ele abre conversa, nao vira formulario e nao insiste sem resposta.
- O WhatsApp continua capaz de conduzir planejamento estrategico, trimestral e mensal ate a confirmacao. O app e uma superficie visual complementar, nao uma etapa obrigatoria.
- A IA pode sugerir ate dois KPIs existentes para um objetivo, mas o vinculo so e gravado depois de confirmacao humana.
- Respostas no WhatsApp devem soar humanas, curtas e contextuais. Menus e listas aparecem apenas quando ajudam a resolver ambiguidade.

## Fatia 1 - Fundacao

- Adicionar detalhes estruturados ao check-in mensal.
- Adicionar contexto temporario nas conversas para reconhecer respostas ao pulso semanal.
- Adicionar configuracao de pulso semanal ao WhatsApp da empresa.
- Criar `objective_kpi_links` com RLS de membro-le e autor-do-objetivo-escreve.
- Criar log protegido de envios semanais para deduplicacao.

## Fatia 2 - Ritmo mensal e semanal

- Ampliar o condutor de fechamento mensal com confianca, bloqueios e compromisso seguinte.
- Criar Edge Function agendada para convidar coordenadores com plano ativo a compartilhar a semana.
- Interpretar a resposta livre, inclusive audio, e pedir confirmacao antes de transforma-la em atualizacao.
- Nao reenviar nem cobrar resposta na mesma semana.

## Fatia 3 - KPI sugerido pela IA

- Criar Edge Function `suggest-objective-kpis` usando a funcao de IA `background`.
- Limitar a resposta aos KPIs existentes da empresa, com no maximo dois vinculos e justificativa curta.
- Exibir a sugestao depois da criacao/edicao manual e permitir aceitar, recusar, conectar ou desconectar.
- Permitir que propostas de planejamento tragam os mesmos vinculos, sempre visiveis antes da confirmacao.
- Mostrar nos cards de KPI quais objetivos estao ligados ao indicador.

## Fatia 4 - WhatsApp natural e completo

- Preservar sessoes completas de planejamento e fechamento no WhatsApp.
- Manter uma pergunta por vez, resumos progressivos, pausa/retomada e proposta final confirmavel.
- Remover frases que induzem troca obrigatoria para o app.
- Reconhecer sucesso ou dificuldade antes de perguntar sobre registro.

## Aceite

- Fechamento mensal guarda confianca, bloqueio e compromisso seguinte no app e WhatsApp.
- Pulso semanal e configuravel, deduplicado, nao insiste e entende texto/audio.
- Nenhuma resposta semanal ou sugestao de KPI grava dado sem confirmacao.
- Objetivos criados manualmente ou por sessao podem ser ligados aos quatro KPIs existentes.
- Planejamento anual, trimestral e mensal termina no WhatsApp sem exigir abertura do app.
- `pnpm run lint` e `pnpm run build` passam; migrations e Edge Functions afetadas sao publicadas.
