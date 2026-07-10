import { UserMinus, X } from "lucide-react";
import { useState } from "react";
import type { Area, Membership } from "../../types";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

interface MemberRemovalDialogProps {
  membership: Membership;
  impactedAreas: Area[];
  replacements: Membership[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (areaReassignments: Record<string, string | null>) => void;
}

function memberName(membership: Membership) {
  return membership.profile?.fullName ?? membership.profile?.email ?? membership.userId;
}

export function MemberRemovalDialog({
  membership,
  impactedAreas,
  replacements,
  busy,
  error,
  onClose,
  onConfirm,
}: MemberRemovalDialogProps) {
  const [areaReassignments, setAreaReassignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(impactedAreas.map((area) => [area.id, null])),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
      <Card className="max-h-[92vh] w-full max-w-xl overflow-auto p-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">Acesso à empresa</p>
            <h2 id="remove-member-title" className="mt-1 text-lg font-semibold text-text">Remover {memberName(membership)}?</h2>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={onClose} disabled={busy} aria-label="Fechar" />
        </div>

        <div className="space-y-5 px-6 py-5">
          <p className="text-sm leading-6 text-text-secondary">
            A pessoa perderá o acesso a esta empresa. Perfil, conversas, planos e registros já produzidos serão preservados.
          </p>

          {impactedAreas.length ? (
            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-text">Reatribuir coordenação</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">Escolha um substituto para cada área ou deixe sem coordenador.</p>
              </div>
              {impactedAreas.map((area) => (
                <label key={area.id} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_220px] sm:items-center">
                  <span className="min-w-0 text-sm font-medium text-text">
                    {area.name}
                    {area.archivedAt ? <span className="ml-2 text-xs font-normal text-text-tertiary">Arquivada</span> : null}
                  </span>
                  <select
                    value={areaReassignments[area.id] ?? ""}
                    onChange={(event) => setAreaReassignments((current) => ({
                      ...current,
                      [area.id]: event.target.value || null,
                    }))}
                    className="h-10 min-w-0 rounded-control border border-border bg-white px-3 text-sm text-text"
                    disabled={busy}
                  >
                    <option value="">Sem coordenador</option>
                    {replacements.map((replacement) => (
                      <option key={replacement.id} value={replacement.id}>{memberName(replacement)}</option>
                    ))}
                  </select>
                </label>
              ))}
            </section>
          ) : null}

          {error ? <p className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="danger" icon={UserMinus} loading={busy} onClick={() => onConfirm(areaReassignments)}>
            Remover acesso
          </Button>
        </div>
      </Card>
    </div>
  );
}
