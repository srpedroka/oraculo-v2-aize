do $$
declare
  target_org uuid := '66fee6c9-df10-4f86-924c-103a25778d7d';
  area_com uuid := '10000000-0000-4000-8000-000000000001';
  area_prod uuid := '10000000-0000-4000-8000-000000000002';
  area_pc uuid := '10000000-0000-4000-8000-000000000003';
  area_inov uuid := '10000000-0000-4000-8000-000000000004';
  plan_2026 uuid := '20000000-0000-4000-8000-000000000001';
  e1 uuid := '30000000-0000-4000-8000-000000000001';
  e2 uuid := '30000000-0000-4000-8000-000000000002';
  e3 uuid := '30000000-0000-4000-8000-000000000003';
  e4 uuid := '30000000-0000-4000-8000-000000000004';
  e5 uuid := '30000000-0000-4000-8000-000000000005';
  a_com_1 uuid := '30000000-0000-4000-8000-000000000006';
  a_prod_1 uuid := '30000000-0000-4000-8000-000000000007';
  a_inov_1 uuid := '30000000-0000-4000-8000-000000000008';
  a_pc_1 uuid := '30000000-0000-4000-8000-000000000009';
  q_com_1 uuid := '30000000-0000-4000-8000-000000000010';
  q_com_2 uuid := '30000000-0000-4000-8000-000000000011';
  q_prod_1 uuid := '30000000-0000-4000-8000-000000000012';
  q_inov_1 uuid := '30000000-0000-4000-8000-000000000013';
  q_pc_1 uuid := '30000000-0000-4000-8000-000000000014';
  m_com_1 uuid := '30000000-0000-4000-8000-000000000015';
  m_inov_1 uuid := '30000000-0000-4000-8000-000000000016';
  m_pc_1 uuid := '30000000-0000-4000-8000-000000000017';
begin
  insert into public.organizations (id, name, subtitle)
  values (target_org, 'Gaam', 'Aize')
  on conflict (id) do update set
    name = excluded.name,
    subtitle = excluded.subtitle;

  insert into public.areas (id, org_id, name, coordinator_id)
  values
    (area_com, target_org, 'Comercial', null),
    (area_prod, target_org, 'Produção', null),
    (area_pc, target_org, 'Pessoas e Cultura', null),
    (area_inov, target_org, 'Inovação e Produtos', null)
  on conflict (id) do update set
    org_id = excluded.org_id,
    name = excluded.name;

  insert into public.strategic_plans (
    id,
    org_id,
    year,
    profile,
    drivers,
    swot,
    themes,
    rituals,
    executive_summary
  )
  values (
    plan_2026,
    target_org,
    2026,
    jsonb_build_object(
      'sector', 'Indústria de pias e cubas em granito e compósito',
      'size', 'Pequena/média',
      'region', 'Sudoeste do Paraná',
      'founded', '2009',
      'mainPain', 'Margem boa no presente, mas dependência operacional alta e linha de produtos pouco renovada'
    ),
    jsonb_build_object(
      'purpose', 'Levar soluções que prosperam pessoas e ambientes',
      'vision', 'Ser referência regional em produtos premium com operação autônoma até 2030',
      'values', jsonb_build_array('Servir', 'Evolução permanente', 'Qualidade', 'Responsabilidade', 'Inovação')
    ),
    jsonb_build_object(
      'strengths', jsonb_build_array('Parque produtivo capaz', 'Carteira de clientes fiel', 'Prazo de entrega competitivo'),
      'weaknesses', jsonb_build_array('Dependência de pessoas-chave', 'Processos pouco padronizados', 'Linha de produtos pouco renovada'),
      'opportunities', jsonb_build_array('Demanda por linha premium', 'Digitalização comercial', 'Expansão regional'),
      'threats', jsonb_build_array('Concorrência em preço', 'Risco de antidumping em insumos', 'Oscilação de custo de matéria-prima')
    ),
    array['Crescer com margem saudável', 'Formar líderes e reduzir dependência operacional', 'Inovar a linha de produtos'],
    array['Check-in semanal por área', 'Reunião mensal de gestão', 'Revisão trimestral do plano'],
    '2026 é o ano de crescer com margem e, ao mesmo tempo, plantar autonomia. A GAAM colhe bem no presente, mas precisa formar líderes, padronizar processos e renovar a linha de produtos para não chegar fraca ao próximo ciclo.'
  )
  on conflict (org_id, year) do update set
    profile = excluded.profile,
    drivers = excluded.drivers,
    swot = excluded.swot,
    themes = excluded.themes,
    rituals = excluded.rituals,
    executive_summary = excluded.executive_summary;

  select id
  into plan_2026
  from public.strategic_plans
  where org_id = target_org
    and year = 2026;

  insert into public.objectives (
    id,
    org_id,
    area_id,
    level,
    type,
    title,
    result,
    metric,
    target,
    current,
    trend,
    deadline,
    owner,
    evidence_plan,
    status,
    progress,
    deliverables,
    parent_id,
    period
  )
  values
    (e1, target_org, null, 'strategic', 'harvest', 'Faturamento mensal médio de R$ 1,75M', 'Manter faturamento mensal médio em R$ 1,75M ao longo de 2026', 'Faturamento mensal', 'R$ 1,75M', 'R$ 1,8M', 'up', '2026-12-31', 'Gui', 'Fechamento financeiro mensal', 'on_track', 100, '{}', null, '2026'),
    (e2, target_org, null, 'strategic', 'harvest', 'Margem operacional acima de 20%', 'Sustentar margem operacional acima de 20%', 'Margem operacional', '20%', '22%', 'flat', '2026-12-31', 'Gui', 'DRE mensal', 'on_track', 100, '{}', null, '2026'),
    (e3, target_org, null, 'strategic', 'seed', 'Lançar 2 produtos premium em 2026', 'Lançar 2 novos produtos premium até dezembro de 2026', 'Pipeline de novos produtos', '2 produtos', '2 em validação', null, '2026-12-20', 'Vander', 'Produtos homologados e em catálogo', 'at_risk', 45, '{}', null, '2026'),
    (e4, target_org, null, 'strategic', 'seed', 'Formar 4 líderes de área', 'Formar 4 coordenadores com autonomia de decisão até dezembro de 2026', 'Programa de formação de líderes', '4 líderes', 'em andamento', null, '2026-12-15', 'Andreia', 'Avaliações e marcos do programa concluídos', 'on_track', 40, '{}', null, '2026'),
    (e5, target_org, null, 'strategic', 'seed', 'Reduzir dependência de pessoas-chave', 'Mapear e padronizar os processos críticos hoje dependentes de uma única pessoa', 'Processos críticos padronizados', null, null, null, '2026-11-30', 'Gui', 'POPs publicados e validados', 'at_risk', 20, '{}', null, '2026')
  on conflict (id) do update set
    title = excluded.title,
    result = excluded.result,
    metric = excluded.metric,
    target = excluded.target,
    current = excluded.current,
    trend = excluded.trend,
    deadline = excluded.deadline,
    owner = excluded.owner,
    evidence_plan = excluded.evidence_plan,
    status = excluded.status,
    progress = excluded.progress,
    period = excluded.period;

  insert into public.objectives (
    id,
    org_id,
    area_id,
    level,
    type,
    title,
    result,
    metric,
    target,
    deadline,
    owner,
    evidence_plan,
    status,
    progress,
    deliverables,
    parent_id,
    period
  )
  values
    (a_com_1, target_org, area_com, 'area_annual', 'harvest', 'Crescer a receita comercial em 2026', 'Aumentar a receita comercial em 8% no ano', 'Receita comercial', '+8%', '2026-12-31', 'Marcelo', 'Relatório anual de vendas', 'on_track', 50, '{}', e1, '2026'),
    (a_prod_1, target_org, area_prod, 'area_annual', 'harvest', 'Reduzir perdas de produção no ano', 'Reduzir o refugo de granito de 9% para 6% até dezembro', 'Refugo de granito', '6%', '2026-12-31', 'Gilberto', 'Relatório anual de perdas', 'on_track', 55, '{}', e2, '2026'),
    (a_inov_1, target_org, area_inov, 'area_annual', 'seed', 'Entregar 2 produtos premium prontos para lançamento', 'Concluir a validação e homologação de 2 produtos premium em 2026', 'Produtos validados', '2 produtos', '2026-12-20', 'Vander', 'Laudos e homologações concluídos', 'at_risk', 35, '{}', e3, '2026'),
    (a_pc_1, target_org, area_pc, 'area_annual', 'seed', 'Conduzir o programa de formação de líderes', 'Formar os 4 coordenadores no programa de líderes até dezembro', 'Programa de líderes', '4 líderes', '2026-12-15', 'Andreia', 'Avaliações finais do programa', 'on_track', 40, '{}', e4, '2026')
  on conflict (id) do update set
    area_id = excluded.area_id,
    title = excluded.title,
    result = excluded.result,
    metric = excluded.metric,
    target = excluded.target,
    deadline = excluded.deadline,
    owner = excluded.owner,
    evidence_plan = excluded.evidence_plan,
    status = excluded.status,
    progress = excluded.progress,
    parent_id = excluded.parent_id,
    period = excluded.period;

  insert into public.objectives (
    id,
    org_id,
    area_id,
    level,
    type,
    title,
    result,
    deadline,
    owner,
    evidence_plan,
    status,
    progress,
    deliverables,
    parent_id,
    period
  )
  values
    (q_com_1, target_org, area_com, 'quarterly', 'harvest', 'Fechar 8 contratos de cubas premium no Q3', 'Fechar 8 contratos de cubas premium até 30/09', '2026-09-30', 'Marcelo', 'Contratos assinados registrados no CRM', 'on_track', 50, array['Lista de 20 leads qualificados', 'Proposta padrão de cubas premium'], a_com_1, 'Q3 2026'),
    (q_com_2, target_org, area_com, 'quarterly', 'harvest', 'Subir ticket médio em 12%', 'Aumentar o ticket médio comercial em 12% até 30/09', '2026-09-30', 'Marcelo', 'Relatório mensal de ticket médio', 'at_risk', 30, array['Tabela de upsell', 'Treino do time em mix premium'], a_com_1, 'Q3 2026'),
    (q_prod_1, target_org, area_prod, 'quarterly', 'harvest', 'Reduzir refugo de granito de 9% para 6%', 'Reduzir o refugo de granito de 9% para 6% até 30/09', '2026-09-30', 'Gilberto', 'Relatório semanal de perdas de produção', 'on_track', 55, array['Mapa de pontos de perda', 'Checklist de corte'], a_prod_1, 'Q3 2026'),
    (q_inov_1, target_org, area_inov, 'quarterly', 'seed', 'Validar 2 protótipos premium', 'Concluir a validação técnica de 2 protótipos de produto premium até 30/09', '2026-09-30', 'Vander', 'Laudos de teste aprovados', 'late', 35, array['Protótipo A em teste', 'Protótipo B em teste'], a_inov_1, 'Q3 2026'),
    (q_pc_1, target_org, area_pc, 'quarterly', 'seed', 'Concluir 60% do programa de líderes', 'Concluir 60% do programa de formação de líderes até 30/09', '2026-09-30', 'Andreia', 'Presença e avaliações dos módulos', 'on_track', 40, array['Módulos 1 a 3 entregues', 'Avaliação intermediária aplicada'], a_pc_1, 'Q3 2026')
  on conflict (id) do update set
    area_id = excluded.area_id,
    title = excluded.title,
    result = excluded.result,
    deadline = excluded.deadline,
    owner = excluded.owner,
    evidence_plan = excluded.evidence_plan,
    status = excluded.status,
    progress = excluded.progress,
    deliverables = excluded.deliverables,
    parent_id = excluded.parent_id,
    period = excluded.period;

  insert into public.objectives (
    id,
    org_id,
    area_id,
    level,
    type,
    title,
    result,
    deadline,
    owner,
    evidence_plan,
    status,
    progress,
    parent_id,
    period
  )
  values
    (m_com_1, target_org, area_com, 'monthly', 'harvest', 'Fechar 3 contratos premium em setembro', 'Fechar 3 contratos de cubas premium em setembro', '2026-09-30', 'Marcelo', '3 contratos assinados no CRM', 'on_track', 33, q_com_1, 'Set 2026'),
    (m_inov_1, target_org, area_inov, 'monthly', 'seed', 'Entregar laudo do protótipo A', 'Entregar o laudo técnico do protótipo A até 20/09', '2026-09-20', 'Vander', 'Laudo assinado pelo responsável técnico', 'late', 10, q_inov_1, 'Set 2026'),
    (m_pc_1, target_org, area_pc, 'monthly', 'seed', 'Concluir o módulo 3 do programa', 'Concluir o módulo 3 do programa de líderes em setembro', '2026-09-30', 'Andreia', 'Lista de presença do módulo 3', 'on_track', 50, q_pc_1, 'Set 2026')
  on conflict (id) do update set
    area_id = excluded.area_id,
    title = excluded.title,
    result = excluded.result,
    deadline = excluded.deadline,
    owner = excluded.owner,
    evidence_plan = excluded.evidence_plan,
    status = excluded.status,
    progress = excluded.progress,
    parent_id = excluded.parent_id,
    period = excluded.period;

  insert into public.area_plans (
    id,
    org_id,
    area_id,
    year,
    role,
    linked_strategic_objective_ids,
    diagnosis,
    main_annual_objective_id,
    learning_focus
  )
  values
    ('40000000-0000-4000-8000-000000000001', target_org, area_com, 2026, jsonb_build_object('mission', 'Gerar receita com margem, construindo uma máquina comercial que não depende do dono', 'contribution', jsonb_build_array('Sustenta o faturamento', 'Eleva o ticket médio', 'Abre a linha premium')), array[e1, e3], jsonb_build_object('strengths', jsonb_build_array('Carteira fiel', 'Boa relação com clientes antigos'), 'weaknesses', jsonb_build_array('Dependência do dono nas vendas grandes', 'CRM subutilizado')), a_com_1, jsonb_build_object('q1', jsonb_build_array(), 'q2', jsonb_build_array(), 'q3', jsonb_build_array('Uso pleno do CRM', 'Negociação de contratos premium'), 'q4', jsonb_build_array('Prospecção ativa'))),
    ('40000000-0000-4000-8000-000000000002', target_org, area_prod, 2026, jsonb_build_object('mission', 'Entregar com qualidade e no prazo, reduzindo perdas', 'contribution', jsonb_build_array('Protege a margem', 'Sustenta o prazo de entrega')), array[e2, e5], jsonb_build_object('strengths', jsonb_build_array('Parque produtivo capaz'), 'weaknesses', jsonb_build_array('Processos não padronizados', 'Refugo alto no granito')), a_prod_1, jsonb_build_object('q1', jsonb_build_array(), 'q2', jsonb_build_array(), 'q3', jsonb_build_array('Controle estatístico de processo'), 'q4', jsonb_build_array())),
    ('40000000-0000-4000-8000-000000000003', target_org, area_inov, 2026, jsonb_build_object('mission', 'Renovar a linha de produtos com itens premium', 'contribution', jsonb_build_array('Constrói o pipeline futuro')), array[e3], jsonb_build_object('strengths', jsonb_build_array('Capacidade técnica'), 'weaknesses', jsonb_build_array('Validação lenta', 'Time enxuto')), a_inov_1, jsonb_build_object('q1', jsonb_build_array(), 'q2', jsonb_build_array(), 'q3', jsonb_build_array('Ensaios de materiais', 'Gestão de cronograma de validação'), 'q4', jsonb_build_array())),
    ('40000000-0000-4000-8000-000000000004', target_org, area_pc, 2026, jsonb_build_object('mission', 'Formar líderes e reduzir a dependência de pessoas-chave', 'contribution', jsonb_build_array('Planta autonomia', 'Sustenta a sucessão')), array[e4, e5], jsonb_build_object('strengths', jsonb_build_array('Vínculo com o time'), 'weaknesses', jsonb_build_array('Pouca estrutura de treinamento')), a_pc_1, jsonb_build_object('q1', jsonb_build_array(), 'q2', jsonb_build_array(), 'q3', jsonb_build_array('Facilitação de aprendizagem', 'Avaliação de competências'), 'q4', jsonb_build_array()))
  on conflict (area_id, year) do update set
    role = excluded.role,
    linked_strategic_objective_ids = excluded.linked_strategic_objective_ids,
    diagnosis = excluded.diagnosis,
    main_annual_objective_id = excluded.main_annual_objective_id,
    learning_focus = excluded.learning_focus;

  insert into public.strategic_projects (
    id,
    org_id,
    plan_id,
    name,
    owner,
    deadline,
    status,
    linked_objective_id
  )
  values
    ('50000000-0000-4000-8000-000000000001', target_org, plan_2026, 'Lançamento da linha de cubas premium', 'Vander', '2026-12-20', 'at_risk', e3),
    ('50000000-0000-4000-8000-000000000002', target_org, plan_2026, 'Programa de formação de líderes Aize', 'Andreia', '2026-12-15', 'on_track', e4),
    ('50000000-0000-4000-8000-000000000003', target_org, plan_2026, 'Padronização dos processos críticos (POPs)', 'Gui', '2026-11-30', 'at_risk', e5)
  on conflict (id) do update set
    plan_id = excluded.plan_id,
    name = excluded.name,
    owner = excluded.owner,
    deadline = excluded.deadline,
    status = excluded.status,
    linked_objective_id = excluded.linked_objective_id;

  insert into public.key_actions (
    id,
    org_id,
    objective_id,
    description,
    completion_criterion,
    deadline,
    owner,
    status
  )
  values
    ('60000000-0000-4000-8000-000000000001', target_org, m_com_1, 'Mapear 10 leads quentes da carteira', 'Lista pronta', '2026-09-08', 'Marcelo', 'on_track'),
    ('60000000-0000-4000-8000-000000000002', target_org, m_com_1, 'Enviar proposta premium para os 10 leads', 'Todas registradas no CRM', '2026-09-18', 'Marcelo', 'on_track'),
    ('60000000-0000-4000-8000-000000000003', target_org, m_com_1, 'Fazer follow-up e fechar 3 contratos', 'Contratos assinados', '2026-09-30', 'Marcelo', 'on_track'),
    ('60000000-0000-4000-8000-000000000004', target_org, m_inov_1, 'Concluir os ensaios do protótipo A', 'Relatório de ensaio gerado', '2026-09-12', 'Vander', 'late'),
    ('60000000-0000-4000-8000-000000000005', target_org, m_inov_1, 'Revisar e assinar o laudo técnico', 'Laudo assinado', '2026-09-20', 'Vander', 'late'),
    ('60000000-0000-4000-8000-000000000006', target_org, m_pc_1, 'Aplicar o módulo 3 do programa', 'Lista de presença registrada', '2026-09-25', 'Andreia', 'on_track')
  on conflict (id) do update set
    objective_id = excluded.objective_id,
    description = excluded.description,
    completion_criterion = excluded.completion_criterion,
    deadline = excluded.deadline,
    owner = excluded.owner,
    status = excluded.status;

  insert into public.evidences (
    id,
    org_id,
    objective_id,
    text,
    created_at
  )
  values
    ('70000000-0000-4000-8000-000000000001', target_org, q_prod_1, 'Refugo da semana 38 fechou em 6,8%, queda de 2,2 pontos.', '2026-09-22 09:00:00-03'),
    ('70000000-0000-4000-8000-000000000002', target_org, q_com_1, '2 contratos premium assinados em agosto.', '2026-08-28 09:00:00-03')
  on conflict (id) do update set
    objective_id = excluded.objective_id,
    text = excluded.text,
    created_at = excluded.created_at;

  insert into public.chat_messages (
    id,
    org_id,
    area_id,
    author,
    text,
    channel
  )
  values (
    '80000000-0000-4000-8000-000000000001',
    target_org,
    null,
    'oracle',
    'Bom dia, Gui. O Resultado da GAAM no mês está dentro da meta, mas a Evolução de novos produtos precisa de atenção: a validação dos protótipos está atrasada. Qual evidência prova que isso avançou?',
    'web'
  )
  on conflict (id) do update set
    text = excluded.text;
end $$;
