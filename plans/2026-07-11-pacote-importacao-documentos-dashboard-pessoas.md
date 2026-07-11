# Plano: importacao historica, Documentos, numeros do Dashboard e Pessoas

> **STATUS: concluido pelo Grok CLI.** Fatias 1–5 entregues (Pessoas, numeros Dashboard, Documentos, classificacao estruturada, conflitos+backup).

## 1. Objetivo do pacote

Fechar quatro pontos do uso real do Oraculo sem aumentar a complexidade aparente do cockpit:

1. tornar a troca de area de uma pessoa transacional e confiavel;
2. deixar os numeros executivos curtos e padronizados no Dashboard;
3. colocar a importacao de historico no lugar conceitualmente correto, a tela Documentos;
4. evoluir a importacao para identificar documentos, titulos, areas, anos, periodos e tabelas separadamente, pedindo decisao humana quando houver conflito e preservando as alternativas para retorno.

## 2. Decisoes do dono (nao reabrir)

- O `owner` **pode editar nome e celular das pessoas**. Manter essa capacidade.
- Convite nao sera enviado por email. O convite e **somente por WhatsApp**, com uma mensagem natural e o link pessoal para abrir o app.
- Se nao houver celular valido ou WhatsApp ativo/configurado, nao fingir que convidou: mostrar o requisito e manter apenas o cadastro silencioso.
- O resgate de KPI pode continuar ignorando meses parcialmente preenchidos. O dono completa Meta/Atingido manualmente depois. Nao mexer em `filterOnlyGaps` neste pacote.
- A IA nunca escolhe silenciosamente entre tabelas conflitantes. Ela apresenta as opcoes e o usuario decide.
- Arquivo/imagem bruto nao e persistido. O backup recuperavel guarda somente texto extraido, tabelas normalizadas, metadados, conflitos e a escolha feita.
- Nenhuma importacao grava plano ativo, objetivo ou KPI automaticamente. Historico continua em `plan_documents(origin = historical)` e exige confirmacao.
- Cockpit limpo: sem wizard longo ocupando a pagina, sem cards decorativos e sem linguagem tecnica na interface.

## 3. Resultado esperado para o usuario

### Pessoas

- O owner escolhe a area de uma pessoa.
- A interface aguarda o servidor concluir toda a troca.
- Ou todas as areas antigas sao removidas e a nova e vinculada, ou nada muda.
- O botao de convite se chama `Convidar pelo WhatsApp`.
- A pessoa recebe no WhatsApp uma mensagem curta com o nome da empresa e o link pessoal do app.

### Dashboard

- Valores financeiros e contagens usam abreviacao consistente:
  - `R$ 850 mil`;
  - `R$ 1,2 mi`;
  - `R$ 2,4 bi`;
  - `18,5 mil` unidades;
  - `12,4%` para percentuais.
- O valor completo continua acessivel em tooltip/title e em campos de edicao.
- Atual, Meta, YTD, projecao e Caixa seguem a mesma regra.

### Documentos e importacao

- `Documentos` ganha a acao primaria `Importar historico`.
- O bloco de importacao sai de `Plano Estrategico`.
- Um arquivo pode gerar uma ou mais sugestoes de documento, cada uma com:
  - titulo curto;
  - tipo;
  - area;
  - periodo;
  - resumo;
  - texto correspondente;
  - tabelas identificadas;
  - confianca por campo.
- Quando duas tabelas trouxerem informacoes concorrentes, a tela pergunta qual usar e mostra uma previa comparavel.
- O documento salvo preserva as alternativas extraidas e a decisao tomada. A partir dele, o usuario pode reabrir a importacao e escolher outra leitura, criando uma nova versao sem apagar a anterior.

## 4. Contratos tecnicos comuns

### 4.1 Formato canonico de periodo

- anual: `2025`;
- trimestre: `T2 2025`;
- mes: `Mai 2025`;
- intervalo comprovado por tabela/documento: `2024-2025` na persistencia e `2024–2025` apenas na exibicao;
- sem evidencia suficiente: string vazia e `periodFound = false`.

Nunca transformar toda mencao a dois anos em intervalo. `2025` e `2030` em uma narrativa de visao nao significam automaticamente periodo `2025-2030`. A faixa so pode nascer de cabecalho de tabela, titulo claramente temporal ou declaracao explicita de vigencia.

### 4.2 Titulos

- PT-BR, entre 3 e 10 palavras, maximo de 100 caracteres.
- Nao colar texto bruto, JSON, resumo inteiro ou nome do arquivo como titulo.
- Nao repetir area e periodo no titulo quando eles ja aparecem nos campos proprios.
- Exemplos bons: `Planejamento comercial`, `Resultado mensal de producao`, `Prioridades de pessoas`.

### 4.3 Areas

- A IA recebe somente as areas ativas permitidas para o usuario.
- `areaId` precisa ser um id candidato real ou `null` para empresa.
- Nome parecido, abreviacao ou departamento desconhecido gera baixa confianca; nunca inventar id.
- Coordenador continua restrito a sua propria area. Owner pode importar para empresa ou qualquer area. Admin continua sem importar historico neste pacote.

### 4.4 Confirmacao e reversibilidade

- Toda resposta da IA e proposta.
- O servidor revalida tipo, area, periodo, tamanho e permissao.
- Reprocessar uma importacao cria nova versao; nunca atualiza ou apaga silenciosamente o documento anterior.
- O backup organizacional existente ja inclui `plan_documents`; os novos campos em `content` devem continuar portateis pela restauracao.

---

## FATIA 1 - Pessoas: area transacional e convite somente por WhatsApp

### 1.1 Migration/RPC

Criar migration `supabase/migrations/<timestamp>_set_member_primary_area.sql` com RPC `public.set_member_primary_area(p_org_id uuid, p_membership_id uuid, p_area_id uuid default null)`:

- `security definer` e `set search_path = public`;
- revogar execucao de `public`, `anon` e `authenticated`; conceder apenas a `service_role`;
- bloquear as linhas relevantes de `memberships` e `areas` (`for update`);
- validar que membership pertence a empresa;
- recusar membership `owner` como coordenador de area, preservando a regra atual da UI;
- se `p_area_id` existir, validar que pertence a empresa e esta ativa;
- limpar `coordinator_id` de todas as areas ativas atualmente vinculadas a essa membership;
- vincular a nova area, se informada;
- retornar ids das areas alteradas;
- tudo na mesma transacao PostgreSQL.

### 1.2 Edge Function

Criar `supabase/functions/set-member-area/index.ts`:

- `POST` e CORS padrao;
- `getUser` + `assertOwner(user.id, orgId)`;
- body `{ orgId, membershipId, areaId: string | null }`;
- validar UUIDs e chamar a RPC com `serviceClient`;
- retornar `{ ok: true, changedAreaIds }`;
- JWT normal, sem `--no-verify-jwt`.

### 1.3 Store/UI

- Criar action `set_member_area` com `onSuccess` e `onError`.
- Em `Settings.tsx`, substituir o loop de varios `update_area` por uma unica chamada a `set-member-area`.
- Manter o select desabilitado ate a resposta.
- Mostrar sucesso somente depois da resposta server-side.
- Em erro, manter a selecao refletindo o estado do banco e exibir a mensagem.

### 1.4 Convite WhatsApp-only

Em `invite-member`:

- remover a chamada `inviteUserByEmail` e os retornos `channel = email|link`;
- manter `generateLink(invite -> magiclink)` para criar/localizar o acesso pessoal;
- `notify = false`: apenas cria/atualiza cadastro e membership, sem mensagem;
- `notify = true`: exigir celular valido, WhatsApp habilitado, chave da instancia e `action_link`;
- enviar pelo WhatsApp uma mensagem natural com:
  - primeiro nome;
  - nome da empresa;
  - explicacao curta de que o acesso ao Oraculo esta pronto;
  - link pessoal para abrir o app;
  - aviso para nao encaminhar o link;
- retornar apenas `channel = whatsapp|none`;
- se o envio falhar, retornar erro claro. A membership pode continuar criada para permitir reenvio idempotente.

Na UI:

- renomear para `Convidar pelo WhatsApp`;
- esconder/desabilitar quando nao houver celular e explicar `Cadastre o celular para convidar`;
- se WhatsApp da empresa estiver desligado, explicar `Ative o WhatsApp da empresa para convidar`;
- remover textos sobre email e link copiavel.

### 1.5 Validacao

- owner edita nome/celular de outra pessoa: continua funcionando;
- cadastro silencioso: nao envia mensagem;
- convite com celular + WhatsApp: mensagem chega com link do app;
- convite sem celular: erro/requisito claro, nenhum sucesso falso;
- troca de area valida: remove vinculos antigos e deixa somente a escolhida;
- simular area invalida: nenhuma area e alterada;
- chamada sem sessao de `set-member-area`: HTTP 401;
- `pnpm run lint && pnpm run build`.

### 1.6 Deploy e commit

- aplicar migration;
- deploy `set-member-area` e `invite-member`;
- deploy frontend Netlify;
- commit: `Pessoas: area transacional e convite por WhatsApp`;
- push e confirmar `git log --oneline -3`.

---

## FATIA 2 - Padrao executivo para numeros do Dashboard

### 2.1 Helper unico

Refatorar `src/lib/kpi.ts` para nao depender do texto variavel de `Intl notation: compact` como contrato visual. Criar duas funcoes explicitas:

- `formatKpiCompact(value, unit)` para cards/graficos;
- `formatKpiFull(value, unit)` para tooltip, acessibilidade, impressao e conferencia.

Regras compactas:

- modulo `>= 1_000_000_000`: dividir por bilhao e sufixar `bi`;
- modulo `>= 1_000_000`: dividir por milhao e sufixar `mi`;
- modulo `>= 1_000`: dividir por mil e sufixar `mil`;
- abaixo disso: valor normal;
- no maximo uma casa decimal; remover decimal zero;
- preservar sinal negativo;
- moeda: prefixo `R$ `;
- percentual: nunca abreviar e usar ate uma casa decimal;
- count/number: sem simbolo monetario.

### 2.2 Aplicacao

Aplicar o helper compacto em todos os valores do bloco `Resultado`:

- atingido do mes;
- Meta;
- quantidade secundaria;
- YTD/media;
- meta anual;
- projecao;
- saldo, geracao e media movel de Caixa;
- previa de importacao de KPI.

Cada texto compacto deve ter `title` com `formatKpiFull` quando houver valor. Inputs do editor continuam com numero integral, sem abreviacao.

### 2.3 Casos obrigatorios

- `999` -> `R$ 999`;
- `1_000` -> `R$ 1 mil`;
- `1_250` -> `R$ 1,3 mil`;
- `999_999` -> `R$ 1 mi` somente se o arredondamento adotado for consistente; preferir evitar salto prematuro exibindo `R$ 1.000 mil` ou ajustar o limiar de arredondamento com teste documentado;
- `1_200_000` -> `R$ 1,2 mi`;
- `2_400_000_000` -> `R$ 2,4 bi`;
- `-1_250_000` -> `-R$ 1,3 mi`;
- `12.45%` -> `12,5%`;
- nulo -> `—`.

Escolher e testar uma regra clara para os limites de arredondamento; nao deixar `1000 mil` na UI final.

### 2.4 Validacao/deploy

- adicionar testes unitarios leves para o helper se o projeto ganhar runner nesta fatia; caso contrario, criar uma tabela de casos executavel pelo TypeScript e registrar a verificacao manual;
- revisar desktop e mobile para valores nao quebrarem os cards;
- `pnpm run lint && pnpm run build`;
- deploy frontend;
- commit: `Dashboard: padroniza numeros em milhoes e milhares`;
- push e confirmar `git log --oneline -3`.

---

## FATIA 3 - Importar historico em Documentos

### 3.1 Extrair componente

Extrair o fluxo hoje embutido em `src/pages/Strategic.tsx` para um componente dedicado, por exemplo:

`src/features/history/HistoricalImportDialog.tsx`

O componente deve concentrar:

- upload/drag-and-drop;
- leitura de PDF, PPTX, DOCX, TXT, JPG, PNG e WEBP;
- texto colado/editavel;
- chamada de classificacao;
- previa estruturada;
- confirmacao e mensagens de erro.

Nao duplicar o fluxo entre paginas.

### 3.2 Nova entrada em Documentos

Em `Documents.tsx`:

- adicionar botao `Importar historico` com icone `Upload` no cabecalho;
- mostrar apenas para owner ou coordenador com ao menos uma area ativa gravavel;
- abrir `HistoricalImportDialog`;
- apos salvar, invalidar `plan_documents`, fechar o dialogo e selecionar o novo documento;
- no estado vazio, manter a acao disponivel.

Em `Strategic.tsx`:

- remover integralmente a UI/estado de `Documento historico`;
- manter apenas criacao, importacao e revisao do plano estrategico ativo;
- nao deixar botao duplicado apontando para o dialogo.

### 3.3 Textos da interface

- Documentos: `Importe planos, relatorios e tabelas antigas. O Oraculo organiza os campos e voce confirma antes de salvar.`
- Evitar `assunto`, `normalizedText`, `classificacao`, `JSON`, `OCR` e outros termos tecnicos visiveis.

### 3.4 Validacao/deploy

- permissao owner/coordenador/admin igual ao comportamento anterior;
- todos os formatos continuam aceitos;
- Plano Estrategico fica sem a importacao historica;
- Documentos abre e fecha o dialogo em desktop/mobile, sem overflow;
- nenhuma gravacao automatica ao selecionar arquivo;
- `pnpm run lint && pnpm run build`;
- deploy frontend;
- commit: `Documentos: centraliza importacao de historico`;
- push e confirmar `git log --oneline -3`.

---

## FATIA 4 - Classificacao estruturada e separacao de documentos/tabelas

### 4.1 Novo contrato da sugestao

Evoluir `suggest-historical-metadata` para retornar:

```ts
interface HistoricalImportSuggestion {
  sourceName: string | null;
  extractedText: string;
  candidates: HistoricalDocumentCandidate[];
  conflicts: HistoricalConflict[];
  warnings: string[];
}

interface HistoricalDocumentCandidate {
  id: string;
  title: string;
  documentType: "strategic" | "quarterly" | "monthly";
  areaId: string | null;
  areaName: string | null;
  period: string;
  periodFound: boolean;
  summary: string;
  normalizedText: string;
  tableIds: string[];
  confidence: {
    title: number;
    documentType: number;
    area: number;
    period: number;
  };
  lowConfidenceFields: string[];
}

interface HistoricalTableCandidate {
  id: string;
  label: string;
  headers: string[];
  normalizedText: string;
  years: number[];
  rowCount: number;
  fingerprint: string;
}

interface HistoricalConflict {
  id: string;
  kind: "table_choice" | "period" | "area" | "duplicate" | "value";
  message: string;
  candidateIds: string[];
  tableIds: string[];
  required: boolean;
}
```

Os tipos podem ser ajustados ao padrao do repositorio, mas esses dados precisam existir semanticamente.

### 4.2 Pipeline em duas etapas

1. **Extracao/segmentacao deterministica**:
   - preservar texto original extraido;
   - detectar cabecalhos, secoes, tabelas, quebras fortes e nomes de area;
   - separar tabelas em candidatos, sem escolher uma;
   - expandir tabela multi-ano somente dentro do bloco tabular detectado;
   - calcular fingerprint estavel para detectar duplicatas.
2. **Classificacao pela IA background**:
   - receber segmentos + areas candidatas + nome do arquivo;
   - devolver somente JSON estruturado;
   - propor um ou mais documentos quando o arquivo contiver conteudos independentes;
   - nunca usar o documento inteiro como titulo;
   - devolver confianca por campo e conflitos explicitos.

Se a IA falhar, o fallback deve criar ao menos um candidato editavel com texto preservado, titulo curto derivado do filename/cabecalho e periodo vazio quando ambiguo.

### 4.3 Regras de conflito

Gerar conflito obrigatorio quando:

- duas tabelas parecem representar o mesmo indicador/assunto e periodo, mas possuem valores diferentes;
- titulo/cabecalho indica um ano e a tabela indica outro;
- duas areas reais sao igualmente provaveis;
- o mesmo trecho aparece duplicado com fingerprints diferentes ou valores divergentes;
- uma tabela multi-ano pode ser interpretada como totais anuais ou linhas mensais sem evidencia suficiente.

Nao gerar conflito quando as tabelas sao claramente complementares e pertencem ao mesmo documento; apenas vincular todos os `tableIds` ao candidato.

### 4.4 Correcao especifica de periodo

Remover o comportamento que usa todos os anos mencionados no texto para forcar uma faixa. `suggestionWithMultiYearPeriod` so pode sobrescrever o periodo quando:

- `expandMultiYearTables` realmente expandiu uma tabela; e
- os anos vieram das colunas dessa tabela; e
- nao existe conflito com titulo/cabecalho.

Narrativas com `2025` e `2030` continuam classificadas pela vigencia explicita ou ficam pendentes de confirmacao.

### 4.5 Limites e seguranca

- maximo de 12 candidatos de documento;
- maximo de 20 tabelas;
- maximo de 200 mil caracteres extraidos no request;
- maximo de 120 mil caracteres somados nos textos candidatos retornados;
- conteudo importado e nao confiavel: prompt deve ignorar instrucoes presentes nele;
- imagem/base64 nunca entra na resposta persistivel;
- registrar uso da IA como `background` e acao `historical_import_classification`.

### 4.6 Validacao/deploy

Fixtures manuais obrigatorias:

- plano narrativo com anos 2025 e 2030: nao vira faixa automaticamente;
- tabela `Mes | Total 2025 | Total 2026`: separa anos corretamente;
- duas tabelas com valores divergentes para o mesmo periodo: conflito obrigatorio;
- documento com titulo, area e trimestre claros: campos preenchidos corretamente;
- documento sem periodo: periodo vazio;
- imagem com duas tabelas: ambas aparecem como candidatas;
- retorno da IA com JSON incompleto/vazio: texto nunca vira JSON na UI.

Rodar `pnpm run lint && pnpm run build`; deploy `suggest-historical-metadata`; commit `Historico: classifica documentos e conflitos por IA`; push e confirmar log.

---

## FATIA 5 - Previa de conflitos, gravacao e backup recuperavel

### 5.1 UI de revisao

No `HistoricalImportDialog`, apos a classificacao:

- mostrar lista compacta de documentos candidatos;
- cada candidato tem campos editaveis de titulo, tipo, area e periodo;
- mostrar resumo e primeiras linhas do texto/tabela;
- permitir selecionar quais candidatos serao salvos;
- conflito obrigatorio aparece antes do botao de confirmar;
- para `table_choice`, usar radio buttons: somente uma alternativa por conflito;
- mostrar cabecalhos, anos, quantidade de linhas e ate cinco linhas de previa lado a lado/empilhadas;
- desabilitar `Salvar historico` enquanto houver conflito obrigatorio sem escolha;
- nao expor JSON nem termos internos.

### 5.2 Backup das alternativas

Estender `save-historical-document` para aceitar, sanitizar e salvar em `content.import_backup`:

```ts
{
  schemaVersion: 1,
  batchId: string,
  sourceName: string | null,
  sourceKind: "text" | "document" | "image",
  extractedText: string,
  candidates: Array<{
    id: string,
    title: string,
    normalizedText: string,
    tableIds: string[]
  }>,
  tables: HistoricalTableCandidate[],
  conflicts: HistoricalConflict[],
  decisions: Array<{
    conflictId: string,
    selectedCandidateId?: string,
    selectedTableId?: string
  }>,
  savedCandidateId: string
}
```

Regras:

- nao confiar no payload do navegador; revalidar e limitar tudo no servidor;
- nao guardar base64, blob, URL temporaria ou arquivo bruto;
- limitar `import_backup` a 200 mil caracteres serializados;
- se exceder, preservar texto extraido + decisoes + fingerprints e truncar somente previas redundantes, registrando warning;
- `content.raw` guarda apenas o texto do candidato escolhido;
- cada candidato selecionado vira um `plan_document` proprio;
- todos recebem o mesmo `batchId`;
- usar insert em lote, depois de validar todos, para evitar metade da importacao salva;
- calcular versao por tipo/area/periodo e preservar documentos anteriores.

### 5.3 Retornar e escolher outra tabela

Em um documento historico com `content.import_backup`:

- adicionar comando `Reabrir importacao` em Documentos;
- abrir o dialogo ja preenchido com candidatos, tabelas, conflitos e decisoes anteriores;
- permitir trocar a tabela/candidato e revisar metadados;
- ao salvar, criar nova versao do documento;
- nao arquivar nem alterar automaticamente a versao anterior;
- mostrar mensagem `Nova versao salva. A anterior continua no historico.`

### 5.4 Renderizacao

Atualizar `PlanDocumentView` para historicos mostrar no cabecalho, quando existir:

- titulo;
- tipo;
- area;
- periodo;
- fonte/nome do arquivo;
- resumo curto;
- badge discreto `Importado com revisao`.

O corpo mostra `content.raw`, nunca o backup tecnico completo.

### 5.5 Validacao final

Executar E2E controlado, sem usar documento real insubstituivel:

1. importar um TXT com titulo/area/periodo claros;
2. importar imagem com duas tabelas conflitantes;
3. confirmar que o botao fica bloqueado ate escolher;
4. escolher tabela A e salvar;
5. abrir o documento, usar `Reabrir importacao`, escolher tabela B;
6. salvar e confirmar duas versoes preservadas;
7. conferir que arquivo/imagem bruto e base64 nao aparecem no banco;
8. conferir que o backup organizacional inclui os novos campos de `plan_documents` sem mudanca de schema;
9. conferir permissao de owner e coordenador; admin bloqueado;
10. revisar mobile e desktop.

Rodar `pnpm run lint && pnpm run build`; deploy `save-historical-document`, `suggest-historical-metadata` se alterada novamente e frontend; commit `Historico: revisao de conflitos e backup recuperavel`; push e confirmar log.

---

## 5. Documentacao obrigatoria

No mesmo ciclo, atualizar:

- `docs/CHANGELOG.md`;
- `docs/ARCHITECTURE.md`;
- `docs/SECURITY.md` para registrar que owner pode editar celular de membros e que esse campo identifica o WhatsApp;
- `docs/RUNBOOK.md` com convite WhatsApp-only, troca de area e recuperacao de importacao;
- `AGENTS.md` se Edge Function/RPC/fluxo principal mudar;
- `.agents-private/handoff-do-grok.md` no topo;
- blocos curtos em `.agents-private/handoff-para-codex.md` e `.agents-private/handoff-para-claude.md`.

## 6. Comandos obrigatorios por fatia

```bash
git pull --rebase
pnpm run lint
pnpm run build
git status
git add -A
git commit -m "<mensagem definida na fatia>"
git push
git log --oneline -3
```

Quando houver migration:

```bash
pnpm dlx supabase@latest db push --linked
pnpm dlx supabase@latest db lint --linked --level warning
```

Deploy de function com JWT normal:

```bash
pnpm dlx supabase@latest functions deploy <funcao> --project-ref bkswkfazkjilwfzwzthz --use-api
```

Frontend:

```bash
pnpm --package=netlify-cli@latest dlx netlify deploy --prod --dir=dist --no-build
```

Confirmar que o asset `index-*.js` de producao e o mesmo de `dist/index.html`.

## 7. Criterio de conclusao do pacote

O pacote so esta concluido quando:

- a troca de area e atomica e nao mostra sucesso antecipado;
- convites sao enviados apenas por WhatsApp e levam ao app;
- os numeros do Dashboard seguem `mil/mi/bi` de forma consistente;
- a importacao historica existe em Documentos e saiu do Plano Estrategico;
- titulo, tipo, area e periodo aparecem como campos separados e editaveis;
- arquivos com mais de um documento/tabela geram candidatos separados;
- conflitos exigem escolha humana;
- a alternativa nao escolhida pode ser recuperada sem guardar o arquivo bruto;
- lint/build/deploy/migration/commit/push foram comprovados;
- nenhuma empresa ou documento real foi alterado durante testes sem confirmacao explicita do dono.
