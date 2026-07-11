# Plano: Importar historico com classificacao por IA

> Design gerado por auditoria multi-agente (2026-07-08), grounded no codigo real. Parte do pacote de melhorias — ver `plans/2026-07-08-pacote-melhorias.md`.

I have everything I need. Here is the concrete, sliced design.

---

# Design — Melhoria da Importação de Histórico (Memória Estratégica) com IA de sugestão + confirmação

## 1. Diagnóstico do que está ruim hoje

Confirmado lendo os arquivos reais:

- **`supabase/functions/save-historical-document/index.ts`** (linhas 98–100): o título é montado só com rótulos manuais — `title = requestedTitle ?? \`${TYPE_LABEL[documentType]} histórico${areaLabel} · ${period}\``. Sai "Plano Estratégico histórico · 2025". Nenhuma leitura do conteúdo.
- **`src/pages/Strategic.tsx`** (linha 92): `useState(String(new Date().getFullYear() - 1))` — o campo período já nasce preenchido com o ano passado, **silenciosamente**. O dono importa um plano de "Set 2023" e o formulário grava "2025" se ele não reparar. Tipo (linha 91) nasce fixo em `strategic`; escopo nasce em `company`. Ou seja: **três palpites silenciosos** que ninguém interpretou.
- A extração de texto (`src/lib/fileImport.ts`) já funciona bem e devolve `text` limpo. O texto existe — só não é lido por ninguém antes de gravar.
- Não há chamada de IA nenhuma nesse fluxo (Fatia 1 atual é 100% determinística/manual).

## 2. Decisão de arquitetura (onde roda)

**Nova Edge Function de análise-apenas** `suggest-historical-metadata`, separada do `save-historical-document`. Motivos:

- Respeita o padrão do projeto: análise/classificação com IA vive em função própria (espelha `_shared/intent-router.ts`, que usa `resolveAiFunction(..., "background")` + `callModel` + `recordAiUsage` + `parseJsonObject`).
- Separa **proposta** (sugerir, sem gravar) de **confirmação/gravação** (`save-historical-document`, que já valida via `assertAreaWriter`). É o mesmo desenho proposta+confirmação que o AGENTS.md exige para dados sensíveis.
- Mantém `save-historical-document` como a única fronteira de escrita, com validação server-side inalterada. O modelo nunca grava; ele só devolve um rascunho que o servidor sanitiza e o dono confirma.

Rejeitado: acrescentar `action: "suggest"` dentro de `save-historical-document`. Misturaria leitura barata com escrita sensível na mesma função e forçaria o payload de escrita a carregar campos de análise. A função de escrita deve continuar burra e validada.

**Sem migration nova.** A proveniência da sugestão (tipo/area/período sugeridos, confiança, modelo, se houve override) cabe em `plan_documents.content` (já é `jsonb`), dentro de `content.classification`. Zero churn de schema, zero mudança de RLS.

## 3. Contrato da nova função `suggest-historical-metadata`

**Request** (via store → `functions.invoke`):
```jsonc
{
  "orgId": "uuid",
  "rawText": "texto extraído (será truncado no servidor)",
  "fileName": "plano-2023.pdf | null"
}
```

**Response 200**:
```jsonc
{
  "suggestion": {
    "documentType": "strategic|quarterly|monthly",   // whitelist server-side
    "areaId": "uuid|null",                            // resolvido pelo servidor, nunca inventado
    "areaName": "Comercial|null",
    "period": "T2 2024|Set 2023|2024|\"\"",           // "" se não achou (NUNCA fabrica ano)
    "periodFound": true,
    "title": "Plano trimestral do Comercial — expansão da carteira (T2 2024)",
    "summary": "1–2 linhas do que é o documento",
    "confidence": 0.0-1.0,
    "lowConfidenceFields": ["period"],                // campos p/ UI destacar
    "source": "ai_background | heuristic"             // heuristic = IA não configurada/erro
  }
}
```

Regras server-side críticas (é aqui que "o modelo não é autoridade" acontece):

- **Área**: o prompt recebe a lista real de áreas (`id` interno oculto, nome + índice visível). O modelo devolve **nome ou índice**, nunca um id. O servidor resolve o nome contra `areas` reais por match normalizado (`normalizeTextForRouting` de `_shared/periods.ts`); se não bater com confiança, `areaId = null` (escopo Empresa). Para coordenador, a lista candidata é **só as áreas que ele coordena**.
- **Tipo**: whitelist contra `["strategic","quarterly","monthly"]` (os `*_close` ficam fora do escopo desta fatia — ver decisão aberta). Qualquer coisa fora → cai no heurístico `inferPlanningType(rawText)`.
- **Período — correção do default silencioso**: o modelo devolve `periodFound`. Se `false`, o servidor força `period = ""` e adiciona `"period"` em `lowConfidenceFields`. **Não** usar `periodForPlanning`/`yearFromText` aqui, porque essas funções fabricam `currentYear()` quando não acham data — exatamente o bug a evitar. O período só é preenchido quando de fato foi lido do texto.
- **Truncagem de custo**: enviar ao modelo só uma janela (ex.: primeiros ~6.000 chars + últimos ~2.000), não os 200k. `background` já tem `maxTokens: 2000, temperature: 0.2` em `FUNCTION_LIMITS`.
- **Uso de IA registrado**: `recordAiUsage({ client, orgId, provider, model, channel: "web", usage, settings: aiRoute.legacySettings, metadata: { aiFunction: "background", action: "historical_metadata_suggestion", fileName } })` — idêntico ao intent-router.
- **Fallback sem IA**: se `resolveAiFunction` devolver `null` (org sem provider `background`), não falhar — devolver `source: "heuristic"` usando `inferPlanningType` + match de área por nome no texto + detecção de período por regex (reaproveitar as regex de `periods.ts`, mas **sem** o default de ano). UI mostra nota leve "Preenchi por heurística; a IA de background não está configurada."

Prompt (system) no estilo do intent-router, pedindo **só JSON**: dá as definições de estratégico/trimestral/mensal, a lista de áreas com índice, a convenção de período (`"T2 2024"`, `"Set 2023"`, `"2024"`), e instrui explicitamente: *"se não houver data clara no texto, retorne period vazio e periodFound=false; nunca invente o ano."*

## 4. Fronteira de segurança / RLS

- `plan_documents` **já** tem exatamente o pedido: `plan_documents_read_org_member` (read = `is_org_member`) e `plan_documents_insert/update_owner_or_coordinator` (write = `is_owner` **ou** `area_id not null and can_write_area`). **Nada muda.**
- `suggest-historical-metadata`: `getUser` + gate `assertOrgMember` (no mínimo). Recomendado gate = **quem pode gravar histórico** (owner, ou coordenador com ≥1 área), para não gastar token de IA com quem nunca poderá salvar. A escrita real continua barrada por `assertAreaWriter` no `save-historical-document`.
- Chaves de IA continuam server-side (`resolveAiFunction` lê `ai_model_keys` via `serviceClient`). Nada de chave no cliente. `rawText` já trafega no corpo autenticado, como no fluxo atual.

## 5. Fatias (pequenas, testáveis, na ordem de merge)

### Fatia 0 — Corrigir o default silencioso do período (sem IA, quick win)
- **Arquivo**: `src/pages/Strategic.tsx`.
- **Mudança**: `historicalPeriod` inicial `""` (não `getFullYear()-1`); manter validação "Informe o ano ou período" (já existe, linha 273); microcopy no placeholder deixando claro o formato (`2024`, `T3 2024`, `Set 2024`).
- **Aceite**: (a) o campo período vem **vazio**; (b) salvar sem período bloqueia com mensagem clara; (c) nenhum ano é gravado sem o dono ter digitado/confirmado. Testável sem backend.

### Fatia 1 — Edge Function `suggest-historical-metadata` (server-side, IA background, sem escrita)
- **Arquivos novos**:
  - `supabase/functions/suggest-historical-metadata/index.ts` (fino: CORS, `getUser`, gate, parse do body, truncagem, chama o classifier, `jsonResponse`).
  - `supabase/functions/_shared/historical-classifier.ts` (prompt + `callModel` + `recordAiUsage` + `parseJsonObject` + resolução defensiva de área/tipo/período + fallback heurístico). Espelha `intent-router.ts` para ficar unit-testável isolado.
- **Reusa**: `_shared/ai-router.ts`, `_shared/model.ts`, `_shared/usage.ts`, `_shared/json.ts`, `_shared/periods.ts`, `_shared/auth.ts`, `_shared/cors.ts`.
- **Aceite**:
  - Com IA configurada, um plano trimestral do Comercial de 2024 retorna `documentType:"quarterly"`, `areaId` do Comercial, `period:"T2 2024"`, `title` descritivo, `confidence>0.5`.
  - Texto sem data → `period:""`, `periodFound:false`, `"period"` em `lowConfidenceFields`. **Nunca** retorna ano fabricado.
  - Área inexistente/ambígua → `areaId:null` (Empresa).
  - Org sem provider `background` → `source:"heuristic"`, resposta 200 (não quebra).
  - `ai_usage_logs` ganha 1 linha por chamada bem-sucedida com `metadata.action = "historical_metadata_suggestion"`.
  - Coordenador só recebe áreas candidatas que coordena.
  - `pnpm run lint` limpo.

### Fatia 2 — Store + UI de proposta/confirmação
- **Arquivos**: `src/state/store.tsx` (nova action `suggest_historical_metadata` com `onSuccess(suggestion)/onError`, no molde de `import_historical_document`, linhas 50–61 / 1147–1166; `callEdgeFunction("suggest-historical-metadata", ...)` + `invalidateQueries(["ai_usage_logs", orgId])`), e `src/pages/Strategic.tsx`.
- **UX** (mantendo cockpit limpo): após importar/colar o texto, botão **"Interpretar com o Oráculo"** → mostra um cartão de proposta leve que **pré-preenche** os campos já existentes (Tipo, Escopo, Período, + novo campo Título) com a sugestão; campos marcados em `lowConfidenceFields` ganham destaque discreto ("confирme o período"); nota de `summary`. O dono **edita à vontade** e clica **"Salvar histórico"** (fluxo de escrita inalterado). Nada é gravado até o clique — proposta + confirmação.
- **Aceite**: importar → interpretar → os selects/inputs aparecem preenchidos e **editáveis**; ajustar qualquer campo e salvar grava o valor ajustado; sem clicar em salvar, nada vai ao banco; se a IA não estiver configurada, o botão ainda funciona (heurística) com nota leve.

### Fatia 3 — Persistir proveniência e título no `save-historical-document`
- **Arquivo**: `supabase/functions/save-historical-document/index.ts`.
- **Mudança**: aceitar campo opcional `classification` (o `suggestion` mais flags `overridden` por campo, calculadas no cliente comparando sugerido × confirmado) e gravá-lo em `content.classification`. Título: continuar aceitando `requestedTitle` (agora sempre vem da confirmação); manter o fallback determinístico atual só para o caso de título vazio, mas ele deixa de ser o caminho normal. Whitelist de `documentType`, `period` obrigatório e limites **permanecem** (nada afrouxa a validação server-side).
- **Aceite**: documento salvo tem `content.classification` com `source`, `confidence`, `overridden`; título gravado é o descritivo confirmado; validações server-side (tipo válido, período não-vazio, tamanho) seguem barrando payload inválido mesmo que o cliente mande lixo.

### Fatia 4 — Docs + endurecimento
- **Arquivos**: `AGENTS.md` (lista de Edge Functions, §5), `docs/ARCHITECTURE.md`, `docs/SECURITY.md` (nova função lê chave via service_role, registra uso), `docs/CHANGELOG.md`, `docs/RUNBOOK.md` (deploy: `supabase functions deploy suggest-historical-metadata --project-ref ... --use-api`).
- **Aceite**: `pnpm run lint && pnpm run build` limpos; docs citam a função nova e o fluxo proposta+confirmação; runbook com o comando de deploy.

## 6. Arquivos afetados (resumo)

| Arquivo | Fatia | Ação |
|---|---|---|
| `src/pages/Strategic.tsx` | 0, 2 | período default vazio; cartão de proposta editável |
| `supabase/functions/suggest-historical-metadata/index.ts` | 1 | **novo** — handler fino |
| `supabase/functions/_shared/historical-classifier.ts` | 1 | **novo** — prompt/parse/fallback |
| `src/state/store.tsx` | 2 | nova action + tipo em `AppAction` |
| `supabase/functions/save-historical-document/index.ts` | 3 | aceitar/gravar `content.classification` |
| `AGENTS.md`, `docs/*` | 4 | documentação obrigatória |

Sem migration; RLS de `plan_documents` já atende (`is_org_member` lê; `is_owner`/coordenador-da-área escreve).

## 7. Decisões de produto em aberto (não inventei — sinalizo)

1. **Disparo da IA**: botão explícito "Interpretar" (recomendado, controla custo) **vs** auto-disparar ao importar o arquivo. Auto gasta token sem intenção; explícito exige 1 clique. Preferência do dono?
2. **Tipos detectados**: só `strategic/quarterly/monthly` (escopo do pedido) **vs** também `month_close/quarter_close` (fechamentos). Sugiro começar com os 3 e ampliar depois.
3. **Proveniência**: guardar em `content.classification` (recomendado, zero migration) **vs** coluna `classification jsonb` dedicada (permite relatório "quantos históricos foram IA-assistidos", mas exige migration + RLS review). 
4. **Quem pode importar histórico**: hoje coordenador pode gravar histórico da própria área. Manter, ou tornar histórico **owner-only**? O pedido cita "is_owner escreve" — se for para travar em owner, é mudança de política (ajustar policy de insert + gate). Preciso de confirmação antes de restringir, para não quebrar coordenadores.
5. **Gate de custo do suggest**: qualquer `is_org_member` pode pedir sugestão, ou só quem pode gravar (owner/coordenador)? Recomendo o segundo para alinhar custo a capacidade.
6. **Limiar de confiança** para marcar um campo como "confirme" (ex.: `< 0.6`) e **tamanho da janela** de texto enviada ao modelo (proposta: 6k início + 2k fim).
7. **Lote**: o dono importou **2 planos**. Suportar fila multi-arquivo (interpreta e confirma um a um) nesta rodada, ou manter um-por-vez? Sugiro um-por-vez agora e fila como melhoria futura.
8. **Comportamento heurístico**: quando não há IA `background`, preencher por heurística com nota leve (recomendado) **vs** desabilitar o botão e pedir configurar IA.

**Contexto que carreguei da memória**: conforme `oraculo-infra-validar-antes.md`, esta é só a fase de design — antes de marcar "pronto", validar a Fatia 1 no Supabase real (função responde, `ai_usage_logs` registra, área resolve certo) e não assumir que integração está segura sem testar no sistema real.
