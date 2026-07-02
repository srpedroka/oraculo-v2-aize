# Changelog

## 2026-06-29

- Publicada a V2 do frontend no Netlify.
- Conectado frontend ao Supabase.
- Criadas migrations de schema, RLS, schema privado para chaves de IA e realtime.
- Publicadas Edge Functions `invite-member`, `save-ai-settings`, `oracle-chat` e `monthly-check-in`.
- Adicionadas rotas de autenticacao, onboarding, configuracoes, execucao e planos.
- Configurado fallback SPA para rotas diretas no Netlify.
- Criada documentacao minima de manutencao: README, AGENTS, Architecture, Security, Decisions, Runbook e Changelog.
- Adicionado mapa de acessos e custodia de chaves em `docs/ACCESS.md`.
- Repositorio GitHub tornado publico para leitura.
- Corrigida nomenclatura da interface: Oraculo e Areas.
- Adicionada importacao de plano estrategico por PDF, PPTX, DOCX e TXT na aba de revisao do Oraculo.
- Adicionado celular unico ao perfil e rodape da sidebar com conta do usuario e seletor de empresa.
- Melhorada administracao de convites: email no perfil, celular opcional no convite, listagem de vinculos e remocao pelo dono.
- Transformado o painel real do Oraculo em interface estilo WhatsApp e removida a tela estatica de previa.
- Adicionada base do WhatsApp real com Evolution API: configuracao, segredos privados, webhook seguro e historico por canal.
- Adicionado convite operacional por WhatsApp quando Evolution API/Evo Go estiver ativo e o convidado tiver celular cadastrado.
- Adicionada visualizacao de senha no login e recuperacao de senha por email com tela de redefinicao.

## 2026-06-28

- Construida a V1 navegavel do Oraculo com dashboard, planejamento estrategico, areas, planos trimestrais e demonstracao WhatsApp.
- Ajustada sidebar redimensionavel e compacta conforme referencia visual.
- Gerado pacote local com o codigo da V1.
