# Plano: extracao real de metadados na importacao historica

> **STATUS: pronto para execucao pelo Grok CLI.** Este plano corrige a entrega anterior de importacao estruturada. Executar fatia por fatia, sem marcar como concluido antes do teste com o caso de aceite descrito abaixo.

## 1. Problema observado

Ao importar um documento, o texto extraido contem informacoes claras no cabecalho, mas elas permanecem apenas dentro do campo de conteudo. Os campos principais continuam com defaults incorretos ou vazios.

Caso real observado:

```text
PLANO MENSAL DE OBJETIVOS E ACOES - MARKETING - ABRIL/2026
(VERSAO FINAL AJUSTADA)

Empresa: GAAM Gabinetes
Departamento: Marketing
Gestora: Larissa
Mes/Ano: Abril/2026
Trimestre (T2 - Ativacao): ...
```

Estado incorreto atual:

- Tipo: `Plano Estrategico`;
- Escopo: `Empresa`;
- Ano ou periodo: vazio;
- Titulo: vazio;
- todas as informacoes continuam misturadas no conteudo extraido.

Resultado obrigatorio para esse exemplo:

- Tipo: `Plano Mensal`;
- Escopo/area: `Marketing`, se essa area existir ativa na empresa;
- Periodo principal: `Abr 2026`;
- Ano: `2026`;
- Trimestre relacionado: `T2 2026`;
- Titulo: `Plano mensal de objetivos e acoes`;
- Gestora da fonte: `Larissa`;
- Empresa citada: `GAAM Gabinetes`;
- Versao da fonte: `Final ajustada`;
- corpo: somente o conteudo integral para memoria/leitura, sem ser usado como substituto dos campos principais.

## 2. Principio da solucao

A importacao passa a ter tres camadas:

1. **Leitura deterministica do cabecalho:** encontra campos explicitamente rotulados antes de chamar IA.
2. **Classificacao pela IA:** confirma, complementa e segmenta, recebendo os fatos ja encontrados.
3. **Mesclagem segura:** fatos explicitos de alta confianca vencem inferencias; divergencias viram escolha do usuario.

A IA nao deve descobrir do zero aquilo que o documento escreveu claramente.

## 3. Decisoes funcionais

- Arquivo importado deve ser interpretado automaticamente depois da extracao. O usuario nao precisa clicar uma segunda vez em `Interpretar com o Oraculo`.
- O botao de interpretar permanece para reprocessar texto editado ou repetir uma leitura.
- `type`, `area_id`, `period` e `title` continuam sendo os campos principais de `plan_documents`.
- Ano, trimestre, mes, gestora, empresa citada e versao da fonte ficam estruturados em `content.source_metadata` e `classification`, sem nova tabela.
- Para plano mensal, o periodo principal e o mes (`Abr 2026`). O trimestre e contexto relacionado, nao substitui o mes.
- Para plano trimestral, o periodo principal e o trimestre (`T2 2026`).
- Para plano estrategico/anual, o periodo principal e o ano (`2026`).
- Nao criar area automaticamente. Se o texto disser `Marketing` e nao houver area compativel, mostrar a sugestao e exigir que o owner escolha uma area real ou `Empresa`.
- Nao vincular gestora automaticamente a membership. Guardar o nome da fonte; vinculo de pessoa pode ser uma melhoria posterior.
- Arquivo/imagem bruto e base64 continuam proibidos no banco.
- Toda gravacao continua dependendo de confirmacao.

## 4. Contrato estruturado

Adicionar ao retorno de `suggest-historical-metadata`:

```ts
interface HistoricalHeaderMetadata {
  documentType: "strategic" | "quarterly" | "monthly" | null;
  title: string | null;
  sourceCompany: string | null;
  sourceAreaLabel: string | null;
  matchedAreaId: string | null;
  matchedAreaName: string | null;
  managerName: string | null;
  year: number | null;
  quarter: 1 | 2 | 3 | 4 | null;
  month: number | null;
  primaryPeriod: string;
  sourceVersion: string | null;
  evidence: Array<{
    field: string;
    value: string;
    source: "title" | "label" | "body" | "filename" | "ai";
    confidence: number;
    excerpt: string;
  }>;
  conflicts: Array<{
    field: "documentType" | "area" | "year" | "quarter" | "month" | "title" | "company";
    message: string;
    values: string[];
    required: boolean;
  }>;
}
```

O nome exato dos tipos pode seguir o repositorio, mas os dados e a evidencia precisam existir.

## 5. Regras de extracao deterministica

Criar helper server-side, por exemplo `supabase/functions/_shared/historical-header.ts`.

### 5.1 Janela de cabecalho

- Examinar prioritariamente os primeiros 4.000 caracteres.
- Parar a leitura de cabecalho em marcadores como `1. CONTEXTO`, `OBJETIVOS`, `ACOES`, `DIAGNOSTICO`, `SWOT` ou apos aproximadamente 30 linhas logicas.
- Tratar como separadores: quebra de linha, `●`, `•`, `|`, tabs e sequencias de espacos.
- O extrator precisa funcionar quando PDF/DOCX achatar o cabecalho em um unico paragrafo.

### 5.2 Tipo do documento

Prioridade:

1. titulo contendo `PLANO MENSAL`, `PLANO TRIMESTRAL` ou `PLANO ESTRATEGICO`;
2. campo rotulado `Tipo:`;
3. mes/trimestre explicito;
4. IA/fallback.

Um titulo `PLANO MENSAL ...` deve preencher `monthly` mesmo que o estado inicial da UI seja `strategic`.

### 5.3 Area

Reconhecer rotulos:

- `Area:`;
- `Departamento:`;
- `Setor:`;
- `Unidade:`.

Normalizar acentos, caixa, pontuacao e termos como `Departamento de`. Comparar somente com areas ativas permitidas:

1. nome normalizado exato;
2. alias/abreviacao exata;
3. sobreposicao forte de tokens;
4. sem correspondencia: `matchedAreaId = null` e conflito de area.

`Departamento: Marketing` deve selecionar a area real `Marketing`, nao `Empresa`.

### 5.4 Tempo

Reconhecer:

- `Mes/Ano: Abril/2026`;
- `Competencia: 04/2026`;
- `Periodo: Abr 2026`;
- `Trimestre: T2`;
- `Trimestre (T2 - Ativacao)`;
- `Ano: 2026`;
- datas no titulo, como `ABRIL/2026`.

Canonicalizacao:

- meses: `Jan`, `Fev`, `Mar`, `Abr`, `Mai`, `Jun`, `Jul`, `Ago`, `Set`, `Out`, `Nov`, `Dez`;
- trimestre: `T1 2026` a `T4 2026`;
- ano: inteiro 2000-2100.

Derivacao:

- abril implica T2;
- se documento trouxer `Abr 2026` e `T2`, os dados se confirmam;
- se trouxer `Abr 2026` e `T3`, criar conflito obrigatorio;
- trimestre sem ano herda ano somente quando mes/ano ou titulo fornecer um unico ano claro;
- mencoes estrategicas como `visao 2030` no corpo nao substituem o ano do cabecalho.

### 5.5 Titulo

- Comecar pela primeira linha/titulo real.
- Remover area, periodo e marcadores de versao que ja terao campos proprios.
- Remover sufixos como `VERSAO FINAL`, `AJUSTADA`, `APROVADA`, guardando-os em `sourceVersion`.
- Limite de 100 caracteres e preferencia de 3 a 10 palavras.
- Nunca usar o texto integral, JSON ou o primeiro paragrafo inteiro como titulo.

Exemplo:

```text
PLANO MENSAL DE OBJETIVOS E ACOES - MARKETING - ABRIL/2026 (VERSAO FINAL AJUSTADA)
```

vira:

```text
Titulo: Plano mensal de objetivos e acoes
Area: Marketing
Periodo: Abr 2026
Versao: Final ajustada
```

### 5.6 Outros campos

Reconhecer e guardar, sem criar relacionamentos automaticos:

- `Empresa:` -> `sourceCompany`;
- `Gestor:`, `Gestora:`, `Responsavel:` -> `managerName`;
- `Versao:` ou marcador no titulo -> `sourceVersion`.

Se `sourceCompany` for claramente diferente da empresa ativa, gerar aviso/conflito de empresa. Nao trocar `org_id`.

---

## FATIA 0 - Corrigir a fundacao estruturada anterior

Antes dos metadados, fechar os problemas encontrados na auditoria:

1. Ler e sanitizar `parsed.candidates` devolvidos pela IA. Hoje o prompt pede candidatos, mas o servidor ignora esse campo e sempre cria `doc_1`.
2. Cada candidato precisa manter seu proprio texto, titulo, tipo, area e periodo.
3. Nao tratar duas tabelas diferentes do mesmo ano como conflitantes apenas por compartilharem o ano.
4. Comparar assunto/cabecalhos/indicadores antes de criar conflito:
   - Faturamento 2025 + Margem 2025 = tabelas complementares;
   - Faturamento 2025 com dois valores diferentes = conflito real.
5. Quando houver varios conflitos, aplicar todas as decisoes; nao usar apenas o primeiro `table_choice`.
6. Persistir e restaurar os metadados confirmados pelo usuario no `import_backup`. Hoje o frontend envia `confirmed`, mas o servidor descarta.
7. Para multiplos candidatos selecionados, usar insert em lote depois de validar todos. Uma falha nao pode salvar metade.

Critério: fixture com Faturamento e Margem do mesmo ano salva ambas sem exigir escolha; fixture com dois Faturamentos divergentes exige escolha.

---

## FATIA 1 - Extrator de cabecalho e mesclagem com IA

### Backend

1. Implementar `extractHistoricalHeaderMetadata(text, fileName, areas)`.
2. Executar depois da transcricao/extracao e antes da chamada de IA.
3. Incluir no prompt da IA:
   - metadados deterministas encontrados;
   - evidencias/excertos;
   - instrucao para confirmar, complementar ou declarar conflito;
   - areas candidatas reais.
4. Mesclar retorno:
   - evidencia explicita com confianca >= 0,9 vence inferencia;
   - IA pode preencher lacunas;
   - divergencia vira conflito, nunca overwrite silencioso.
5. Retornar `headerMetadata` junto de `importSuggestion`.
6. No fallback sem IA, ainda preencher tudo que estiver explicitamente rotulado.

### Testes puros obrigatorios

Criar testes/fixtures para o helper, mesmo que seja necessario adicionar um runner leve para modulos puros:

- caso real Marketing/Abril 2026/T2;
- cabecalho achatado em uma linha com bullets;
- plano trimestral `T3 2025`;
- plano anual com `visao 2030` no corpo, mas `Ano 2026` no cabecalho;
- area inexistente;
- mes e trimestre conflitantes;
- empresa citada diferente da ativa;
- titulo com versao final/aprovada.

Deploy ao final: `suggest-historical-metadata`.

Commit: `Historico: extrai metadados explicitos do cabecalho`.

---

## FATIA 2 - Interpretacao automatica e preenchimento da UI

Em `HistoricalImportDialog`:

1. Ao terminar a leitura de PDF/PPTX/DOCX/TXT, chamar automaticamente `suggest-historical-metadata`.
2. Para imagem, manter a leitura por visao e aplicar o mesmo extrator ao texto transcrito.
3. Estados visiveis:
   - `Lendo arquivo...`;
   - `Organizando tipo, area e periodo...`;
   - `Confira os campos antes de salvar.`
4. Nao deixar defaults enganosos enquanto interpreta:
   - Tipo inicia como `Selecione` ou estado neutro;
   - Escopo inicia vazio/neutro;
   - periodo e titulo vazios;
   - defaults so entram como fallback identificado, nunca parecem extracao concluida.
5. Preencher automaticamente:
   - Tipo;
   - Escopo;
   - Ano ou periodo;
   - Titulo.
6. Mostrar abaixo dos campos uma faixa discreta:
   - `Ano 2026`;
   - `T2 2026`;
   - `Gestora: Larissa`;
   - `Versao: Final ajustada`.
7. Campo grande passa a ter label explicita `Conteudo extraido` e fica visualmente depois dos metadados.
8. Evidencia de baixa confianca aparece junto do campo correspondente, nao apenas num aviso generico.
9. Conflito exige escolha antes de salvar.
10. `Interpretar com o Oraculo` continua disponivel para reprocessar texto editado.

Critério visual: no caso real, os quatro campos principais aparecem preenchidos sem clique extra e antes do usuario salvar.

Deploy frontend ao final.

Commit: `Historico: preenche campos automaticamente ao importar`.

---

## FATIA 3 - Persistencia, reabertura e uso dos metadados

### Salvamento

Estender `save-historical-document` para aceitar e sanitizar:

```ts
content.source_metadata = {
  sourceCompany,
  sourceAreaLabel,
  managerName,
  year,
  quarter,
  month,
  sourceVersion,
  evidence
};
```

Regras:

- `type`, `area_id`, `period`, `title` usam os valores confirmados da UI;
- `source_metadata` nunca decide permissao;
- limitar textos e arrays no servidor;
- nao guardar base64 ou arquivo bruto;
- `import_backup.confirmed` precisa preservar tipo, area, periodo, titulo e `source_metadata`;
- reabrir importacao restaura primeiro os valores confirmados, nao a sugestao antiga da IA;
- nova versao preserva referencia ao `batchId` anterior.

### Exibicao

Em `PlanDocumentView` e na lista de Documentos:

- mostrar tipo, area e periodo dos campos principais;
- para historico, mostrar de forma discreta ano/trimestre/gestora/versao quando existirem;
- nao exibir JSON, evidencias tecnicas ou backup no corpo.

### Contexto da IA

Em `_shared/plan-context.ts`, ao incluir memoria historica, usar os metadados confirmados:

- periodo principal;
- area;
- ano/trimestre relacionado;
- nunca tratar `sourceCompany` como empresa ativa.

Deploy: `save-historical-document`, funcoes que importarem o contexto alterado e frontend.

Commit: `Historico: persiste e reutiliza metadados confirmados`.

---

## FATIA 4 - Validacao ponta a ponta

Executar em empresa de teste ou com documento descartavel:

1. abrir Documentos > Importar historico;
2. selecionar o arquivo do caso Marketing;
3. sem clicar em interpretar, confirmar que aparecem:
   - Plano Mensal;
   - Marketing;
   - Abr 2026;
   - Plano mensal de objetivos e acoes;
   - Ano 2026, T2 2026, Larissa e Final ajustada;
4. revisar e salvar;
5. abrir o documento salvo e conferir os metadados;
6. reabrir a importacao e confirmar que os valores revisados voltam iguais;
7. importar arquivo com duas tabelas complementares do mesmo ano;
8. importar arquivo com duas tabelas realmente conflitantes;
9. conferir que nenhum base64/blob/arquivo bruto foi salvo;
10. verificar desktop e mobile;
11. executar `pnpm run lint && pnpm run build`;
12. confirmar migration/deploys/functions e asset Netlify;
13. atualizar docs e handoffs;
14. commit/push e `git log --oneline -3`.

Commit final, se houver ajustes da validacao: `Corrige metadados da importacao historica`.

## 6. Arquivos provaveis

- `src/features/history/HistoricalImportDialog.tsx`;
- `src/pages/Documents.tsx`;
- `src/components/PlanDocument.tsx`;
- `src/state/store.tsx`;
- `src/types/index.ts`;
- `supabase/functions/_shared/historical-header.ts` (novo);
- `supabase/functions/_shared/historical-classifier.ts`;
- `supabase/functions/_shared/historical-import-structure.ts`;
- `supabase/functions/suggest-historical-metadata/index.ts`;
- `supabase/functions/save-historical-document/index.ts`;
- `supabase/functions/_shared/plan-context.ts`;
- docs e handoffs.

## 7. Nao fazer

- Nao criar area, pessoa, objetivo ou KPI automaticamente.
- Nao gravar antes da confirmacao.
- Nao usar o texto inteiro como titulo.
- Nao deixar `Plano Estrategico`/`Empresa` como defaults silenciosos.
- Nao transformar qualquer mencao a outro ano em periodo do documento.
- Nao considerar tabelas complementares como conflito so porque compartilham o ano.
- Nao marcar o plano como concluido apenas porque lint/build passaram; o caso real precisa passar na interface.

## 8. Comandos obrigatorios por fatia

```bash
git pull --rebase
pnpm run lint
pnpm run build
git status
git add -A
git commit -m "<mensagem da fatia>"
git push
git log --oneline -3
```

Deploys usam o projeto Supabase `bkswkfazkjilwfzwzthz` e o frontend Netlify `oraculo-v2-aize`. Edge Functions comuns devem permanecer com JWT normal.
