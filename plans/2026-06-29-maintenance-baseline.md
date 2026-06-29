# Plano: documentacao de manutencao e seguranca

## Objetivo

Criar a base de documentacao exigida pelo arquivo `vibe-coding-maintenance-instructions.md`, deixando o projeto compreensivel, recuperavel e seguro para continuidade por IA ou humano.

## Escopo

Entra:

- README;
- AGENTS atualizado para V2;
- docs de arquitetura, seguranca, decisoes, runbook e changelog;
- ajuste de `.env.example`;
- ajuste de `.gitignore` para artefatos sensiveis e temporarios.

Nao entra:

- mudanca funcional de produto;
- refatoracao de codigo;
- alteracao de banco;
- novo deploy obrigatorio.

## Arquivos provaveis

- `README.md`
- `AGENTS.md`
- `.env.example`
- `.gitignore`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DECISIONS.md`
- `docs/RUNBOOK.md`
- `docs/CHANGELOG.md`

## Riscos

- Documentar comando incorreto.
- Confundir variaveis publicas de frontend com secrets de servidor.
- Deixar AGENTS contradizendo a V2 atual.

## Passos

1. Ler instrucoes de manutencao.
2. Mapear estrutura atual do projeto.
3. Criar documentacao minima.
4. Ajustar exemplo de ambiente e ignore.
5. Rodar checagens.

## Testes

- `pnpm run lint`
- `pnpm run build`

## Definicao de pronto

Projeto com documentacao minima criada, sem segredos novos nos arquivos e build passando.
