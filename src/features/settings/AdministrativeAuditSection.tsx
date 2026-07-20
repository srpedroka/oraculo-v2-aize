import { FileClock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { usePaginatedAdministrativeAudit } from "../../state/use-paginated-records";
import type { AdministrativeAuditCategory, AdministrativeAuditEvent } from "../../types";

const CATEGORY_OPTIONS: Array<{ value: AdministrativeAuditCategory | "all"; label: string }> = [
  { value: "all", label: "Tudo" },
  { value: "people", label: "Pessoas" },
  { value: "ai", label: "IA" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "security", label: "Segurança" },
  { value: "backup", label: "Backups" },
  { value: "data", label: "Dados" },
];

const ACTION_LABELS: Record<string, string> = {
  member_invited: "Pessoa convidada",
  member_added: "Pessoa adicionada",
  member_access_updated: "Acesso da pessoa atualizado",
  member_removed: "Pessoa removida",
  member_role_changed: "Papel alterado",
  member_area_changed: "Área principal alterada",
  ai_settings_updated: "Configuração de IA alterada",
  ai_function_updated: "Modelo por função alterado",
  ai_provider_key_updated: "Chave de IA atualizada",
  whatsapp_settings_updated: "Configuração do WhatsApp alterada",
  mfa_policy_updated: "Política de MFA alterada",
  ai_control_policy_updated: "Limites e orçamento de IA alterados",
  backup_created: "Backup criado",
  backup_downloaded: "Backup baixado",
  backup_deleted: "Backup removido",
  backup_policy_updated: "Política de backup alterada",
  organization_restored: "Empresa restaurada",
  retention_policy_baseline: "Política de retenção registrada",
  recovery_drill_completed: "Teste de recuperação concluído",
  recovery_drill_cleaned: "Ambiente do teste de recuperação removido",
  recovery_incident_opened: "Incidente de recuperação aberto",
  recovery_incident_resolved: "Incidente de recuperação resolvido",
  company_research: "Perfil da empresa pesquisado",
};

const FIELD_LABELS: Record<string, string> = {
  requireMfaForCriticalActions: "Segundo fator em ações críticas",
  require_mfa_for_critical_actions: "Segundo fator em ações críticas",
  role: "Papel",
  areaId: "Área",
  area_id: "Área",
  enabled: "Ativo",
  provider: "Provedor",
  model: "Modelo",
  scheduleHour: "Horário",
  schedule_hour: "Horário",
};

function humanizeIdentifier(value: string) {
  const known = FIELD_LABELS[value];
  if (known) return known;
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Alteração";
}

function formatAuditDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function valueLabel(value: unknown): string {
  if (value == null || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(valueLabel).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${humanizeIdentifier(key)}: ${valueLabel(nestedValue)}`)
      .join(" · ");
  }
  return String(value);
}

function Snapshot({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (!entries.length) return null;
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-semibold uppercase text-text-tertiary">{title}</p>
      <dl className="space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 text-sm">
            <dt className="break-words text-text-tertiary">{humanizeIdentifier(key)}</dt>
            <dd className="break-words text-text">{valueLabel(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AuditEventRow({ event }: { event: AdministrativeAuditEvent }) {
  return (
    <article className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{ACTION_LABELS[event.action] ?? humanizeIdentifier(event.action)}</p>
          <p className="mt-1 break-words text-sm text-text-secondary">
            {event.actorName} · {event.targetLabel || event.targetType}
          </p>
        </div>
        <time className="shrink-0 text-xs text-text-tertiary" dateTime={event.createdAt}>
          {formatAuditDate(event.createdAt)}
        </time>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-text-secondary hover:text-text">Ver alterações</summary>
        <div className="mt-3 grid gap-4 rounded-control bg-surface-muted p-4 sm:grid-cols-2">
          <Snapshot title="Antes" data={event.beforeData} />
          <Snapshot title="Depois" data={event.afterData} />
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-xs font-medium text-text-tertiary hover:text-text-secondary">Detalhes técnicos</summary>
            <p className="mt-2 break-all text-xs text-text-tertiary">Código da operação: {event.requestId}</p>
          </details>
        </div>
      </details>
    </article>
  );
}

export function AdministrativeAuditSection({ orgId }: { orgId: string }) {
  const [category, setCategory] = useState<AdministrativeAuditCategory | "all">("all");
  const query = usePaginatedAdministrativeAudit(orgId, category === "all" ? null : category, true);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileClock className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-text">Auditoria administrativa</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">Alterações críticas da empresa, sem chaves, segredos ou conteúdo de negócio.</p>
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => void query.refetch()} loading={query.isFetching}>Atualizar</Button>
      </div>

      <label className="block max-w-xs text-sm font-medium text-text-secondary">
        Categoria
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AdministrativeAuditCategory | "all")}
          className="mt-1 h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text outline-none focus:border-accent"
        >
          {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {query.isLoading ? <p className="text-sm text-text-secondary">Carregando auditoria...</p> : null}
      {query.isError ? <p className="text-sm text-status-danger">Não foi possível carregar a auditoria.</p> : null}
      {!query.isLoading && !query.items.length ? <p className="text-sm text-text-secondary">Nenhuma alteração administrativa nesta categoria.</p> : null}
      {query.items.length ? <div>{query.items.map((event) => <AuditEventRow key={event.id} event={event} />)}</div> : null}
      {query.hasNextPage ? (
        <Button variant="ghost" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>Carregar mais</Button>
      ) : null}
    </Card>
  );
}
