import { ArrowLeft, Database, FileText, LockKeyhole, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DATA_NOTICE_PROVIDERS,
  DATA_NOTICE_PUBLISHED_AT,
  DATA_NOTICE_SUMMARY,
  DATA_NOTICE_VERSION,
} from "../features/privacy/data-notice";

const sections = [
  {
    id: "dados",
    icon: Database,
    title: "Dados mantidos no Oráculo",
    paragraphs: [
      "O Supabase hospeda autenticação, perfis, celular, empresas, áreas, permissões, planos, objetivos, ações, evidências, check-ins, documentos gerados, conversas, configurações, uso de IA, auditoria e registros técnicos necessários para operar e proteger o serviço.",
      "Cada workspace é isolado por empresa. Membros acessam somente a organização e as áreas permitidas; owners administram pessoas, provedores e configurações da própria empresa.",
    ],
  },
  {
    id: "ia",
    icon: Sparkles,
    title: "Provedores de inteligência artificial",
    paragraphs: [
      `Somente o conteúdo necessário para a tarefa pode ser enviado ao provedor escolhido pelo owner: ${DATA_NOTICE_PROVIDERS.join(", ")}. Nem todos recebem dados ao mesmo tempo; o modelo configurado para planejamento, conversa diária ou tarefas de bastidores define o destino daquela chamada.`,
      "Chaves de API ficam no servidor e não são expostas ao navegador. Respostas, quantidade de tokens e custo estimado podem ser registrados para continuidade, controle e auditoria.",
    ],
  },
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: "WhatsApp, áudio e arquivos",
    paragraphs: [
      "Quando o WhatsApp está ativo, o número precisa estar vinculado ao perfil. Mensagens e respostas entram no histórico da empresa para preservar a conversa e permitir diagnóstico de entrega.",
      "Áudio e arquivos recebidos são baixados e interpretados em memória. O Oráculo não grava o arquivo ou áudio bruto, URLs temporárias nem chaves de mídia. A transcrição, o resumo necessário e uma proposta confirmável podem ser registrados e encaminhados ao provedor de IA selecionado.",
    ],
  },
  {
    id: "documentos",
    icon: FileText,
    title: "Documentos, histórico e pesquisa",
    paragraphs: [
      "Textos extraídos de PDF, DOCX, PPTX, TXT, Markdown, planilhas e imagens podem ser usados para classificar, importar ou orientar planos. O conteúdo importado só vira dado operacional depois das confirmações previstas pelo fluxo.",
      "Quando uma pesquisa sobre a empresa é solicitada, consultas e páginas públicas selecionadas podem ser processadas para montar contexto. A origem deve permanecer identificável e conteúdo externo é tratado como não confiável.",
    ],
  },
  {
    id: "retencao",
    icon: LockKeyhole,
    title: "Retenção, segurança e backups",
    paragraphs: [
      "Planos, objetivos, documentos, conversas, KPIs, históricos e auditorias críticas não entram na limpeza automática: permanecem como memória estratégica até arquivamento ou exclusão autorizada. Perfis sem empresa também não são apagados automaticamente.",
      "A limpeza técnica ocorre diariamente: filas concluídas saem após 24 horas e falhas encerradas após 7 dias; deduplicação e saúde ficam por 30 dias; erros e alertas resolvidos por 90 dias; lembretes por 180 dias; comandos concluídos por 1 ano; custos e limites de IA por 2 anos. Itens pendentes e alertas ainda abertos são preservados.",
      "Backups automáticos seguem a política configurada da empresa; backups manuais não expiram automaticamente. A réplica externa tem retenção própria e pode sobreviver à exclusão interna. O pacote portátil é criptografado no navegador e não inclui segredos, credenciais nem mídia bruta.",
    ],
  },
  {
    id: "direitos",
    icon: ShieldCheck,
    title: "Consulta, correção, exportação e exclusão",
    paragraphs: [
      "Para consultar ou corrigir dados do workspace, solicitar exportação ou tratar uma exclusão, procure o owner da organização pelo mesmo canal usado no convite ou na operação. O owner dispõe de controles de pessoas, arquivo, backup e ciclo de vida da empresa.",
      "Algumas solicitações exigem confirmar identidade, preservar auditoria legítima ou transferir a titularidade quando a pessoa for o último owner. A retirada de acesso não apaga automaticamente registros empresariais que precisam manter autoria e histórico.",
    ],
  },
] as const;

export function Privacy() {
  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <p className="text-sm font-bold text-[#1D2A31]">ORÁCULO</p>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao aplicativo
          </Link>
        </div>
      </header>

      <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-text-tertiary">Aviso operacional de dados</p>
          <h1 className="mt-2 text-3xl font-semibold text-text sm:text-4xl">Privacidade e uso de dados</h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">{DATA_NOTICE_SUMMARY}</p>
          <p className="mt-3 text-sm text-text-tertiary">
            Versão {DATA_NOTICE_VERSION} · publicada em {DATA_NOTICE_PUBLISHED_AT}
          </p>
        </div>

        <div className="mt-10 border-y border-border py-5">
          <p className="text-sm leading-6 text-text-secondary">
            Este aviso descreve o funcionamento atual do produto. A ciência registrada pelo owner identifica a versão lida pela empresa; ela não funciona como consentimento genérico para todo tratamento de dados.
          </p>
        </div>

        <div className="mt-10 space-y-10">
          {sections.map(({ id, icon: Icon, title, paragraphs }) => (
            <section key={id} id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-text-secondary" aria-hidden="true" />
                <h2 id={`${id}-title`} className="text-xl font-semibold text-text">{title}</h2>
              </div>
              <div className="mt-3 space-y-3 pl-8">
                {paragraphs.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-text-secondary">{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 border-t border-border pt-8" aria-labelledby="mudancas-title">
          <h2 id="mudancas-title" className="text-xl font-semibold text-text">Mudanças deste aviso</h2>
          <p className="mt-3 text-sm leading-7 text-text-secondary">
            Alterações relevantes recebem uma nova versão. O owner vê um aviso discreto e pode registrar ciência uma vez pela organização. Isso não bloqueia login, planejamento, Dashboard ou WhatsApp.
          </p>
        </section>
      </article>
    </main>
  );
}
