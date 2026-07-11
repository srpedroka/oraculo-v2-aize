# Plano: Perfil da empresa (rastreio na internet como contexto do Oráculo)

> **STATUS: executado (2026-07-11) pelo Grok CLI** — 5 fatias: migration `company_profile`, `callModelWithWebSearch`, Edge Function `company-research` (deployada), card confirmável na aba Empresa (frontend em prod), bloco permanente no `plan-context` + redeploy de `oracle-chat` / `oracle-session` / `whatsapp-webhook` + docs. **Pendente de teste real do dono:** primeira pesquisa autenticada de verdade (web search com chave da org) e pergunta no painel "o que você sabe sobre a minha empresa?" com perfil confirmado.

Pedido do dono (2026-07-11): um lugar/rotina que rastreie a internet sobre a empresa (sites e canais principalmente; redes sociais se aparecerem), guarde esse contexto no histórico, gere automaticamente um resumo descritivo, e esse contexto sirva para o Oráculo conhecer melhor a empresa. Quando o nome tiver dois nomes ("Gaam/Aize"), pesquisar os dois.

Régua mantida: **simplicidade vale ouro (Apple/Tesla)**. MVP = **1 card, 1 botão, 1 prévia confirmável, 1 bloco no contexto da IA**.

## O fluxo (5 passos)

1. Em Configurações › aba **Empresa**, card **"Perfil da empresa"**: o dono clica **"Pesquisar na internet"** (pode antes colar links da empresa: site, Instagram, LinkedIn — viram semente da busca).
2. A Edge Function divide o nome no `/` (name + subtitle já separam "Gaam"/"Aize"; o split cobre quem digitou os dois num campo só) e usa **busca web nativa do provedor de IA** da empresa para pesquisar os termos + links.
3. O app mostra uma **prévia editável**: resumo (~150 palavras) num textarea + lista de **fontes com checkbox** (desmarcar fonte = descartar — é a defesa contra homônimo).
4. O dono edita e **Confirma** — só então grava (regra do app: nunca gravar sem confirmação). Descartar não grava nada.
5. O perfil confirmado entra no contexto do Oráculo como **um bloco fixo "PERFIL DA EMPRESA"** em `plan-context.ts` — presente em todas as conversas (painel, WhatsApp, sessões), antes da memória estratégica.

## Decisões técnicas (da pesquisa, com docs oficiais)

### Busca web por provedor — estado jul/2026
| Provedor | Como | Custo | Veredito |
|---|---|---|---|
| **Anthropic** | Messages API + `tools:[{type:"web_search_20250305", name:"web_search", max_uses:3-5}]`, one-shot, citações nativas | US$10/1k buscas + tokens | **1ª opção** (menor atrito: o app já fala Messages API) |
| **OpenAI** | `POST /v1/responses` + `tools:[{type:"web_search"}]`, one-shot, `url_citation` | US$10/1k + tokens | **2ª opção** (endpoint novo, mas o `model.ts` já o usa) |
| xAI/Grok | Live Search **morreu** (410 desde jan/2026); o novo exige `/v1/responses` da xAI | US$5/1k | Fora do MVP |
| Moonshot/Kimi | `$web_search` exige loop de eco de tool (2+ chamadas) | US$5/1k | Fora do MVP (erro amigável) |

Custo por pesquisa: centavos, e **só manual** — nunca recorrente.

### Encaixe no código (verificado nos arquivos)
- **`callModelWithWebSearch`** nova em `_shared/model.ts`, irmã de `callModelWithImage` (mesmo padrão de variante por capacidade; `callModel` não aceita tools hoje e não deve ser mexido). Timeout maior (~60s; o default 25s é curto pra busca). Anthropic e OpenAI implementados; xai/moonshot lançam erro amigável.
- **Roteamento:** preferir a chave **Anthropic** da org; senão **OpenAI**; senão erro claro ("o perfil precisa de uma chave Anthropic ou OpenAI"). Registrar uso via `recordAiUsage` como todas as chamadas.
- **Armazenamento: `plan_documents` com `type='company_profile'`** (decisão contra tabela nova): RLS pronta (member-read; insert org-level exige `is_owner`), **backup/restore já cobre** `plan_documents` sem tocar em nada, e o histórico é natural (uma linha por pesquisa confirmada, `created_at` ordena, `content` jsonb guarda `{summary, sources[], queries[], links[]}`). Migration de ~15 linhas estendendo o check de `type` (padrão já usado 2x). Os links informados pelo dono ficam no `content` e são pré-preenchidos na próxima pesquisa.
- **Edge Function `company-research`** (nova, JWT + `assertOwner`): recebe orgId + links; monta termos; chama a busca; **retorna `{suggestion}` e nunca grava** (padrão `suggest-historical-metadata`). A confirmação grava via insert do cliente em `plan_documents` (a RLS owner-write org-level já protege).
- **Injeção:** `buildPlanContext` ganha 1 query (`type='company_profile'`, mais recente) e insere o bloco truncado (~1200 chars, molde do `truncateHistoricalText`) logo após as linhas EMPRESA/TEMA. Sempre presente (todos os focos) — diferente da memória estratégica, que é condicional.
- **"Gaam/Aize":** termos = `[name, subtitle].flatMap(v => v.split("/")).map(t => t.trim()).filter(Boolean)`.

## Fatias

- **F1 — Fundação.** Migration (estende check de `type` com `company_profile`); `callModelWithWebSearch` (Anthropic + OpenAI) em `model.ts`. Critério: chamada de teste retorna texto + fontes.
- **F2 — Função + UI.** Edge Function `company-research` (owner-only, só sugere); card "Perfil da empresa" na aba Empresa (estado vazio → botão; com perfil → resumo + "Atualizado em X" + re-pesquisar); prévia editável com fontes desmarcáveis; Confirmar grava, Descartar não. Critério: pesquisa real da Gaam/Aize gera prévia com fontes; confirmação cria o documento; homônimo é descartável.
- **F3 — Contexto + docs.** Bloco "PERFIL DA EMPRESA" no `plan-context.ts`; docs (CHANGELOG/ARCHITECTURE/RUNBOOK); verificação de que o Oráculo cita o perfil quando perguntado sobre a empresa. Critério: perguntar "o que você sabe da minha empresa?" no painel retorna o resumo confirmado.

## Não-fazer (explícito — anti-monstrinho)

- Cron / atualização automática (empresas não mudam de descrição por mês; re-pesquisa automática violaria o "nunca gravar sem confirmação"). O card pode mostrar um lembrete passivo ("perfil com 6+ meses") — texto, não job.
- Pesquisa automática no cadastro da empresa (cadastro deve ser instantâneo).
- Integração/scraping por rede social (APIs quebram, exigem tokens). Links colados pelo dono + o que a busca achar organicamente bastam.
- Diff visual / timeline de versões (histórico fica no banco; a UI mostra só a versão vigente).
- Resumo no seletor de empresa, Dashboard ou sidebar (o valor é a IA conhecer a empresa, não o dono reler o próprio resumo).
- Campos estruturados (setor, porte, tags) — um texto só, editável.

## Riscos e mitigação
- **Homônimo** (achar OUTRA empresa com o mesmo nome): fontes visíveis e desmarcáveis + texto editável + links do dono ancorando a busca.
- **Dado errado virando contexto da IA:** nada entra sem confirmação humana; o bloco injetado é sempre a última versão confirmada.
- **Sem chave Anthropic/OpenAI:** erro claro orientando a cadastrar uma das duas na aba IA.

---

# Execução no Codex — passo a passo

Como usar: abra o Codex no diretório do projeto e cole **um prompt por vez**, na ordem (Onda 1 → 2 → 3). Só cole a onda seguinte depois que a anterior terminar com commit publicado (confira o `git log` que o próprio Codex deve mostrar). Se qualquer passo falhar, o Codex deve PARAR e reportar — não improvisar.

## Onda 1 — Fundação (migration + busca web no model.ts)

```text
Leia plans/2026-07-11-perfil-empresa.md por completo antes de começar (decisões e payloads estão lá). Execute a Fatia F1:

1) `git pull --rebase` primeiro. NÃO reaplique migrations existentes.

2) MIGRATION nova `supabase/migrations/<timestamp>_company_profile.sql`:
   - Estender o check constraint de `plan_documents.type` para incluir 'company_profile' (use o padrão drop-and-recreate já usado em 20260708120000 e 20260709180000).
   - Nada mais. Sem tabela nova (decisão registrada no plano: reusar plan_documents pela RLS owner-write org-level e pelo backup já cobrirem).

3) `callModelWithWebSearch` em supabase/functions/_shared/model.ts, IRMÃ de callModelWithImage (mesmo padrão de variante por capacidade — NÃO mexa em callModel):
   - anthropic: Messages API com `tools:[{"type":"web_search_20250305","name":"web_search","max_uses":4}]`; extrair texto + citações (blocos web_search_tool_result / citations com url+title); tratar `pause_turn` reenviando a mensagem assistant.
   - openai: `POST /v1/responses` com `tools:[{"type":"web_search"}]`; extrair texto + annotations url_citation.
   - moonshot e xai: lançar erro amigável ("busca web indisponível neste provedor") como callModelWithImage faz para imagem.
   - timeout ~60000ms (o default de 25s é curto para busca).
   - Retorno: `{ text, sources: Array<{url, title}> }`.

4) Validação: tsc (--noEmit) e build Vite limpos; `supabase db push --linked` aplica a migration; `db lint --linked --level warning` sem erros.

5) Commit na main com mensagem "Perfil da empresa: fundacao (migration + busca web)" + push + mostre `git log --oneline -3` provando que subiu. Atualize .agents-private/handoff-para-claude.md com o que foi feito.

Se algo falhar, PARE e me diga o erro exato. Não invente contornos.
```

## Onda 2 — Edge Function + UI (o recurso em si)

```text
Leia plans/2026-07-11-perfil-empresa.md. A Onda 1 já aplicou a migration e criou callModelWithWebSearch. Execute a Fatia F2:

1) `git pull --rebase` primeiro.

2) EDGE FUNCTION nova `supabase/functions/company-research/index.ts` (padrão suggest-historical-metadata: só sugere, NUNCA grava):
   - JWT normal + getUser + assertOwner(user.id, orgId).
   - Body: `{ orgId, links?: string[] }` (links = URLs do site/redes coladas pelo dono; valide http/https).
   - Termos de busca: `[organization.name, organization.subtitle].flatMap(v => String(v ?? "").split("/")).map(t => t.trim()).filter(Boolean)` — para "Gaam/Aize" pesquisa os dois.
   - Provedor: prefira a chave anthropic da org (ai_model_keys); senão openai; senão retorne erro claro "O perfil precisa de uma chave Anthropic ou OpenAI cadastrada na aba IA".
   - Prompt de pesquisa: pesquisar a empresa pelos termos + links, priorizar sites/canais oficiais, e sintetizar um resumo descritivo de ~150 palavras em pt-BR (o que a empresa faz, setor, produtos/serviços, canais) SEM inventar fatos; listar as fontes usadas.
   - Registrar uso via recordAiUsage (função 'background', channel 'web').
   - Resposta: `{ suggestion: { summary, sources: [{url,title}], queries: [...], links: [...] } }`.

3) STORE (src/state/store.tsx): action nova `confirm_company_profile` que INSERE em plan_documents via cliente (RLS owner-write org-level já protege): `{ org_id, area_id: null, type: 'company_profile', period: <ano atual>, title: 'Perfil da empresa', content: { summary, sources, queries, links }, version: <última+1> }`. E um jeito de ler o perfil vigente (query dos plan_documents type='company_profile' mais recente — provavelmente já vem no fetch existente de plan_documents; confirme que o type novo não é filtrado fora em nenhum lugar do store/paginas e que NÃO aparece na página Documentos como plano comum a menos que fique natural).

4) UI em src/pages/Settings.tsx, aba "empresa" (card novo "Perfil da empresa" abaixo do card Empresa ativa):
   - Sem perfil: texto curto explicando + campo "Links da empresa (opcional, um por linha)" + botão "Pesquisar na internet".
   - Com perfil: resumo atual + "Atualizado em <data>" + os mesmos campo/botão para re-pesquisar.
   - Ao pesquisar: loading; depois PRÉVIA EDITÁVEL: textarea com o resumo sugerido + lista de fontes com checkbox (desmarcada = fora do content salvo) + botões "Confirmar perfil" (dispara confirm_company_profile) e "Descartar" (limpa a prévia, nada é gravado).
   - Erros da função aparecem no card (ex.: sem chave Anthropic/OpenAI).
   - NÃO-FAZER (do plano): cron, pesquisa automática no cadastro, timeline/diff de versões, resumo no seletor/Dashboard/sidebar, campos estruturados.

5) Deploy: `supabase functions deploy company-research --project-ref bkswkfazkjilwfzwzthz --use-api` (JWT normal, SEM --no-verify-jwt). Build + deploy do FRONTEND no Netlify (`--prod`). Confirme que produção serve o asset novo.

6) Validação: tsc + build limpos; chamada sem JWT à função retorna 401; com sua sessão de teste, uma pesquisa real retorna prévia com fontes (se não houver chave Anthropic/OpenAI na org de teste, valide o caminho de erro amigável e diga isso no relatório).

7) Commit "Perfil da empresa: pesquisa confirmavel na aba Empresa" + push + `git log --oneline -3`. Atualize o handoff-para-claude.md.

Se algo falhar, PARE e me diga o erro exato.
```

## Onda 3 — Contexto do Oráculo + docs

```text
Leia plans/2026-07-11-perfil-empresa.md. Ondas 1-2 prontas. Execute a Fatia F3:

1) `git pull --rebase` primeiro.

2) supabase/functions/_shared/plan-context.ts:
   - No Promise.all de buildPlanContext, adicionar query do plan_document `type='company_profile'` mais recente da org (order created_at desc, limit 1).
   - Inserir bloco `PERFIL DA EMPRESA:` com o content.summary truncado a ~1200 chars (constante MAX_PROFILE_CHARS, molde de truncateHistoricalText), logo APÓS as linhas EMPRESA/TEMA. Sempre presente (todos os focos) — diferente da memória estratégica condicional.
   - Garanta que historicalMemoryLines NÃO passa a incluir company_profile (o filtro allowedTypes strategic/quarterly deve continuar como está).

3) Redeploy das funções que importam plan-context: `oracle-chat`, `oracle-session` (via session-engine) e `whatsapp-webhook` (este com --no-verify-jwt). Não precisa redeployar as demais.

4) Verificação funcional: com um perfil confirmado na empresa de teste, pergunte no painel "o que você sabe sobre a minha empresa?" e confirme que a resposta usa o resumo. Se não houver perfil confirmado, confirme que o contexto simplesmente não tem o bloco (sem erro).

5) Docs: docs/CHANGELOG.md (entrada nova), docs/ARCHITECTURE.md (company-research + bloco de contexto), docs/RUNBOOK.md (seção curta "Perfil da empresa": como pesquisar/confirmar/re-pesquisar e o erro de chave). Marcar o STATUS deste plano como executado.

6) Commit "Perfil da empresa vira contexto do Oraculo" + push + `git log --oneline -3`. Atualize o handoff-para-claude.md.

Se algo falhar, PARE e me diga o erro exato.
```

## Depois das 3 ondas
Me chame (Claude) para a revisão de segurança/qualidade do conjunto — em especial: a função nunca grava; a RLS do insert; o custo por pesquisa registrado em ai_usage_logs; e o bloco de contexto não vazar entre empresas.
