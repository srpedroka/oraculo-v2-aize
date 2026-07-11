# Plano: Perfil da empresa (rastreio na internet como contexto do Oráculo)

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
