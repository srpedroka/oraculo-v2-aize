# Plano: melhorias V2 do Oraculo

## Objetivo

Executar o plano de melhorias recebido em `oraculo-v2-melhorias.md`, em blocos pequenos e verificaveis, sem reconstruir o que ja esta solido.

## Escopo

Entra nesta rodada inicial:

- Bloco 0: corrigir nomenclatura de Oraculo e Areas.
- Bloco C: importar planejamento estrategico por arquivo, usando o fluxo atual de plano colado.

Blocos seguintes ficam planejados para execucao posterior ou proxima etapa:

- Bloco A: conta com celular e seletor de empresa no rodape.
- Bloco B: convites e entrada em empresa existente.
- Bloco D: painel do Oraculo com visual de WhatsApp.
- Bloco E: WhatsApp real, dependente de infraestrutura externa.

## Arquivos provaveis

- `src/components/OraclePanel.tsx`
- `src/components/Sidebar.tsx`
- `src/App.tsx`
- `src/pages/Areas.tsx`
- `src/pages/AreaDetail.tsx`
- `src/pages/QuarterlyPlans.tsx`
- `src/pages/Strategic.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Execution.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Onboarding.tsx`
- `src/lib/fileImport.ts`
- `package.json`
- `pnpm-lock.yaml`
- `docs/CHANGELOG.md`

## Riscos

- Quebrar links internos ao remover `/departamentos`.
- Aumentar bundle ao adicionar extracao de PDF/DOCX/PPTX.
- Arquivos escaneados em PDF nao terem texto extraivel.
- Dependencias novas exigirem ajuste de tipos no build.

## Passos

1. Corrigir nomenclatura de interface e rotas canonicas.
2. Validar busca por termos antigos.
3. Adicionar extracao de arquivos ao fluxo de plano colado.
4. Rodar `pnpm run lint` e `pnpm run build`.
5. Commit e push por bloco concluido.

## Testes

- `pnpm run lint`
- `pnpm run build`
- Validacao manual das rotas principais.

## Definicao de pronto

Cada bloco fica pronto quando a UI reflete a regra nova, as checagens passam, a documentacao relevante e atualizada e o commit e enviado ao GitHub.
