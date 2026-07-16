# Decisoes tecnicas

## 2026-07-14 - Concorrencia otimista nas edicoes de alto valor

Decisao: usar `updated_at` como versao de compare-and-swap em objetivos e configuracoes criticas, e uma RPC SQL unica para salvar definicao e meses de KPI. Conflitos retornam resultado controlado, preservam o rascunho local e exigem recarregar a versao atual antes de tentar novamente.

Contexto: duas abas ou pessoas podiam partir da mesma leitura e a ultima gravacao sobrescrever silenciosamente a primeira. O editor de KPI ainda dividia definicao e meses em varias mutacoes.

Alternativas: bloquear registros por toda a duracao da tela, aceitar a ultima gravacao ou criar uma tabela generica de locks. Locks longos aumentariam abandono e burocracia; ultima gravacao perderia dados; uma tabela generica adicionaria manutencao sem necessidade nesta fatia.

Consequencias: o fluxo normal nao ganha etapas. O aviso aparece somente quando uma versao realmente mudou. `save_kpi_editor_if_current`, `save_ai_function_if_current` e `save_whatsapp_settings_if_current` fazem a comparacao no banco; as duas ultimas continuam executaveis apenas por `service_role`. Auditoria e backup permanecem ativos.

## 2026-07-14 - Rotas e importadores carregam sob demanda

Decisao: separar cada pagina com `React.lazy`/`Suspense`, preservar o shell autenticado durante a troca e isolar dialogos/importadores pesados. O build passa a gerar manifesto e a falhar se o JavaScript inicial superar 200 KB gzip ou incluir PDF, XLSX, DOCX e ZIP.

Motivo: o entrypoint transferia cerca de 339,9 KB gzip e baixava recursos de telas e formatos que a maioria das sessoes nao usaria. Isso penalizava principalmente acesso mobile e tornava regressao de bundle invisivel ate a producao.

Consequencias: o entrypoint medido caiu para 133,7 KB gzip, cerca de 61% menor. A primeira abertura de uma rota ou dialogo pode exibir um carregamento curto; depois o navegador reutiliza o chunk. Regras, dados, permissoes e fluxos permanecem iguais. O limite e a exclusao de parsers sao contratos de build, e o E2E da tela de acesso verifica tambem as requisicoes iniciais.

## 2026-07-14 - Cache e Realtime invalidam por dominio

Decisao: centralizar em `src/state/query-invalidation.ts` as familias de chaves React Query, os pacotes de dependencias e o mapa entre tabela Realtime e dominio. Mutacoes declaram explicitamente o que alteram; o refresh manual continua completo.

Motivo: `invalidateOrg()` fazia uma evidencia, mensagem ou log de IA disparar cerca de duas dezenas de refetches sem relacao, aumentando trafego, rerenders e perda de estado visual. Strings de query espalhadas tambem dificultavam provar que listas paginadas eram atualizadas corretamente.

Consequencias: uso de IA atualiza somente historico/custo; chat atualiza conversa e, quando aplicavel, sessao; KPI importado atualiza valores e documento; lifecycle atualiza entidade, filhos necessarios, contagem e auditoria. Eventos Realtime existentes chamam handlers especificos por tabela. Nao houve mudanca de RLS, schema, payload, permissao ou fluxo funcional; novas tabelas nao foram adicionadas a publicacao Realtime nesta fatia.

## 2026-07-13 - Listas historicas usam cursor estavel e carga sob demanda

Decisao: manter somente dados ativos e limitados no carregamento principal e consultar documentos, evidencias, check-ins arquivados, uso de IA e revisoes em paginas de 30 registros, ordenadas por `created_at DESC, id DESC`. O cursor usa os dois campos para nao repetir nem pular registros com o mesmo horario.

Motivo: o crescimento do historico fazia login e troca de empresa transferirem colecoes que nao eram necessarias para a tela atual. Paginacao por offset ficaria instavel quando novos registros fossem inseridos durante a navegacao.

Consequencias: dados antigos continuam acessiveis por filtros e botoes **Carregar mais**; documentos arquivados podem ser abertos diretamente por ID. Filtros de tipo, area, periodo e estado de arquivo sao aplicados no servidor. Contagens de impacto antes de arquivar uma area usam `count exact`, sem depender da pagina carregada. A migration `20260714150000_cursor_pagination_indexes.sql` adiciona apenas indices compostos e nao muda RLS, papeis ou dados. Invalidacao seletiva e code splitting continuam nas Fatias 5D e 5E.

## 2026-07-13 - Grants do service_role são parte das migrations

Decisão: declarar em migration os privilégios atuais e os default privileges do papel interno `service_role` no schema `public`, sem conceder novos acessos a `anon` ou `authenticated`.

Motivo: o Supabase hospedado já provisionava esses privilégios, mas o banco local do CI era reconstruído somente pelas migrations do projeto. A divergência fazia clientes administrativos autenticarem corretamente e ainda assim receberem `permission denied`, derrubando toda a fábrica de testes.

Consequências: staging, produção e CI passam a ter a mesma fundação declarativa. O papel continua server-only, protegido por segredo e RLS bypass esperado. A suíte unitária verifica a presença dos grants e a suíte de segurança confirma que papéis de usuário continuam isolados.

## 2026-07-13 - Módulos críticos com fachadas compatíveis

Decisão: dividir o processador do WhatsApp, o motor de sessões e Configurações por responsabilidade, preservando `handleWhatsAppWebhook`, a API de `session-engine.ts` e `src/pages/Settings.tsx` como fachadas compatíveis.

Motivo: os três arquivos concentravam regras independentes e dificultavam revisão, teste e manutenção. A separação reduz o raio de cada alteração sem introduzir dois caminhos funcionais nem migrar consumidores no mesmo ciclo.

Consequências: não houve mudança de payload, query, permissão ou UI. Novos módulos Deno precisam passar por checagem de referências e bundle antes do deploy; staging continua obrigatório porque o `tsc` do frontend não cobre Edge Functions. Paginação, invalidação seletiva e code splitting pertencem às Fatias 5C–5E.

## 2026-07-13 - Store por domínios com fachada compatível

Decisão: decompor o store React em contrato, UI local, cliente, consultas React Query agrupadas por domínio, mapeadores e adaptadores de comandos, mantendo `AppProvider`/`useAppState` como fachada temporariamente compatível.

Motivo: trocar os 27 consumidores de uma vez aumentaria o risco de regressão funcional. A fachada permite reduzir o arquivo central e testar equivalência agora; consumidores podem adotar hooks menores gradualmente nas próximas otimizações.

Consequências: nenhuma query ou operação mudou na Fatia 5A e o bundle permanece equivalente. A invalidação seletiva e a redução real de rerenders pertencem à Fatia 5D; remover a fachada só deve ocorrer depois da migração dos consumidores e de E2E equivalentes.

## 2026-07-13 - CI usa Supabase local e um unico gate de branch

Decisao: pull requests e pushes para `main` executam qualidade/build e integracao em jobs independentes, finalizados pelo status estavel `CI required`. Integracao aplica migrations e serve Edge Functions em Supabase local; nenhuma credencial de producao entra no CI de contribuicao. Artefatos de falha contem apenas logs sanitizados.

Motivo: testes contra staging hospedado exigiriam segredos em um repositorio publico, limitariam contribuicoes externas e poderiam deixar dados descartaveis quando um job fosse interrompido. Um status agregador evita refazer a regra de protecao sempre que a matriz interna mudar.

Consequencias: SQL adversarial usa conexao PostgreSQL local no CI e preserva a Management API apenas para staging manual. Deploy/verificacao de producao fica em workflow separado, manual, protegido e ligado ao SHA exato. O check `CI required` precisa ser configurado como obrigatorio na branch `main` pelo GitHub.

## 2026-07-13 - Cobertura automatizada guiada por risco

Decisão: organizar a Fatia 4A por contratos críticos, não por um percentual isolado de linhas. Unitários cobrem domínio, parsers e memória; integração/RLS prova transações e autorização no staging; Playwright percorre as jornadas autenticadas em desktop e mobile usando frontend local e dados descartáveis.

Motivo: uma cobertura numérica alta pode deixar sem prova exatamente os riscos mais caros do Oráculo: cruzamento de empresas, excesso de permissão, segredos acessíveis, gravação parcial, arquivo sem restauração e telas críticas que não carregam. A matriz explícita liga cada risco a um teste executável.

Consequências: testes com banco recusam a referência de produção; recuperação E2E não envia email; IA e WhatsApp não recebem chaves reais; toda fixture tem limpeza obrigatória. Logs estruturados, alertas, axe e Error Boundary continuam separados nas Fatias 4C–4E.

## 2026-07-13 - Texto do WhatsApp não tem mais fallback síncrono

Decisão: depois do piloto real, toda integração ativa usa fila inbound e outbox para texto. `whatsapp-webhook/index.ts` fica mínimo e delega ao núcleo compartilhado; o worker é o único executor de texto. Se fila ou outbox estiver indisponível, webhook/worker falham antes de qualquer mutação e deixam o provedor/retry tentar novamente.

Motivo: manter o caminho síncrono como fallback criava dois comportamentos operacionais, tornava timeout capaz de perder resposta e podia reexecutar IA quando a falha era apenas da Evolution. A separação faz processamento e entrega falharem/repetirem de forma independente.

Consequências: desligar flag não ativa modo antigo; causa `503`. Rollback exige drenar filas e republicar a versão anterior antes de desligar as flags. Áudio, documento e PDF continuam como exceções de mídia em memória porque não é aceitável persistir o descritor criptográfico. Respostas textuais desses fluxos ainda usam outbox. A janela de duplicação após aceite da Evolution e antes de marcar `sent` continua existindo enquanto o provedor não oferecer idempotência.

## 2026-07-13 - Sessão de planejamento exige pedido explícito e uma confirmação

Decisão: nenhuma classificação probabilística pode iniciar ou trocar uma sessão estruturada sem sinal determinístico de que a pessoa quer começar, abrir, criar ou retomar um plano. A síntese entrega resumo e proposta juntos e pede uma única confirmação para gravar.

Contexto: durante o Plano Comercial T3, a ação "Planejar o calendário de migração e instalação" foi classificada como início de planejamento anual porque a conversa anterior vinha sendo conduzida informalmente pela IA diária, sem `planning_session`. O fluxo seguinte perguntou várias vezes se podia gerar, conferir e gravar, e salvou o conteúdo trimestral por cima do plano anual.

Motivo: o verbo "planejar" também descreve ações operacionais e não é autorização para mudar o tipo do plano. A sessão persistida, e não o texto aparente da conversa, precisa ser a fonte de verdade. Uma confirmação explícita depois da proposta preserva controle humano sem burocracia repetida.

Consequências: a IA diária não coleta campos nem retoma fases de planejamento; mensagens ambíguas pedem que a pessoa indique o plano. O PDF nasce apenas do documento canônico confirmado, com layout executivo. No incidente de 2026-07-13, o plano anual foi restaurado pelo snapshot de `operational_revisions`, o plano Comercial T3 foi reconstruído e os registros incorretos foram arquivados, não apagados.

## 2026-07-13 - Leitura de documentos no WhatsApp com insight seguro

Decisao: separar a natureza do conteúdo da categoria operacional do Oráculo e persistir somente um insight automático limitado para continuidade da conversa.

Contexto: arquivos como roteiros eram extraídos e classificados como `unknown`, mas a resposta descartava a leitura e o histórico guardava apenas um recibo. Na pergunta seguinte, a IA conhecia só o formato e passava a inferir pelo nome. O parser de PDF por regex também não lia streams comprimidos comuns.

Alternativas: guardar o texto integral na conversa, não manter memória do documento, ou armazenar apenas uma leitura gerada e delimitada.

Motivo: natureza, resumo e pontos principais resolvem a continuidade sem reter arquivo, nome ou texto bruto e preservam a fronteira contra prompt injection. `unpdf` oferece extração real de PDF compatível com Deno/serverless.

Consequencias: `unknown` passa a significar "fora das categorias de plano/evidência", não "não lido"; perguntas seguintes podem usar o insight, mas detalhes não presentes nele exigem reenvio. PDF escaneado sem OCR continua explicitamente não suportado.

## 2026-07-13 - Mídia síncrona durante o piloto durável do WhatsApp

Decisão: manter texto na fila inbound, mas processar áudio e documento sincronamente a partir do webhook autenticado. O download prioriza `POST /message/downloadmedia` da Evo Go e conserva rotas antigas apenas como fallback.

Contexto: a fila guarda somente ID e metadados escalares. A Evo Go precisa da mensagem original, incluindo descritor criptográfico, para baixar a mídia; reconstruir apenas ID/MIME levou a `404` nas rotas antigas e seria inseguro persistir `mediaKey`, URL temporária ou arquivo bruto.

Consequências: texto continua com retry durável. Mídia preserva a política de não persistência e volta a usar o caminho já validado antes da ativação da fila, mas ainda depende da duração da requisição síncrona. Uma fila de mídia futura só poderá existir com handoff criptográfico efêmero explicitamente desenhado e revisado.

## 2026-07-13 - Atualização rápida ambígua nunca grava sem mostrar o alvo

Decisão: respostas curtas de confirmação são não mutáveis por regra determinística, antes e depois da classificação da IA. Evidências genéricas são recusadas. Quando a IA escolhe um objetivo/ação sem referência lexical explícita da pessoa, o Oráculo mostra o alvo e guarda a operação server-side por 30 minutos; apenas uma confirmação explícita aplica a mudança. Se operação e alvo estiverem claros na própria mensagem, a gravação direta permanece.

Motivo: no piloto, `Piloto ok` foi classificado como atualização, associado arbitrariamente a um objetivo da empresa e gravado como evidência. Confiança do modelo não é autorização suficiente para mutar dados, especialmente para owner sem área restrita.

Consequências: o fluxo cotidiano claro não ganha etapa extra. Casos inferidos recebem uma pergunta curta, e `piloto ok` não confirma nem uma alteração já pendente. Testes sintéticos de produção não devem usar a conversa real nem gerar respostas ao celular; use organização descartável no staging. Os artefatos específicos do incidente foram removidos, preservando jobs e telemetria técnica.

## 2026-07-13 - Piloto durável do WhatsApp fica restrito a uma empresa

Decisão: ativar `inbound_queue_enabled` e `outbound_outbox_enabled` somente na empresa piloto, mantendo os endpoints globais do worker/sender configurados e todas as demais empresas no caminho síncrono. Não executar a Fatia 3E nem remover o processador antigo até provar entrada real de texto, áudio e documento pela Evo Go.

Motivo: os testes autenticados já comprovam deduplicação, ordenação, gravação e envio, mas uma chamada sintética ao webhook não comprova que a Evo Go entregará eventos reais depois de reconexão. A ativação limitada permite observar a operação sem ampliar o impacto.

Consequências: rollback desliga primeiro as duas flags da empresa; os endpoints só voltam a `null` depois de zerar itens pendentes. O piloto permanece ativo enquanto filas e dead-letters estiverem zerados. A Evo Go usa `/instance/status` para conexão; quando ela não expõe a configuração do webhook, tráfego autenticado recente é a evidência operacional exibida no painel.

## 2026-07-13 - Saúde do WhatsApp é owner-only e não ativa filas

Decisão: a Fatia 3D agrega telemetria técnica service-only e um painel simples em Configurações. Status pode ser consultado pelo owner; teste e retry respeitam MFA opcional. Reprocessar exige que a fila e o endpoint correspondentes já estejam ativos. O painel não altera flags, endpoints nem configuração remota da Evolution.

Motivo: dar diagnóstico e recuperação suficientes para a operação sem expor segredos, conteúdo ou telefone e sem transformar uma tela de observação em caminho acidental de ativação da infraestrutura durável.

Consequências: a URL esperada é exibida sem token; erros e respostas remotas são sanitizados; telemetria fica 30 dias e é excluída dos backups. A ativação real de inbound/outbox continua dependendo de teste controlado e nova autorização. O botão de teste é manual para evitar mensagem não solicitada durante deploy.

## 2026-07-13 - Outbox atomica por resposta e um POST por bloco

Decisao: quando a flag server-only estiver ativa, `insertConversationMessage` grava a resposta do Oráculo e até três itens formatados da outbox na mesma RPC/transação. Cada item representa um único POST. Um sender separado preserva ordem por destinatário, confirma apenas HTTP 2xx e aplica retry/dead-letter. Flag e endpoint nascem desligados.

Motivo: gravar primeiro e enviar diretamente podia deixar histórico sem entrega; reenviar uma resposta de três blocos como unidade também repetiria blocos já aceitos. Centralizar a gravação cobre conversa diária e sessões sem duplicar regras no webhook.

Consequencias: a estrutura foi publicada inerte e produção continua no envio direto até ativação explícita. Convites e crons proativos continuam no caminho próprio; esta fatia protege respostas operacionais do Oráculo. Como a Evolution não oferece chave de idempotência no `sendText`, a outbox garante durabilidade e deduplicação antes do POST, mas não exatamente-uma-vez na queda posterior ao aceite e anterior ao `sent` local.

## 2026-07-13 - Worker reutiliza o núcleo do webhook e nasce com acionamento inerte

Decisao: tornar o handler atual importável e executá-lo pelo `whatsapp-worker`, sem duplicar a lógica de texto, áudio, documento, sessão, confirmação e atualização rápida. O worker é protegido por segredo server-only, usa locks no PostgreSQL e tem dois despertares: imediato pelo webhook e cron de recuperação. Ambos dependem de um endpoint guardado no banco que nasce nulo.

Motivo: uma segunda implementação do fluxo do WhatsApp criaria divergência funcional e risco de segurança. O endpoint nulo permite publicar e testar schema/worker sem processar mensagens reais por acidente.

Consequencias: a 3B permanece inerte até configurar endpoint e flag da empresa. Retry respeita ordem por conversa, o que pode atrasar mensagens posteriores quando a anterior falha. A deduplicação reduz reenvio após crash, mas a janela entre envio pela Evolution e marcação de conclusão só será fechada pela outbox da 3C. Não ativar empresa real sem testar texto, áudio e documento válidos numa Evolution de staging.

## 2026-07-13 - Fila do WhatsApp entra atrás de flag server-only

Decisao: introduzir a fila inbound de forma aditiva e por empresa, mantendo o processador síncrono como padrão. A flag nasce desligada, só o `service_role` pode alterá-la e restaurações a forçam para `false`. Autenticação e anti-loop continuam antes da fila; payload de mídia guarda apenas metadados mínimos.

Motivo: separar recebimento de processamento reduz perda por timeout, mas ativar a fila antes de existir worker causaria silêncio. A implantação em fatias permite validar schema, deduplicação, RLS e privacidade sem alterar a operação real.

Consequencias: a Fatia 3A pode chegar à produção ainda inerte. Nenhuma empresa deve ser ativada até a Fatia 3B processar, ordenar e limpar jobs. O rollback durante a transição é desligar a flag; o caminho síncrono não pode rodar junto com a fila para o mesmo evento.

## 2026-07-12 - Documento importado é dado, nunca instrução

Decisao: todo texto de plano importado ou recuperado da Memória Estratégica entra no prompt dentro de um bloco explícito de conteúdo não confiável. A resposta da IA é limitada e validada antes de virar proposta; o texto bruto não é repetido no histórico da conversa. Referências por ID são verificadas novamente contra a empresa no momento da gravação.

Motivo: PDF, DOCX, texto colado ou histórico podem conter instruções deliberadas ou acidentais para mudar regras, revelar contexto e associar IDs externos. Prompt sozinho não é fronteira de autorização; o servidor precisa reduzir contexto, aceitar apenas o contrato conhecido e revalidar referências.

Consequencias: `_shared/untrusted-content.ts` é a fronteira comum; `oracle-chat`, `oracle-session` e `whatsapp-webhook` devem ser republicadas juntas quando ela mudar. A confirmação humana continua obrigatória e sem etapa extra para o usuário. A implementação está em produção desde 2026-07-12.

## 2026-07-12 - Limites de IA começam em observação

Decisao: medir chamadas por pessoa/empresa e custo mensal antes do provedor, mas resolver toda empresa sem configuração para `monitor`. Os valores 10/min, 60/min e US$ 100 são referências e gatilhos de alerta, não bloqueios. `block` fica disponível apenas como escolha futura do owner.

Motivo: detectar loops, abuso e crescimento de custo sem tornar o Oráculo burocrático nem interromper testes práticos. Contagem prévia cobre tentativas e concorrência; atualização posterior ao log de uso gera alertas financeiros imediatamente.

Consequencias: telemetria falha aberta para preservar disponibilidade; alertas são deduplicados; confirmação em andamento tem bypass. Política e eventos entram no backup, mas restauração sempre volta para `monitor`. A implementação está em produção, com zero política de bloqueio ativa no momento da publicação.

## 2026-07-12 - MFA opcional e step-up apenas em ações críticas

Decisao: oferecer TOTP aos owners sem desafio obrigatório no login. Cada empresa tem uma política desligada por padrão; somente uma sessão `aal2` pode ativá-la. Quando ativa, o segundo fator é exigido apenas em ações críticas, com defesa tanto nas Edge Functions quanto nas policies da Data API.

Motivo: reduzir risco de tomada de conta sem burocratizar planejamento, Dashboard, conversa ou operação pelo WhatsApp. Cadastrar o fator e ativar a exigência são decisões separadas e reversíveis.

Consequencias: não há recovery codes nativos; owners devem preferir dois fatores e o último recurso é remoção administrativa após validação de identidade. A implementação entrou em produção com a política desligada para todas as empresas; cadastrar fator e ativar proteção continuam decisões explícitas do owner.

## 2026-07-12 - CSP aplicada em preview antes de produção

Decisao: aplicar no Netlify uma Content Security Policy restrita ao próprio app e aos endpoints HTTPS/WSS do projeto Supabase, junto com anti-iframe, `nosniff`, Referrer Policy, Permissions Policy e HSTS. Assets com hash recebem cache imutável de um ano; HTML sempre revalida. A política é exercitada primeiro em deploy de preview com enforcement real, em vez de usar produção como ambiente de descoberta.

Contexto: produção tinha HSTS fornecido pelo Netlify, mas não possuía CSP, proteção de frame, políticas de permissão ou cache longo para bundles versionados.

Motivo: reduzir XSS, clickjacking, MIME sniffing e acesso desnecessário a recursos do navegador sem alterar a experiência. Preview com CSP aplicada detecta bloqueios concretos de script, estilo, fonte e rota antes do domínio principal.

Consequencias: novos serviços externos, imagens remotas, captchas, OAuth em iframe ou outro projeto Supabase exigem revisão explícita da CSP. Estilos inline permanecem permitidos porque React/Recharts usam atributos `style`; `unsafe-eval` continua proibido. `verify:deploy` falha se headers ou política de cache regredirem.

## 2026-07-12 - Política JWT declarativa para todas as Edge Functions

Decisao: tornar `supabase/config.toml` a fonte de verdade de `verify_jwt` para todas as Edge Functions. Apenas `whatsapp-webhook`, `month-turn`, `weekly-pulse`, `deadline-nudges` e `organization-backup` ficam com `verify_jwt=false`; elas mantêm segredo de webhook/cron ou autorização interna. Todas as demais exigem JWT no gateway e continuam validando usuário, membership e papel no código.

Contexto: três funções administrativas estavam com `verify_jwt=false` em produção e apenas duas funções tinham configuração declarada no repositório. Embora a autorização interna evitasse acesso direto, a postura dependia de flags manuais de deploy e permitia drift silencioso.

Motivo: defesa em profundidade e deploy reproduzível. O gateway rejeita sessão ausente ou inválida antes de consumir a função, enquanto a autorização server-side continua protegendo empresa e papel.

Consequencias: `verify:deploy` compara diretórios locais, TOML e funções remotas, falhando para função ausente, extra ou com política errada. Mudanças na lista pública exigem alteração explícita, teste e revisão. Preflight CORS continua público para que navegadores consigam chamar funções autenticadas.

## 2026-07-12 - SheetJS oficial fora do npm e lodash corrigido

Decisao: consumir o SheetJS `0.20.3` pelo tarball oficial e versionado `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, com integridade SHA-512 registrada no `pnpm-lock.yaml`, e fixar o `lodash` transitivo em `4.18.1` pelo override do workspace. Manter Recharts 2 nesta fatia, sem misturar a correção de segurança com uma migração maior para Recharts 3.

Contexto: o pacote `xlsx` publicado no npm ficou em `0.18.5` e tinha advisories altos de Prototype Pollution e ReDoS; as versões corrigidas são distribuídas pelo CDN oficial do fabricante. O override anterior prendia o Recharts ao `lodash 4.17.21`, também vulnerável.

Alternativas: trocar o parser e arriscar perder `.xls`; migrar junto para Recharts 3; ignorar os advisories; depender de versão flutuante do CDN.

Motivo: a versão oficial corrigida preserva `.xlsx`, `.xls` e `.csv`; a URL exata mais a integridade tornam a instalação reproduzível. O override `4.18.1` satisfaz a faixa esperada pelo Recharts e evita ampliar a mudança visual.

Consequencias: o build precisa alcançar o CDN oficial apenas quando o pacote ainda não estiver no cache; alteração do tarball falha por integridade em vez de ser aceita silenciosamente. Fixtures reais e arquivo malformado protegem a compatibilidade. `pnpm audit --prod` deve permanecer sem vulnerabilidade alta/crítica, idealmente sem vulnerabilidade conhecida.

## 2026-07-12 - Fundacao de testes com staging isolado

Decisao: adotar Vitest (unitário/componente, jsdom), Playwright (E2E) e um projeto Supabase de STAGING separado para testes de integração e RLS. Nunca rodar teste que grava/apaga contra produção; usar organizações descartáveis com nome explícito e limpeza garantida.

Contexto: as próximas etapas mexem em integridade e segurança de dados, sem uma rede de testes repetível e sem ambiente onde criar/apagar dados fosse seguro. Docker (Supabase local) não está disponível neste Mac.

Alternativas: testar em produção com orgs descartáveis (arriscado); Supabase local via Docker (indisponível); só testes manuais.

Motivo: o staging é espelho fiel do schema (mesmas 30 migrations, RLS e 66 policies) porém com crons desagendados, então isolamento entre empresas e fluxos de gravação são provados sem risco à Gaam/Aize.

Consequencias: novos scripts de teste + `check` + `verify:deploy`; credenciais do staging apenas em `.agents-private/agent-env`; a fábrica apaga org com gatilhos desligados para que a limpeza defensiva não dependa do comportamento exercitado em cada teste. A Etapa 0 não altera nenhuma funcionalidade.

## 2026-07-11 - Episodios de conversa e memoria historica continua

Decisao: encerrar automaticamente o episodio ativo de conversa depois de 4 horas sem mensagens, criando outro episodio no mesmo canal sem apagar o anterior. Resumos e historicos relevantes continuam como memoria de longo prazo, mas sessoes antigas de planejamento so voltam com confirmacao pendente ou pedido explicito de continuacao.

Contexto: uma conversa do WhatsApp iniciada pela manha ainda tratava um simples "Ola" horas depois como resposta da pergunta anterior. Ao mesmo tempo, planos historicos importados precisavam orientar planejamentos novos, inclusive mensais e de area, sem transformar todo o acervo em um unico chat infinito.

Motivo: episodio curto e memoria longa reproduzem a expectativa natural de conversa: a abertura recomeca depois de uma pausa real, enquanto conhecimento empresarial, decisoes e tentativas anteriores permanecem disponiveis como contexto. Quatro horas evitam cortes durante uma reuniao ou planejamento normal e separam retomadas no mesmo dia.

Consequencias: `_shared/conversation-policy.ts` centraliza o timeout e a deteccao de retomada; `_shared/conversations.ts` arquiva o episodio ocioso, abre outro e cria uma ponte compacta com o resumo e as ultimas 8 falas; o painel web mostra apenas o episodio ativo; `whatsapp-webhook` nao deixa sessao antiga interceptar conversa casual. `_shared/plan-context.ts` passa a selecionar ate 5 historicos relevantes em todos os focos de planejamento, priorizando empresa e area. Nao ha tabela ou migration nova.

## 2026-07-10 - Mensal estruturado, semanal leve e KPI sugerido

Decisao: manter o fechamento mensal como ritual estruturado de gestao; adicionar um convite semanal opcional, natural e sem insistencia; preservar planejamento completo pelo WhatsApp; e permitir que a IA sugira ate dois vinculos entre objetivo e KPI existente, sempre com confirmacao humana.

Contexto: um formulario semanal completo aumentaria atrito para coordenadores. Ao mesmo tempo, esperar o fechamento mensal sem abrir conversa durante a execucao reduz a chance de capturar avancos e travas cedo. Os quatro KPIs executivos tambem estavam separados dos objetivos que podem influencia-los.

Motivo: o mensal sustenta responsabilidade e decisao; o semanal funciona como porta aberta. O WhatsApp continua canal completo de planejamento, enquanto o app oferece visao e configuracao. Vinculos de KPI sao orientacao, nao causalidade automatica.

Consequencias: `check_ins.details` guarda confianca/bloqueio/compromisso; `weekly-pulse` usa contexto temporario e deduplicacao; `objective_kpi_links` tem RLS por objetivo; sugestoes fracas somem e nenhuma relacao e gravada sem confirmacao.

## 2026-07-10 - Governança e exclusão definitiva de empresa

Decisao: separar `Sair da empresa` de `Encerrar empresa`; tornar o encerramento um arquivamento reversível e blindar a exclusão permanente atrás de Edge Function, backup recente obrigatório, confirmação pelo nome e auditoria que sobrevive à exclusão. Remover o `DELETE` direto de `organizations` do navegador.

Contexto: as Fatias 1 e 2 tornaram áreas, membros e itens operacionais reversíveis, mas `authenticated` ainda podia apagar a empresa inteira direto pelo cliente (policy `organizations_delete_owner`), e não havia caminho seguro para encerrar ou excluir de fato.

Alternativas: manter só o arquivamento sem exclusão; exclusão imediata com uma confirmação; exclusão agendada com carência automática (grace period).

Motivo: um negócio precisa poder encerrar e, eventualmente, apagar de vez — mas exclusão é irreversível, então as travas (arquivada + backup recente + nome digitado) e a auditoria persistente reduzem o risco de perda acidental sem burocratizar o caso comum. A carência automática ficou de fora por ora para não adicionar estado/tempo ao fluxo.

Consequencias: nova Edge Function `organization-lifecycle` e RPCs `set_organization_archived`/`delete_organization_permanently` (service_role); `organization_lifecycle_audit` sem FK para `organizations`; `month-turn` ignora empresas arquivadas; o WhatsApp é pausado no arquivamento; a limpeza do storage de backup é explícita (não há cascade). O webhook do Evo Go precisa ser removido manualmente após a exclusão.

## 2026-07-10 - Operação usa arquivo reversível e revisão imutável

Decisao: retirar objetivos, ações-chave, projetos, evidências, check-ins e documentos por arquivamento reversível; registrar atualizações de planos e KPIs como snapshots antes/depois em `operational_revisions`. Não oferecer hard delete desses registros ao navegador.

Contexto: o produto permitia criar e atualizar a execução, mas não retirar registros incorretos ou obsoletos. KPIs e planos podiam ser sobrescritos sem uma trilha uniforme, enquanto excluir objetivos diretamente apagaria ações e evidências em cascata.

Alternativas: liberar delete direto, transformar todo registro em documento histórico ou criar tabelas de versão específicas para cada entidade.

Motivo: o arquivo mantém a operação limpa sem perder memória, e uma auditoria genérica reduz duplicação mantendo o estado anterior completo. O lote de arquivamento do objetivo preserva retiradas independentes feitas antes dele.

Consequencias: a Edge Function `operational-lifecycle` valida permissão e usa RPC exclusiva de `service_role`; registros arquivados saem do app ativo, WhatsApp, virada mensal e contexto da IA. A rota `/arquivo` permite restauração e leitura da auditoria. Backups incluem campos de ciclo de vida e `operational_revisions`. Exclusão definitiva continua reservada para a camada futura de governança.

## 2026-07-10 - Retirada operacional preserva histórico

Decisao: tratar retirada de pessoa como revogação da membership e retirada de área como arquivamento reversível. Não usar hard delete de área no fluxo normal.

Contexto: pessoas e áreas podiam ser adicionadas, mas a remoção de um coordenador falhava pela FK e a exclusão direta de uma área apagaria em cascata planos, objetivos, ações, evidências, check-ins e documentos.

Alternativas: habilitar botões de delete direto, apagar também perfil/Auth da pessoa ou manter áreas antigas misturadas na operação corrente.

Motivo: membership representa acesso e pode ser removida sem apagar autoria/histórico; área representa contexto estratégico e precisa continuar disponível para memória, documentos, backup e eventual restauração.

Consequencias: `remove-member` valida owner e usa RPC transacional exclusiva de `service_role`, com proteção do último owner e reatribuição de áreas. `areas.archived_at` retira a área de telas e contextos operacionais, enquanto documentos e backups preservam os dados. Exclusão definitiva de empresa/estrutura continua reservada para uma futura camada de governança.

## 2026-07-10 - Backup recuperável por empresa em camadas

Decisao: tratar cada empresa como projeto recuperável, com snapshot lógico versionado por `org_id`, armazenamento privado, arquivo portátil criptografado e restauração somente como clone. Manter backup geral da plataforma e réplica externa como camadas independentes.

Contexto: o dono começará testes práticos e precisa preservar planos, execução, KPIs, documentos, memória e configurações mesmo diante de exclusão acidental ou falha de ambiente.

Alternativas: confiar apenas no backup diário do Supabase, exportar tabelas manualmente ou salvar cópias dentro da própria empresa sem fluxo de restauração.

Motivo: o backup global não recupera uma empresa isolada sem afetar outros tenants. O pacote por empresa permite validar checksum, baixar uma cópia cifrada e restaurar sem sobrescrever a origem. O bucket interno dá recuperação rápida; S3 opcional reduz o risco de perder dados e backup no mesmo incidente.

Consequencias: novas tabelas de domínio com `org_id` precisam entrar no catálogo explícito de `_shared/organization-backup.ts`. Secrets e Auth nunca entram no pacote. A restauração remapeia IDs, relaciona usuários por email, desativa WhatsApp e exige recadastrar credenciais. Contas sem nenhuma empresa podem importar o pacote no onboarding; contas com membership precisam usar a área owner da empresa ativa. O cron roda a cada 15 minutos para coalescer marcos e garante um snapshot agendado após 03:00 de São Paulo.

## 2026-07-09 - Importacao de KPI aceita imagem e registra histórico estruturado

Decisao: ampliar a importacao de KPI para planilhas e imagens, usando visao da IA somente para propor os quatro indicadores permitidos; a confirmacao grava anos passados em `kpi_monthly_values` e cria um documento `kpi_history` em Documentos.

Contexto: numeros antigos e screenshots de relatórios trazem informação útil para o Dashboard, mas não devem forçar digitação manual nem virar mídia permanente no banco.

Alternativas: guardar a imagem em Storage, tentar OCR local sem IA, ou gravar o resultado sem documento de origem.

Motivo: visão no provedor de IA reconhece relatórios variados sem reter o arquivo no produto; sanitização server-side impede que a imagem crie indicadores fora de Faturamento, Margem operacional, Produção e Caixa. O documento histórico deixa a origem e as linhas aplicadas auditáveis.

Consequencias: imagem só funciona com modelo `background` de OpenAI, Anthropic ou xAI; Moonshot/Kimi continua adequado a planilhas de texto. A imagem/base64 não é salva em Supabase, e `kpi_history` é excluído da memória de planejamento estratégico para não confundir dado de resultado com plano passado.

## 2026-07-09 - Resultado do Dashboard referencia o ultimo mes fechado

Decisao: o bloco Resultado dos KPIs sempre destaca o mes calendario anterior; o mes atual e identificado como em andamento, sem ser apresentado como atingido consolidado.

Contexto: os realizados sao preenchidos apos o fechamento do mes. Destacar o mes corrente induzia uma leitura de ausencia ou atraso durante toda a execucao normal.

Alternativas: usar o ultimo mes que tiver qualquer valor preenchido, permitir que cada KPI escolha um mes diferente, ou adicionar agora um status persistido de fechamento por mes.

Motivo: o mes anterior preserva uma referencia comum e previsivel para os quatro indicadores. Se algum realizado estiver ausente, a interface mostra `aguardando fechamento`, em vez de recuar silenciosamente para um dado mais antigo.

Consequencias: a virada de janeiro usa dezembro do ano anterior; cada card sem realizado exibe `A fechar`. Um ritual persistido de fechamento pode substituir essa regra de calendario no futuro, caso o processo passe a exigir fechamento formal.

## 2026-07-09 - Importacao de planilha de KPI usa IA como proposta confirmada

Decisao: ler planilhas de KPI no navegador, enviar apenas a tabela textual para a funcao de IA `background` e gravar Meta/Atingido somente depois da revisao e confirmacao da pessoa no editor.

Contexto: lancamentos mensais de Faturamento, Margem operacional, Producao e Caixa costumam existir em planilhas. O produto precisa reduzir digitacao sem permitir que uma leitura ambigua de colunas altere historico executivo silenciosamente.

Alternativas: enviar o arquivo bruto para o servidor, gravar automaticamente toda inferencia do modelo, ou aceitar apenas importacao CSV deterministica com layout fixo.

Motivo: a leitura local protege o arquivo original; o modelo pode reconhecer layouts variados, mas sua resposta e limitada aos quatro KPIs e meses 1-12. A previa explicita torna a automacao auditavel e preserva os valores que a planilha nao informou.

Consequencias: `suggest-kpi-spreadsheet` exige `owner` ou `admin`, registra uso da IA `background` e nao grava dados de KPI. A aplicacao final usa a mesma RLS `is_admin(org_id)` do editor manual. Se a IA estiver indisponivel ou a tabela for ambigua, o fluxo devolve aviso sem alterar dados.

## 2026-07-09 - Tom/persona configurável por empresa

Decisao: criar `org_ai_tone` com presets, dois eixos e preferência personalizada, lida por todos os membros e alterada somente pelo owner. A diretiva de tom é carregada server-side pelo chat web, WhatsApp e condutores de sessão.

Contexto: empresas diferentes precisam do mesmo método do Oráculo com formas de comunicação distintas, sem duplicar prompts nem afrouxar regras de segurança.

Alternativas: manter um tom global em `persona.ts`, guardar texto livre completo por empresa, ou configurar tom separadamente por canal/função.

Motivo: presets e eixos entregam variação controlada e auditável. O texto personalizado é curto, não substitui a persona e não permite reescrever o contrato dos condutores.

Consequencias: `org_ai_tone` usa RLS membro-lê/owner-escreve; o preset equilibrado é fallback e não altera o prompt existente; `toneDirective` reforça que o ajuste vale só para a forma e nunca supera uma pergunta por vez, números reais, segurança ou confirmação de gravação. O primeiro corte é por empresa, igual no app e WhatsApp.

## 2026-07-09 - Dashboard executivo com 4 KPIs e papel admin limitado

Decisao: criar `executive_kpis` e `kpi_monthly_values` para o Dashboard dos 4 KPIs (Faturamento, Margem operacional, Producao e Caixa), permitindo escrita por `owner` ou `admin` via helper `is_admin(org_id)`.

Contexto: o dono quer acompanhar Resultado de forma executiva, com metas e realizados mensais, sem misturar esses numeros com objetivos/plano estrategico. Tambem quer poder delegar lancamentos operacionais sem entregar controle total da empresa.

Alternativas: guardar KPIs em JSON na organizacao, reaproveitar `objectives`, ou permitir apenas owner como editor.

Motivo: tabelas dedicadas preservam historico mensal, RLS e realtime; separar de `objectives` evita transformar indicador executivo em objetivo de planejamento; o papel `admin` permite delegacao controlada para o Dashboard.

Consequencias: `admin` nao deve ser tratado como `owner` fora do escopo dos KPIs. Fluxos de membros, areas, configuracoes, IA, WhatsApp e planejamento continuam owner-only quando ja eram owner-only. O Caixa da primeira versao usa escada de estagios e saldo realizado de fim de mes; nao ha seletor de ano na V1.

## 2026-07-08 - Configuracao de IA precisa validar contra o provedor

Decisao: `save-ai-settings` passa a testar provider/modelo/chave no servidor ao salvar ou testar manualmente, e as chamadas reais de IA passam a atualizar status por funcao em `ai_function_settings`.

Contexto: o dono encontrou o WhatsApp mudo depois de configurar Grok. O app dizia que havia salvo, mas a combinacao de chave/modelo so era testada no primeiro uso real, e o erro caia em fallback silencioso.

Alternativas: manter validacao so por catalogo estatico, remover modelos suspeitos manualmente, ou depender de logs de Edge Functions.

Motivo: o catalogo de modelos ajuda em pricing e sugestoes, mas nao prova que o modelo existe ou que a chave autoriza uso. O probe server-side entrega feedback imediato sem expor segredo.

Consequencias: `ai_function_settings` e `ai_provider_key_status` guardam `last_status`, detalhe truncado e horario. A UI mostra salvamento/teste real, e runtime marca sucesso ou erro por `planning`, `daily` e `background`. O fallback ao usuario continua funcionando quando a IA falha.

## 2026-07-08 - Revisao Estrategica sob demanda como microajuste

Decisao: adicionar o ritual `strategic_review` como acao manual do owner no Plano Estrategico, sem cadencia automatica, para recalibrar objetivos estrategicos existentes quando o contexto mudar.

Contexto: o dono quer revisar metas, numeros, prazos e status ao longo do ano sem recriar o planejamento anual nem perder a direcao original.

Alternativas: criar um cron/lembrete de revisao, reabrir o fluxo completo de Plano Estrategico, ou permitir edicao livre sem rastro historico.

Motivo: um ritual sob demanda preserva a decisao do dono de nao empurrar revisoes automaticas e mantem a fronteira de microajuste. A proposta confirmada atualiza apenas campos permitidos de objetivos existentes e registra antes/depois/porquê em `plan_documents.type = strategic_review`.

Consequencias: `planning_sessions` e `plan_documents` aceitam `strategic_review`; `oracle-session` tem novo condutor; `proposals.ts` aplica `apply_strategic_review` com owner-only e justificativa obrigatoria. Criar/remover objetivos ou trocar estrategia continua pertencendo ao fluxo de planejamento/replanejamento.

## 2026-07-08 - Memoria estrategica como orientacao antes de estruturar dados

Decisao: executar a Fatia 2a da Memoria Estrategica pelo Caminho A: injetar documentos historicos truncados no contexto de planejamento estrategico/trimestral e orientar os condutores a usar o passado como pergunta construtiva, sem criar a tabela `strategic_history`.

Contexto: o dono quer que o Oraculo lembre planos passados para ajudar a fazer planos melhores, entendendo repeticoes, travas e avancos parciais. A decisao de produto continua sendo nao alimentar resultado obrigatorio de metas passadas.

Alternativas: criar agora uma tabela estruturada de metas historicas, chamar IA de bastidores para extrair recorrencias na importacao, ou ignorar o historico ate existir um modelo normalizado.

Motivo: a memoria por contexto entrega valor com menor risco: nao muda schema, nao cria custo de IA extra, nao polui objetivos ativos e permite testar se a orientacao melhora a conversa antes de investir na extracao estruturada.

Consequencias: `_shared/plan-context.ts` busca no maximo 3 `plan_documents.origin = historical` relevantes, truncados para controlar tokens. Os condutores estrategico e trimestral devem lembrar, investigar, detalhar proximos passos e puxar especificidade, sempre em tom de orientacao e sem afirmar que algo nao foi feito como fato. A Fatia 2b continua aberta para criar `strategic_history` se a 2a provar valor.

## 2026-07-07 - Memoria estrategica começa por documentos historicos

Decisao: iniciar a Memoria Estrategica pela importacao de documentos historicos em `public.plan_documents`, usando `origin = historical`, sem criar tabela estruturada de metas nesta primeira fatia.

Contexto: o dono quer alimentar planos e estrategias passadas para que o Oraculo ganhe memoria e, em uma etapa futura, questione metas recorrentes. A decisao de produto foi nao exigir campo de resultado como "batida/nao batida"; a recorrencia e o contexto do documento devem ser suficientes para a IA inferir padroes.

Alternativas: criar imediatamente uma tabela normalizada de historico, transformar planos antigos em objetivos ativos, ou guardar o texto historico apenas em conversa.

Motivo: `plan_documents` ja tem RLS, realtime, filtros, rota de impressao e renderizacao. Usar essa casa primeiro entrega valor rapido, evita poluir Dashboard/objetivos e deixa a futura extracao estruturada como uma camada incremental.

Consequencias: `save-historical-document` valida permissao e tamanho do texto antes de gravar o historico; a tela Plano Estrategico importa arquivo/texto e a tela Documentos filtra por origem. A proxima fatia pode criar `strategic_history` e trocar o texto truncado por resumo deterministico de recorrencias, sem enviar documentos inteiros ao modelo.

## 2026-07-07 - Migração de segredos exige janela coordenada

Decisao: manter temporariamente `public.ai_model_keys` e `public.whatsapp_instance_keys` com RLS, revokes para `anon`/`authenticated` e grants apenas para `service_role`, sem migrar imediatamente para schema `private` ou Supabase Vault.

Contexto: a revisão de segurança identificou que as tabelas atuais guardam segredos em texto puro no schema `public`. Hoje elas estão bloqueadas, mas uma migration futura descuidada poderia reabrir acesso.

Alternativas: migrar agora para `private`, migrar para Vault, ou manter o modelo atual com documentação reforçada até uma janela de deploy coordenado.

Motivo: a migração toca todas as Edge Functions que leem chaves de IA ou WhatsApp e precisa de validação operacional com deploy coordenado. Como as correções críticas de webhook/month-turn precisavam ir para produção agora, a troca de storage de segredos deve ser tratada como mudança dedicada.

Consequencias: qualquer mudança em grants/policies no schema `public` deve revisar explicitamente essas duas tabelas. A migração para `private`/Vault continua recomendada para hardening, mas deve sair em ciclo próprio com migration, ajuste das Edge Functions e teste completo.

## 2026-07-07 - Erros de mutação serão tratados como refactor transversal

Decisao: não corrigir pontualmente os `fire-and-forget` de `src/state/store.tsx` neste ciclo; tratar a propagação de erro para a UI como refactor transversal dedicado.

Contexto: o store tem várias mutações que lançam erro dentro de `.then()` sem `.catch`, o que pode gerar rejeições não tratadas e mensagens de sucesso falsas.

Alternativas: adicionar `.catch` em cada chamada atual, migrar gradualmente para helpers centralizados, ou transformar as mutações principais em React Query mutations com `onError`.

Motivo: uma correção parcial reduziria alguns sintomas, mas manteria comportamento inconsistente. O melhor caminho é centralizar tratamento de erro, invalidation e feedback visual, especialmente para configurações sensíveis e criação/edição de objetivos.

Consequencias: novos fluxos de mutação devem evitar `void promise.then(...)` sem tratamento. O refactor futuro deve priorizar `save-ai-settings`, `save-whatsapp-settings`, criação/edição de objetivos e confirmações de sessão.

## 2026-07-07 - Dashboard Evolução orientado a objetivos reais

Decisao: remover os cards fixos de scaffolding da seção "Evolução" do Dashboard e renderizar objetivos reais do tipo Evolução (`seed`), com estado vazio quando a empresa ainda nao cadastrou esse tipo de objetivo.

Contexto: a auditoria de 2026-07-05 identificou que empresas novas podiam herdar rótulos de demonstração como "Pipeline de Novos Produtos" e "Treinamento de Liderança Aize", porque o Dashboard procurava IDs de seed antigos e usava textos fixos.

Alternativas: manter rótulos genericos, esconder a seção inteira sem dados ou transformar a seção em um resumo dos objetivos reais.

Motivo: o Dashboard precisa refletir a estratégia da empresa ativa, nao dados de referencia. Mostrar os objetivos reais preserva a utilidade da seção quando ha plano cadastrado; o estado vazio orienta a criação sem vazar nomes de demonstração.

Consequencias: ajustes futuros na seção "Evolução" devem continuar partindo de `objectives.type = "seed"` e evitar IDs fixos de seed/demo.

## 2026-07-05 - Documento padrao Oraculo deterministico

Decisao: executar a Fase 6 da V3 gerando um `plan_documents` canonico sempre que uma proposta de plano ou fechamento for confirmada, com renderizacao unica para tela, PDF A4 e WhatsApp.

Contexto: o Oraculo ja criava propostas e gravava planos, mas faltava um documento final claro para o usuario validar, imprimir e pedir pelo WhatsApp. Deixar o modelo decidir a formatacao a cada resposta deixaria o resultado inconsistente.

Alternativas: gerar PDF direto no servidor, pedir para a IA escrever um documento em markdown a cada consulta, ou manter somente os cards de objetivos.

Motivo: o conteudo precisa nascer da proposta aprovada, sem nova chamada de IA, para preservar rastreabilidade e evitar divergencia entre banco e documento. A tela e o PDF usam o mesmo componente `PlanDocument`; o WhatsApp usa um renderizador deterministico em `_shared/plan-render.ts`.

Consequencias: `proposals.ts` chama `_shared/plan-documents.ts` depois de gravar `save_strategic_plan`, `save_quarterly_plan`, `save_monthly_plan`, `month_close` ou `quarter_close`; a rota `/documentos` lista e filtra documentos; `/documentos/:id/imprimir` renderiza sem layout do app; `whatsapp-webhook` responde `document_question` buscando o documento mais recente por tipo/periodo/departamento. Arquivos mensais e trimestrais recebidos pelo WhatsApp agora tambem podem gerar proposta estruturada, mas continuam exigindo confirmacao.

## 2026-07-04 - Arquivos no app e importacao trimestral por proposta

Decisao: permitir anexar PDF/PPTX/DOCX/TXT no chat lateral do app e importar Plano Trimestral pronto diretamente na tela Planos Trimestrais, mantendo extração local de texto, proposta pendente e confirmacao antes de gravar.

Contexto: o usuario conseguia importar Plano Estrategico pronto, mas nao havia entrada de arquivo no chat do app nem no modulo trimestral. Isso quebrava o fluxo independente app/WhatsApp e impedia testar planos prontos por departamento.

Alternativas: tratar arquivo como chat comum, gravar objetivos direto ao importar, ou deixar o trimestral para fase futura.

Motivo: reutilizar `src/lib/fileImport.ts` preserva segurança e experiencia. O arquivo bruto nunca vai ao banco; apenas texto extraido entra na conversa ou em `oracle-session`. Para o trimestral, uma acao dedicada `import_ready_quarterly_plan` obriga `proposal.type = save_quarterly_plan`, mostra previa no painel lateral e so grava depois de confirmacao e validacao server-side.

Consequencias: `oracle-session` passa a expor `prepareReadyQuarterlyPlanProposal`; a tela Planos Trimestrais exige escolher o departamento antes de anexar o arquivo; o chat lateral aceita anexos como mensagem da conversa/sessao ativa. Plano Mensal por arquivo no app continua dependente de uma sessao mensal ativa; pelo WhatsApp, a Fase 6 adicionou importacao mensal estruturada com confirmacao.

## 2026-07-04 - Fechamentos de mes e trimestre por sessao

Decisao: executar a Fase 5 da V3 com condutores `month_close` e `quarter_close` no mesmo motor `oracle-session`, mantendo proposta pendente e confirmacao antes de gravar.

Contexto: o Oraculo ja conduzia planejamento e atualizacoes rapidas, mas a virada de mes ainda era um check-in simples ou uma resposta dizendo que fechamento guiado ficaria para depois. O usuario precisa fechar ciclos com status final, evidencias, aprendizados e destino de pendencias.

Alternativas: manter o check-in simples, gravar fechamentos direto pela conversa, ou criar uma tela separada sem IA.

Motivo: usar `planning_sessions` preserva estado, memoria e confirmacao. `proposals.ts` continua sendo a fronteira segura: o modelo monta `month_close`/`quarter_close`, mas o servidor valida permissao e aplica apenas operacoes conhecidas.

Consequencias: novos condutores ficam em `_shared/conductors/month-close.ts` e `_shared/conductors/quarter-close.ts`; `plan-context` passa a incluir periodo em foco e IDs de objetivos/acoes; `oracle-chat` e `whatsapp-webhook` abrem fechamento real em `close_period`; `month-turn` envia convites de virada por WhatsApp quando agendada.

## 2026-07-04 - Escopo de conversa do WhatsApp

Decisao: limitar o WhatsApp do Oraculo a temas de negocio, gestao, administracao, estrategia, planejamento, objetivos, areas, execucao e funcionamento do proprio Oraculo.

Contexto: o WhatsApp pode ser usado como conversa livre, mas o produto nao deve virar assistente geral para Copa do Mundo, guerra, politica ampla, entretenimento ou curiosidades sem relacao com a empresa. Isso desviaria o uso e poderia gerar respostas longas fora do proposito do sistema.

Alternativas: deixar o modelo responder qualquer assunto, confiar apenas no prompt, ou bloquear tudo que mencione temas externos.

Motivo: uma trava deterministica antes da IA evita desvio de proposito. Ao mesmo tempo, a resposta nao pode soar padronizada: quando o assunto e claramente fora de escopo, o webhook usa a funcao `daily` para gerar uma recusa contextual, citando o tema sem responder o conteudo factual externo, e puxa a conversa de volta para gestao/planejamento. Para temas leves, o prompt exige uma piadinha curta ligada ao contexto do assunto; para temas sensiveis, como guerra, a resposta deve ser sobria e nunca fazer piada sobre sofrimento. O prompt tambem recebe apenas os assuntos detectados na mensagem atual e rejeita respostas que mencionem categorias nao citadas, porque o modelo estava reutilizando exemplos do prompt como "Copa, guerra e fofoca" em qualquer caso. A regra permite temas externos quando eles estao claramente conectados ao negocio, como risco de mercado, fornecedores, custos ou estrategia.

Consequencias: `whatsapp-webhook` passa a ter funcoes locais de escopo (`isBusinessOrOracleTopic`, `isClearlyGeneralTopic`, `outOfScopeKind`, `outOfScopeHumorGuide`, `buildOutOfScopeReply`, `fallbackOutOfScopeReply`) e o prompt diario tambem reforca a regra. Ajustes futuros de tom ou palavras-chave devem atualizar o runbook e redeployar o webhook.

## 2026-07-04 - WhatsApp operacional com intencao e atualizacoes rapidas

Decisao: executar a Fase 4 da V3 criando uma camada de roteamento de intencao antes da resposta diaria do Oraculo, com suporte a iniciar sessoes de planejamento pelo WhatsApp/app e aplicar atualizacoes operacionais pequenas pelo WhatsApp.

Contexto: depois da memoria por conversa e do contexto textual do plano, o Oraculo ainda respondia como chat. O usuario precisava operar o sistema no dia a dia: pedir para montar plano, avisar que uma acao foi concluida, atualizar progresso ou registrar evidencia sem navegar por telas.

Alternativas: deixar tudo como conversa livre, exigir sempre uso do app, ou permitir que o modelo gravasse qualquer coisa diretamente.

Motivo: classificar intencao antes da resposta deixa o WhatsApp virar canal operacional real sem perder seguranca. Criacao de plano continua passando por sessao e proposta confirmada. Atualizacoes rapidas ficam limitadas a alteracoes pequenas em objetivos/acoes existentes, com validacao server-side de alvo e permissao.

Consequencias: `whatsapp-webhook` e `oracle-chat` agora dependem de `_shared/intent-router.ts`; o WhatsApp tambem usa `_shared/quick-updates.ts` e `_shared/whatsapp.ts` para formatacao e envio em blocos. A funcao `background` passa a ser critica para classificacao e deve ter modelo/chave configurados. Fechamento guiado e documentos padronizados continuam como respostas seguras ate as fases seguintes.

## 2026-07-04 - Memoria por conversa e contexto textual do plano

Decisao: ligar a Fase 3 da V3 ao runtime, usando `conversations` como fio de historico por pessoa/canal e `_shared/plan-context.ts` como fonte textual do plano para a IA.

Contexto: o chat web e o WhatsApp ainda podiam buscar mensagens pelo `org_id`, misturando assuntos de pessoas e canais diferentes. O modelo tambem recebia JSON tecnico de objetivos e planos, sem uma leitura humana clara e com risco de ignorar `key_actions`.

Alternativas: manter historico por empresa, filtrar apenas por canal, guardar contexto todo no frontend, ou criar um prompt diferente por tela sem helper central.

Motivo: conversa por pessoa/canal evita contaminacao; resumo automatico reduz custo e preserva decisoes antigas; contexto textual deixa o modelo entender plano, area, trimestre, mes, donos, prazos, evidencias e acoes-chave sem depender de interpretar schema de banco.

Consequencias: `oracle-chat`, `oracle-session` e `whatsapp-webhook` devem gravar mensagens com `user_id` e `conversation_id`; o painel web passa a carregar as mensagens web do usuario atual; `conversations.summary` e dados de plano devem ser tratados como dados privados da empresa. Quando novas chamadas de IA forem adicionadas, elas devem reutilizar `_shared/conversations.ts` e `_shared/plan-context.ts` em vez de buscar historico geral.

## 2026-07-04 - Fundacao de inteligencia da V3

Decisao: criar uma camada de dados para memoria por conversa, sessoes de planejamento com estado, funcoes de IA por uso e documentos canonicos de plano.

Contexto: a V2 respondia mensagens de forma isolada e usava um unico modelo para todos os usos. O plano da V3 exige que o Oraculo conduza planejamento fase a fase, preserve contexto por pessoa/canal e gere documentos consistentes sem depender de improviso do modelo.

Alternativas: manter historico unico por empresa, guardar estado apenas no frontend, ou criar tabelas separadas somente quando cada tela fosse implementada.

Motivo: preparar a base de forma testavel e sem mudar comportamento visivel. A separacao por conversas evita contaminacao de historico; sessoes persistidas permitem retomar planejamento; funcoes de IA separam modelo caro de planejamento e modelo leve de rotina; documentos canonicos garantem renderizacao deterministica depois.

Consequencias: novas tabelas publicas precisam de RLS e documentacao. As chaves seguem fora do frontend em `public.ai_model_keys`, agora por provedor, preservando a configuracao OpenAI existente.

## 2026-07-04 - Roteador de IA por funcao

Decisao: separar o uso de IA em tres funcoes configuraveis por empresa: `planning`, `daily` e `background`.

Contexto: a V2 usava um unico provider/modelo para conversas, classificacao de documentos e planejamento. Isso dificultava equilibrar qualidade e custo, porque planejamento pede um modelo mais forte e rotinas de bastidor podem usar modelos economicos.

Alternativas: manter um unico modelo global, criar uma configuracao por tela, ou amarrar cada funcao a um provedor fixo.

Motivo: funcoes explicitas deixam o owner escolher custo e qualidade por tipo de trabalho sem expor chaves no frontend. O roteador preserva fallback para `ai_settings`, entao a configuracao OpenAI/gpt-5.4 existente continua funcionando.

Consequencias: `save-ai-settings` aceita payloads de chave por provedor e modelo por funcao; chamadas de IA gravam `metadata.aiFunction`; a tela de Configuracoes passa a exibir quatro provedores e tres funcoes. Ao adicionar provedor novo, e preciso atualizar checks de banco, catalogos de pricing no frontend/servidor e documentacao.

## 2026-07-04 - Motor de sessao com proposta confirmada

Decisao: implementar `oracle-session` como motor server-side para conduzir planejamento estrategico, trimestral e mensal com fase, estado persistido e proposta pendente.

Contexto: a V2 tinha chat livre e criadores manuais. A V3 precisa que o Oraculo conduza fase a fase, lembre o que ja coletou e tenha "maos" para gravar, mas sem gravar automaticamente por interpretacao solta do modelo.

Alternativas: deixar o frontend controlar as fases, usar function calling nativo de cada provedor, ou manter criadores manuais enquanto o chat apenas orienta.

Motivo: estado server-side permite retomar sessoes e cruzar canais no futuro; envelope JSON uniforme funciona com todos os provedores; proposal + confirmacao reduz risco de gravacao indevida.

Consequencias: `planning_sessions` vira tabela critica; prompts de condutores ficam empacotados em TypeScript; `proposals.ts` deve manter validacao server-side de permissao sempre que um novo tipo de proposta for criado.

## 2026-07-04 - Plano pronto entra pela sessao do Oraculo

Decisao: permitir importar ou colar um Plano Estrategico pronto mesmo quando a empresa ainda nao tem plano cadastrado, mas rotear esse conteudo para `oracle-session` em uma acao dedicada (`import_ready_plan`) em vez de gravar direto ou tratar como chat comum.

Contexto: o usuario quer testar o sistema do zero e tambem aproveitar planos existentes em PDF, PPTX, DOCX, TXT ou texto colado. O primeiro desenho enviava o plano como mensagem inicial da sessao, o que deixava a IA livre para apenas revisar o texto e mandar o usuario para outro canal, sem criar objetivos reais no módulo.

Alternativas: manter a importacao escondida ate existir um plano, criar gravacao direta a partir do arquivo, tratar o plano pronto apenas como revisao local sem persistencia, ou manter como mensagem inicial do condutor.

Motivo: reaproveita o motor seguro da Fase 2, mas com um prompt especifico que obriga a saida estruturada `save_strategic_plan`. O arquivo/texto vira insumo da proposta; o Oraculo monta objetivos/projetos rastreaveis e o usuario confirma antes de qualquer escrita estruturada.

Consequencias: o frontend precisa manter a aba "Colar plano pronto" visivel na base zerada e separar "Só revisar texto" de "Gerar proposta e carregar no módulo". Arquivos brutos continuam fora do banco; apenas texto extraido/colado entra na conversa da sessao. O WhatsApp usa o mesmo importador quando o documento for classificado como Plano Estrategico.

## 2026-06-29 - Supabase como backend da V2

Decisao: usar Supabase para autenticacao, banco PostgreSQL, RLS, realtime e Edge Functions.

Contexto: a V2 precisava sair do prototipo frontend puro e ganhar persistencia, contas, permissoes e IA configuravel sem construir um backend completo do zero.

Alternativas: backend Node proprio, Firebase, manter frontend puro.

Motivo: Supabase entrega PostgreSQL, Auth, RLS e funcoes server-side com pouco atrito, mantendo rastreabilidade e seguranca por empresa.

Consequencias: migrations e RLS viram parte critica da manutencao; secrets de servidor precisam ficar nas Edge Functions.

## 2026-06-29 - Netlify para deploy do frontend

Decisao: publicar o frontend no Netlify em `https://oraculo-v2-aize.netlify.app`.

Contexto: o usuario pediu criacao/autenticacao no Netlify com Google e deploy do frontend.

Alternativas: Vercel, Supabase Hosting, servidor proprio.

Motivo: Netlify resolve build estatico do Vite e permite configurar variaveis publicas de ambiente com simplicidade.

Consequencias: rotas internas precisam de fallback SPA em `netlify.toml` e `public/_redirects`.

## 2026-06-29 - Chaves de IA no schema privado

Decisao: salvar chaves de IA em `private.ai_model_keys` e expor publicamente apenas `has_key` e `key_preview`.

Contexto: a V2 permite configurar provider/modelo de IA, mas o frontend nao pode armazenar segredos.

Alternativas: salvar chave em `localStorage`, salvar em tabela publica com RLS, exigir env fixa por projeto.

Motivo: o schema privado acessado somente por Edge Function reduz risco de exposicao pelo cliente.

Consequencias: chamadas ao modelo precisam passar por Edge Functions e usar validacao server-side.

Nota de evolucao: em 2026-07-02 o caminho operacional foi ajustado para `public.ai_model_keys` com RLS/revokes e acesso apenas por `service_role`. A decisao de seguranca permaneceu a mesma: segredo nunca chega ao frontend.

## 2026-07-02 - Tabelas de segredo acessiveis apenas por service role

Decisao: migrar o caminho operacional das chaves para `public.ai_model_keys` e `public.whatsapp_instance_keys`, mantendo RLS habilitado, acesso revogado para `anon` e `authenticated`, e grants apenas para `service_role`.

Contexto: as Edge Functions precisavam acessar chaves de IA e Evolution API de forma previsivel no ambiente hospedado. O desenho inicial usava schema `private`, mas o caminho com tabelas publicas bloqueadas por RLS/revokes ficou mais simples de operar com service role.

Alternativas: manter apenas schema `private`, salvar secrets como environment variables fixas, ou salvar no frontend.

Motivo: preservar a regra de seguranca principal, sem expor segredo ao navegador, e facilitar operacao por Edge Functions.

Consequencias: documentacao e runbook devem citar `public.*_keys` como estado atual. Migrations antigas ainda podem mencionar `private.*_keys` por historico.

## 2026-07-02 - Consumo e pricing de IA rastreaveis

Decisao: adicionar `ai_usage_logs` e pricing por provider/modelo em `ai_settings`.

Contexto: o usuario pediu que o sistema calculasse tokens e valor gasto automaticamente sempre que um modelo fosse usado.

Alternativas: estimar manualmente, deixar custo fora do produto, ou depender apenas do painel do provedor de IA.

Motivo: o dono da empresa precisa ver consumo no proprio Oraculo e entender o impacto financeiro do uso por WhatsApp e web.

Consequencias: toda chamada de IA bem-sucedida deve registrar tokens, custo estimado, canal e modelo. Mudancas de provider/modelo precisam atualizar catalogo de pricing no frontend e na Edge Function.

## 2026-07-09 - Token derivado para webhook Evo Go sem header

Decisao: manter `x-oraculo-webhook-secret` como autenticacao preferencial do `whatsapp-webhook`, mas aceitar `evoGoToken` na URL para Evo Go. O token e derivado por HMAC-SHA-256 do texto `evo-go:<orgId>` usando o `webhook_secret`, em vez de colocar o segredo bruto na query string.

Contexto: o Manager da Evo Go permite configurar `webhookUrl` e eventos, mas nao expoe campo de header customizado. A configuracao com apenas `orgId` faz a Evo chamar o webhook sem segredo aceito, resultando em 401 antes de gravar `chat_messages`.

Alternativas: liberar webhook sem autenticacao quando houver `orgId`, voltar a aceitar `?secret=` com o segredo bruto, configurar um proxy externo para adicionar header, ou exigir ajuste manual na VPS.

Motivo: o token derivado restaura o WhatsApp real sem abrir o webhook publicamente e sem duplicar o segredo bruto em URL/logs.

Consequencias: a URL operacional da Evo Go deve conter `orgId` e `evoGoToken`. Se o `webhook_secret` for rotacionado, o token derivado precisa ser recalculado e salvo novamente no Manager da Evo Go.

## 2026-07-02 - WhatsApp salva mensagem antes de chamar IA

Decisao: no `whatsapp-webhook`, salvar a mensagem recebida em `chat_messages` antes da chamada ao modelo.

Contexto: em testes reais, mensagens chegavam mas nao havia resposta quando a funcao quebrava antes de gravar a resposta do Oraculo.

Alternativas: salvar somente depois da resposta, ou confiar apenas nos logs da Evolution/Supabase.

Motivo: diagnostico operacional fica claro: mensagem `user` sem mensagem `oracle` logo depois indica falha em IA, fallback ou envio.

Consequencias: o runbook deve orientar a comparar `chat_messages` e `ai_usage_logs` quando o WhatsApp nao responder.

## 2026-07-02 - Áudio do WhatsApp descriptografado no webhook

Decisao: descriptografar mídia de áudio do WhatsApp dentro do `whatsapp-webhook` quando o Evo Go entregar bytes criptografados em vez de áudio pronto.

Contexto: em teste real, o áudio chegava ao webhook, mas a OpenAI recusava a transcrição com `invalid_request_error`. O codigo tecnico mostrava `application/octet-stream` e assinatura inicial `62f2c82b...`, nao `OggS`, indicando que o arquivo baixado era mídia criptografada do WhatsApp.

Alternativas: exigir que a Evolution devolvesse base64 ja descriptografado, salvar o arquivo para analise manual, consultar logs brutos, ou pedir ao usuario sempre mandar texto.

Motivo: descriptografar em memoria com `mediaKey` evita salvar áudio bruto, reduz dependencia de logs privados e permite que a experiência por WhatsApp aceite áudio de forma natural.

Consequencias: o webhook precisa manter a logica de download da mídia, normalizacao de MIME, descriptografia por HKDF/SHA-256 com info `WhatsApp Audio Keys`, AES-CBC e fallback de transcrição OpenAI. Diagnosticos devem continuar seguros e sem conteudo do áudio.

## 2026-07-05 - Limpeza final da V3 e fonte unica dos roteiros

Decisao: remover roteiros Markdown soltos, guia legado separado e a funcao mensal antiga, concentrando persona, tom e guias de contexto em `supabase/functions/_shared/conductors/persona.ts`. Check-ins e fechamentos passam pelo condutor de fechamento e pela funcao `month-turn`.

Contexto: ao fim das fases 0 a 6 da V3, os condutores estruturados passaram a cobrir planejamento, importacao, fechamento, documentos canonicos e virada de mes. Manter os arquivos antigos criava risco de manutencao dupla e deploy inconsistente.

Alternativas: manter os arquivos como historico, duplicar orientacoes nos webhooks, ou deixar o modulo antigo apenas para o chat web.

Motivo: uma fonte unica reduz divergencia de tom, evita referencia a codigo morto e deixa claro onde calibrar comportamento do Oraculo.

Consequencias: ajustes de personalidade, roteiro, conversa casual e guias por contexto devem ser feitos em `conductors/persona.ts` e publicados nas Edge Functions que usam IA conversacional, principalmente `oracle-chat`, `oracle-session` e `whatsapp-webhook`.

## 2026-07-02 - Guias do Oraculo empacotados em codigo

Decisao: empacotar os guias e o tom do Oraculo em modulo TypeScript compartilhado nas Edge Functions.

Contexto: a funcao tentava ler arquivos `.md` em runtime, mas esses arquivos nao eram enviados no bundle do deploy.

Alternativas: configurar empacotamento dos `.md`, duplicar prompts em cada funcao, ou manter guias no banco.

Motivo: modulo TypeScript compartilhado e enviado automaticamente no deploy das funcoes, reduzindo risco de quebra.

Consequencias: essa decisao evoluiu na limpeza final da V3; a fonte atual fica junto dos condutores.

## 2026-06-29 - React Query com Context para estado

Decisao: usar React Query para dados remotos e Context/reducer para UI local.

Contexto: o projeto V1 usava estado em memoria. A V2 passou a carregar dados remotos e precisava de refresh consistente.

Alternativas: Redux, Zustand, apenas Context.

Motivo: React Query simplifica cache/refetch de dados Supabase sem adicionar arquitetura pesada.

Consequencias: mutacoes devem invalidar queries ou chamar `refresh` para manter telas coerentes.

## 2026-06-29 - Documentacao minima de manutencao

Decisao: manter README, AGENTS, docs de arquitetura, seguranca, runbook, decisoes e changelog.

Contexto: o projeto passou de prototipo para V2 publicada e precisa ser recuperavel por IA ou humano.

Alternativas: documentar apenas no chat.

Motivo: chats se perdem; arquivos versionaveis mantem contexto operacional.

Consequencias: mudancas de arquitetura, ambiente, deploy e seguranca devem atualizar docs no mesmo ciclo.
## 2026-07-13 — Alertas operacionais informam, mas não bloqueiam

O monitor operacional roda a cada cinco minutos e mantém alertas deduplicados para owners. Nesta fase, nenhum alerta pausa WhatsApp, IA, backup ou acesso ao aplicativo e nenhuma notificação é enviada automaticamente. A decisão preserva a operação simples durante o piloto; bloqueios e canais externos exigem decisão posterior baseada nos SLOs observados.
## 2026-07-14 - Producao usa SHA aprovado e segredo tardio

Decisao: substituir o workflow apenas de verificacao por um unico `Production release`, manual, ligado a um SHA completo da `main` com `CI required` verde. O preflight nao acessa segredo de producao; verificacao, deploy explicito de Functions e migrations rodam em jobs separados sob o GitHub Environment `production`. O owner autoriza o disparo na conversa imediatamente antes da publicacao, sem um segundo clique de reviewer no GitHub. O Environment preserva os segredos isolados e a restricao à branch `main`.

Motivo: uma credencial administrativa disponivel durante desenvolvimento ou antes da validacao transforma erro de ambiente em risco de producao. Ao mesmo tempo, aprovar toda edicao de frontend ou uso normal do produto criaria burocracia sem reduzir esse risco.

Consequencia: a autorização na conversa é uma regra operacional, não uma prova criptográfica entregue ao GitHub. A defesa técnica continua sendo o disparo manual por conta autenticada, SHA exato, CI verde, preflight sem segredo, escopo explícito e recusa padrão de migrations destrutivas. Push comum não aciona esse fluxo.

Consequencias: frontend continua no caminho Netlify comum. Functions exigem lista explicita. Migrations sao comparadas com o pacote aprovado, o conjunto realmente pendente e um guard de operacoes destrutivas; excecao exige a sinalizacao `allow_destructive_migration`, mas continua sujeita a CI e aprovacao. O Chaves local fica somente como recuperacao de emergencia.

## 2026-07-14 - Alertas de seguranca informam sem burocratizar

Decisao: completar a S4 usando o painel existente de Saude operacional. Exclusao permanente exige empresa arquivada, nome exato, backup recente e confirmacao final explicita; AAL2 continua condicionado a politica opcional da empresa. Espera de 24 horas e segundo owner permanecem desligados. Replica externa, arquivamento incomum em massa, schema destrutivo e exercicios de recuperacao vencidos geram alertas informativos, sem pausar o app.

Motivo: acoes irreversiveis precisam de defesa server-side e rastreabilidade, mas planejamento, WhatsApp e deploys rotineiros nao devem ganhar novos cliques. A replica R2 append-only com lock de 90 dias e a alternativa formal ao PITR desligado nesta fase.

Consequencias: migrations destrutivas autorizadas precisam chamar `record_destructive_schema_change`; o guard recusa a excecao sem esse registro. Restauracoes bem-sucedidas cobrem o lembrete mensal, e exercicios originados da copia externa usam `exercise_type = disaster_drill` para a cadencia trimestral. Todos os eventos tecnicos sao service-only e sanitizados.

## 2026-07-15 - Inventário precede política e automação de retenção

Decisão: concluir a Fatia 6A como documentação verificável do estado atual, sem criar aceite, base legal automática, limpeza, migration, tela ou bloqueio. `docs/DATA_INVENTORY.md` passa a ser a fonte de verdade para classificação, fluxo externo, retenção, backup, exportação e exclusão.

Motivo: implementar política ou apagar dados antes de saber exatamente o que existe criaria falsa conformidade e risco de perder memória estratégica. A classificação técnica também não pode decidir sozinha quem é controlador/operador ou qual base legal se aplica.

Consequências: toda nova tabela, Function, mídia persistida ou provedor externo deve atualizar o inventário. A Fatia 6B depende de validação responsável dos papéis, contato, bases legais e contratos. As lacunas encontradas, inclusive manifesto incompleto das exclusões de backup e retenção ilimitada de algumas tabelas técnicas, permanecem visíveis e não foram corrigidas silenciosamente nesta fatia.

## 2026-07-15 - Ciência operacional versionada sem bloqueio

Decisão: publicar um aviso operacional de dados em PT-BR e registrar uma única ciência por versão e empresa, feita pelo owner. O aviso é público, aparece também nas Configurações e pode gerar uma chamada discreta no shell; dispensar ou não registrar nunca bloqueia login, planejamento, Dashboard ou WhatsApp.

Motivo: transparência precisa acompanhar o comportamento real do produto sem transformar toda finalidade em consentimento genérico nem criar confirmações repetidas. A versão e o ator tornam a ciência auditável, enquanto RLS e ausência de update/delete preservam o registro.

Consequências: o contato operacional inicial é o owner pelo canal de convite/operação. Razão social, contato institucional, papéis contratuais, bases legais e termos dos suboperadores continuam dependendo de validação responsável; o aviso não se apresenta como parecer jurídico. Clones restaurados não herdam a ciência e devem registrar a versão novamente.

## 2026-07-15 - Retenção técnica automática sem apagar memória

Decisão: usar prazos globais conservadores para dados estritamente técnicos, executados uma vez ao dia por `pg_cron`, sem adicionar configurações ou confirmações ao trabalho cotidiano. A política remove filas concluídas/mortas, deduplicação, telemetria, erros, lembretes, comandos finalizados e registros de custo/limite após suas janelas documentadas. A versão material do aviso passa a `2026-07-15-r2`.

Motivo: reduzir exposição e crescimento indefinido sem transformar o Oráculo em um processo burocrático nem comprometer a memória que torna a IA útil. Prazos editáveis por empresa aumentariam complexidade e risco de uma configuração acidental apagar contexto importante.

Consequências: planos, objetivos, documentos, conversas, sessões, KPIs, históricos, usuários, backups manuais, alertas abertos e auditorias críticas não entram no cron. A prévia e a execução são service-only, a execução usa lock e cada rodada guarda somente contagens sanitizadas por 730 dias. Alterar escopo ou prazo exige migration, teste de preservação e atualização do inventário/aviso quando material.
## 2026-07-15 — Exclusão pessoal preserva a memória da empresa

Decisão: separar a identidade pessoal do histórico empresarial. A pessoa pode exportar seus dados e excluir Auth/perfil/vínculos, mas planos, documentos, evidências, conversas e sessões produzidos durante o vínculo permanecem na empresa com referências pessoais nulas.

Motivos:

- desligamento não pode apagar a memória estratégica compartilhada;
- `ON DELETE SET NULL` é mais simples e verificável que criar uma identidade fictícia;
- a proteção do último owner precisa existir no banco, inclusive para Admin Auth;
- o telefone só deve ser limpo quando não houver nenhum vínculo restante, para não quebrar outra empresa válida;
- a exportação pessoal não deve virar um atalho para baixar dados de colegas ou a empresa inteira.

Consequência: exclusão de conta usa uma confirmação por email digitado e MFA apenas quando a empresa já exige; não há espera, segundo aprovador ou aprovação recorrente. A trilha sobrevivente guarda fingerprint e resumo sanitizado, sem PII direta.

## 2026-07-15 — Auditoria administrativa automática e sem nova aprovação

Decisão: registrar mudanças administrativas relevantes em uma trilha única, imutável e legível somente por owner. Pessoas, modelos/limites de IA, WhatsApp, política de MFA, backups e retenção geram evento automaticamente ao concluir a operação; o fluxo original não recebe confirmação, espera ou segundo aprovador.

Motivos:

- investigações e recuperação precisam responder quem mudou o quê e quando;
- request ID idempotente reduz duplicidade em retries;
- estados anterior/posterior são úteis, mas secrets, contatos, prompts e conteúdo não pertencem à auditoria;
- uma tabela única e um helper compartilhado mantêm sanitização e RLS consistentes.

Consequências: somente Functions com `service_role`, migration ou sistema inserem; owners consultam na aba Auditoria e demais papéis não leem. A trilha acompanha o backup/clone, não entra na limpeza automática e anonimiza ator/alvo na exclusão pessoal. Falha ao registrar impede a Function de responder sucesso, evitando alteração reportada como concluída sem rastreabilidade; retries reutilizam request ID e não duplicam o evento.

## 2026-07-15 — Recuperação comprovada sem aprovação na rotina

Decisão: manter a proteção automática das alterações e concentrar a prova de recuperação em um único botão owner-only. O exercício mensal lê o Storage interno; quando o ciclo trimestral estiver vencido, o mesmo botão só aceita uma réplica R2 concluída. Toda restauração cria clone, nunca sobrescreve a empresa, e só é aprovada após checksum, contagens críticas, ausência de credenciais e WhatsApp inerte.

Motivos:

- RPO precisa partir da primeira alteração ainda não protegida, não do último evento recebido;
- testar somente o backup interno não comprova independência do projeto principal;
- um clone navegável prova mais que a existência do arquivo;
- incidentes precisam de trilha própria, mas texto livre aumentaria risco de guardar segredos ou conteúdo sensível;
- confirmações em cada gravação diária tornariam estratégia e WhatsApp burocráticos sem melhorar a capacidade de restaurar.

Consequências: a operação comum continua sem clique novo. Owners veem RPO de 30 minutos, RTO de 4 horas, pendência e duração do pacote; abrem/resolvem incidentes por seletores estruturados. O runbook define owner operacional, canal fora do app, ordem Supabase/Netlify/Evolution/IA e rotação de credenciais. Objetos R2 são gravados como gzip sem `Content-Encoding`, e a leitura mantém compatibilidade com réplicas legadas que o transporte já tenha descompactado, sempre exigindo checksum. A comunicação externa e o responsável jurídico continuam dependendo de validação formal, não de decisão automática do software.
## 2026-07-16 - Qualidade estratégica antes do piloto operacional completo

Decisão: depois do hardening técnico e do Teste Mestre, o Oráculo passa por um Mapa A de qualidade estratégica antes de retomar o Mapa B operacional. O Mapa A mede separadamente a condução do gestor e o plano produzido, usando rubrica, casos de referência, baseline, correções e regressão. O Mapa B só começa após zero falha crítica e aprovação humana.

Motivo: integridade técnica comprova que o sistema grava e recupera corretamente, mas não comprova que a IA faz boas perguntas ou produz um plano útil. Gravar dados reais antes desse gate poderia validar o software e ainda assim preservar planejamento fraco.

Consequências: o plano unificado está em `plans/2026-07-16-qualidade-estrategica-operacional.md`. O piloto real com o owner e depois um gestor será refeito desde o início após o aceite estratégico. O hardening concluído permanece fechado e funciona como regressão técnica.

## 2026-07-16 - Autorização financeira explícita e orçamento de deploy

Decisão: qualquer compra, upgrade, assinatura, recarga ou nova cobrança exige autorização explícita do owner imediatamente antes da confirmação. Consumo autorizado de API não vale como autorização de compra. Deploy Netlify ocorre apenas quando o runtime web mudou; alterações documentais, testes, scripts e Edge Functions não justificam deploy do frontend.

Motivo: 67 deploys de produção consumiram 1.005 créditos do ciclo Netlify, pausando o site por limite. O owner autorizou uma compra única de 500 créditos por US$ 5, o app foi restaurado e a recarga automática permaneceu desligada. Para o plano integrado, o owner autorizou até US$ 10 acumulados em APIs de IA do Oráculo, com aviso em US$ 7 e parada preventiva em US$ 9.

Consequências: agentes devem informar custo antes da ação, nunca inferir autorização financeira e agrupar publicações. O saldo de serviços deve entrar no preflight operacional.
