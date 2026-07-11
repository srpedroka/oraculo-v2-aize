# Plano: Atualizar catálogo de modelos de IA (2026-07-08)

Refletir os modelos e preços **atuais** dos 4 provedores no catálogo do Oráculo. Fonte: pesquisa multi-agente nas docs oficiais (2026-07-08). Mantém sincronizados `src/lib/aiPricing.ts` (UI) e `supabase/functions/_shared/pricing.ts` (servidor) — **os dois têm que bater**.

## ⚠️ Correção do diagnóstico do WhatsApp (item 2.1)

Diagnóstico ANTERIOR (meu): "grok-4.3 provavelmente é um id inválido". **ERRADO.** A doc oficial do xAI (`https://docs.x.ai/developers/models`, consultada 2026-07-08) lista **`grok-4.3` como ATIVO** (não depreciado, não renomeado; $1.25/$2.5, 1M contexto). Logo, a causa do WhatsApp mudo **não é o id do modelo** — é mais provável a **chave xAI** (inválida/expirada) ou outro erro de runtime.

**Como fechar de vez:** em Configurações → IA → função `daily` → **"Testar agora"** (usa o `model-probe.ts` da Onda 1). O resultado diz exatamente:
- `invalid_key` / "Chave recusada" → re-cadastrar a chave xAI.
- `unknown_model` → aí sim o id é rejeitado (apesar da doc); trocar para `grok-4.5`.
- `ok` / "Validado" → o problema é outro (investigar o caminho do webhook).

## Catálogo atual (o que existe hoje)

- **openai:** gpt-5.4, gpt-5.4-mini, gpt-5.4-nano
- **anthropic:** claude-opus-4-8, claude-opus-4-7, claude-opus-4-6, claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5
- **xai:** grok-4.3
- **moonshot:** kimi-k2.7-code, kimi-k2.7-code-highspeed

**Faltam os flagships mais novos:** `gpt-5.5`, `claude-fable-5`, `claude-sonnet-5`, `grok-4.5`.

## Catálogo proposto

Preços = USD por 1M tokens, standard short-context (ver ressalvas). Adicionar os novos, manter os válidos, opcionalmente podar depreciados.

### OpenAI
| id | in | out | ctx | tier | ação |
|---|---|---|---|---|---|
| **gpt-5.5** | 5 | 30 | 1.05M | planning | **ADICIONAR** (flagship, snapshot 2026-04-23) |
| gpt-5.4 | 2.5 | 15 | 1.05M | daily | manter |
| gpt-5.4-mini | 0.75 | 4.5 | 400k | daily/bg | manter |
| gpt-5.4-nano | 0.2 | 1.25 | 400k | background | manter |

`gpt-5.5-pro`/`gpt-5.4-pro` ($30/$180) existem mas são caros/nicho — não adicionar por ora. **Não existe `gpt-5.6`** na doc oficial (só em agregadores de terceiros) — ignorar.

### Anthropic
| id | in | out | ctx | tier | ação |
|---|---|---|---|---|---|
| **claude-fable-5** | 10 | 50 | 1M | planning | **ADICIONAR** (flagship, GA 2026-06-09) |
| claude-opus-4-8 | 5 | 25 | 1M | planning | manter |
| **claude-sonnet-5** | 3 | 15 | 1M | daily | **ADICIONAR** (promo $2/$10 até 31/08/2026) |
| claude-haiku-4-5 | 1 | 5 | 200k | background | manter (id fixo `claude-haiku-4-5-20251001`) |
| claude-opus-4-7 / 4-6 | 5 | 25 | 1M | — | legado — opcional podar |
| claude-sonnet-4-6 / 4-5 | 3 | 15 | 1M/200k | — | legado — opcional podar |

Recomendo **oferecer** os 4 atuais (fable-5, opus-4-8, sonnet-5, haiku-4-5) e **manter os legados só para lookup de pricing** (não remover se alguma org ainda os usa — `findModelPricing` retornaria null e quebraria o custo).

### xAI / Grok
| id | in | out | ctx | tier | ação |
|---|---|---|---|---|---|
| **grok-4.5** | 2 | 6 | 500k | planning | **ADICIONAR** (flagship, lançado 2026-07-08; alias `grok-4.5-latest`) |
| grok-4.3 | 1.25 | 2.5 | 1M | daily | **manter** (ativo; melhor p/ daily: mais barato + mais contexto) |

Obs: para o WhatsApp (função `daily`), o `grok-4.3` é na verdade **melhor** que o 4.5 (mais barato, 1M vs 500k contexto). Não trocar por trocar.

### Moonshot / Kimi
| id | in | out | ctx | ação |
|---|---|---|---|---|
| kimi-k2.7-code | 0.95 | 4 | 256k | manter (input = cache miss; hit $0.19) |
| kimi-k2.7-code-highspeed | 1.9 | 8 | 256k | manter (input = cache miss; hit $0.38) |

Nenhum modelo Kimi mais novo encontrado. `platform.moonshot.ai` agora redireciona para `platform.kimi.ai`.

## Entradas a adicionar (código, mesmo shape em aiPricing.ts e pricing.ts)

```ts
{ provider: "openai", model: "gpt-5.5", inputTokenPriceUsdPerMillion: 5, outputTokenPriceUsdPerMillion: 30,
  source: "https://developers.openai.com/api/docs/pricing", note: "Flagship 5.5 (snapshot gpt-5.5-2026-04-23), tier planning. Standard short-context." },
{ provider: "anthropic", model: "claude-fable-5", inputTokenPriceUsdPerMillion: 10, outputTokenPriceUsdPerMillion: 50,
  source: "https://platform.claude.com/docs/en/about-claude/pricing", note: "Flagship Anthropic (GA 2026-06-09). Thinking sempre ligado; tokenizer novo (+~30% tokens); exige retenção 30 dias. Planning premium." },
{ provider: "anthropic", model: "claude-sonnet-5", inputTokenPriceUsdPerMillion: 3, outputTokenPriceUsdPerMillion: 15,
  source: "https://platform.claude.com/docs/en/about-claude/pricing", note: "Equilíbrio velocidade/inteligência (daily). Promo $2/$10 até 31/08/2026; padrão $3/$15 depois." },
{ provider: "xai", model: "grok-4.5", inputTokenPriceUsdPerMillion: 2, outputTokenPriceUsdPerMillion: 6,
  source: "https://docs.x.ai/developers/grok-4-5", note: "Flagship xAI (lançado 2026-07-08), 500k contexto, alias grok-4.5-latest. Planning." },
```

## Fatias

- **Fatia 1** — Adicionar os 4 ids novos (acima) com preço/source nos DOIS arquivos (`aiPricing.ts` + `pricing.ts`), mantendo a ordem por provedor. `pnpm run lint && pnpm run build`. Deploy das Edge Functions que usam pricing (save-ai-settings).
- **Fatia 2 (opcional)** — Podar Anthropic legado do OFERECIMENTO (manter no lookup) e revisar notes.
- **Fatia 3 (liga com config-ia)** — Antes de oferecer um id, validar com `model-probe.ts` (o botão "Testar agora" já faz por org). Ideal: um guard que impede salvar função com modelo que não valida.

## Ressalvas (das docs oficiais)
- Preços são **standard short-context**; cache hit é bem mais barato (OpenAI ~10% do input; Anthropic/Kimi têm tabelas próprias).
- `claude-sonnet-5` está em **promoção** ($2/$10) até 31/08/2026 — o número no catálogo é o padrão ($3/$15).
- OpenAI: contexto longo (>~272k) e data residency têm sobretaxa; gpt-5.4 tem 1.05M de contexto (não 400k, como alguns agregadores diziam).
- Fontes: developers.openai.com/api/docs/pricing, platform.claude.com/.../pricing, docs.x.ai/developers/models, platform.kimi.ai/docs/pricing.
