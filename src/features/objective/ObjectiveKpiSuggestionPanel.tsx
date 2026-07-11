import { Link2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useAppState } from "../../state/store";
import type { ObjectiveKpiSuggestion } from "../../types";

interface ObjectiveKpiSuggestionPanelProps {
  objectiveId: string;
  onDone: () => void;
}

export function ObjectiveKpiSuggestionPanel({ objectiveId, onDone }: ObjectiveKpiSuggestionPanelProps) {
  const { state, dispatch } = useAppState();
  const started = useRef(false);
  const [suggestions, setSuggestions] = useState<ObjectiveKpiSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const existingLinks = useMemo(
    () => state.objectiveKpiLinks.filter((link) => link.objectiveId === objectiveId),
    [objectiveId, state.objectiveKpiLinks],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    dispatch({
      type: "suggest_objective_kpis",
      objectiveId,
      onSuccess: (items) => {
        const byId = new Map(items.map((item) => [item.kpiId, item]));
        for (const link of existingLinks) {
          const kpi = state.executiveKpis.find((item) => item.id === link.kpiId);
          if (kpi && !byId.has(kpi.id)) {
            byId.set(kpi.id, {
              kpiId: kpi.id,
              kpiKey: kpi.key,
              label: kpi.label,
              rationale: link.rationale || "Vínculo já confirmado anteriormente.",
              confidence: link.confidence,
            });
          }
        }
        const merged = [...byId.values()];
        setSuggestions(merged);
        setSelected(new Set(merged.map((item) => item.kpiId)));
        setLoading(false);
      },
      onError: (message) => {
        setError(message);
        setLoading(false);
      },
    });
  }, [dispatch, existingLinks, objectiveId, state.executiveKpis]);

  function save() {
    setSaving(true);
    setError("");
    dispatch({
      type: "set_objective_kpi_links",
      objectiveId,
      links: suggestions
        .filter((item) => selected.has(item.kpiId))
        .map((item) => ({ kpiId: item.kpiId, rationale: item.rationale, confidence: item.confidence })),
      onSuccess: onDone,
      onError: (message) => {
        setSaving(false);
        setError(message);
      },
    });
  }

  return (
    <section className="rounded-control border border-border bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Este objetivo impacta algum KPI?</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            A IA sugere relações possíveis. Você decide o que fica conectado.
          </p>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando o objetivo...
            </div>
          ) : suggestions.length ? (
            <div className="mt-4 space-y-2">
              {suggestions.map((suggestion) => (
                <label key={suggestion.kpiId} className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-white p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(suggestion.kpiId)}
                    onChange={(event) => setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(suggestion.kpiId);
                      else next.delete(suggestion.kpiId);
                      return next;
                    })}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{suggestion.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-text-secondary">{suggestion.rationale}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-secondary">Não apareceu uma relação forte com os KPIs atuais.</p>
          )}

          {error ? <p className="mt-3 text-sm text-status-danger">{error}</p> : null}
          {!loading ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="quiet" onClick={onDone}>Agora não</Button>
              {suggestions.length ? <Button icon={Link2} onClick={save} disabled={saving}>{saving ? "Salvando..." : "Confirmar vínculos"}</Button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
