import { AlertTriangle, FileSpreadsheet, Save, Wand2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { isKpiImageFile, KPI_IMPORT_ACCEPT, readKpiImage, readKpiSpreadsheet } from "../../lib/kpiSpreadsheet";
import { cashDeltas, formatKpiValue, KPI_MONTHS, ladderLabel, movingAverage3, orderedLadder } from "../../lib/kpi";
import { useAppState } from "../../state/store";
import type { ExecutiveKpi, KpiImportKind, KpiMonthlyValue, KpiSpreadsheetSuggestion } from "../../types";

interface KpiEditorDialogProps {
  onClose: () => void;
}

interface MonthDraft {
  targetValue: string;
  targetStage: string;
  actualValue: string;
  secondaryActual: string;
  note: string;
}

interface KpiDraft {
  annualTarget: string;
  openingBalance: string;
  months: MonthDraft[];
}

function numberToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseInputNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInputNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function suggestionYears(suggestion: KpiSpreadsheetSuggestion) {
  return [...new Set(suggestion.rows.map((row) => row.year))].sort((left, right) => left - right);
}

function buildDraft(kpi: ExecutiveKpi, values: KpiMonthlyValue[], year: number): KpiDraft {
  const months = KPI_MONTHS.map((_, index) => {
    const month = index + 1;
    const value = values.find((item) => item.kpiId === kpi.id && item.year === year && item.month === month);
    return {
      targetValue: numberToInput(value?.targetValue),
      targetStage: value?.targetStage ?? "",
      actualValue: numberToInput(value?.actualValue),
      secondaryActual: numberToInput(value?.secondaryActual),
      note: value?.note ?? "",
    };
  });

  return {
    annualTarget: numberToInput(kpi.annualTarget),
    openingBalance: numberToInput(kpi.openingBalance),
    months,
  };
}

function monthValuesFromDraft(kpi: ExecutiveKpi, draft: KpiDraft, year: number) {
  return draft.months.map((month, index) => ({
    id: `${kpi.id}-${year}-${index + 1}`,
    orgId: kpi.orgId,
    kpiId: kpi.id,
    year,
    month: index + 1,
    targetValue: parseInputNumber(month.targetValue),
    targetStage: month.targetStage || null,
    actualValue: parseInputNumber(month.actualValue),
    secondaryActual: parseInputNumber(month.secondaryActual),
    note: month.note.trim() || null,
    updatedBy: null,
    updatedAt: "",
  }));
}

export function KpiEditorDialog({ onClose }: KpiEditorDialogProps) {
  const { state, dispatch, suggestKpiSpreadsheet, applyKpiSpreadsheetSuggestion } = useAppState();
  const year = new Date().getFullYear();
  const orderedKpis = useMemo(() => [...state.executiveKpis].sort((left, right) => left.sortOrder - right.sortOrder), [state.executiveKpis]);
  const [activeKpiId, setActiveKpiId] = useState(orderedKpis[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, KpiDraft>>(() =>
    Object.fromEntries(orderedKpis.map((kpi) => [kpi.id, buildDraft(kpi, state.kpiValues, year)])),
  );
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applyingImport, setApplyingImport] = useState(false);
  const [spreadsheetSuggestion, setSpreadsheetSuggestion] = useState<KpiSpreadsheetSuggestion | null>(null);
  const [importSource, setImportSource] = useState<{ fileName: string; kind: KpiImportKind } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const activeKpi = orderedKpis.find((kpi) => kpi.id === activeKpiId) ?? orderedKpis[0] ?? null;
  const activeDraft = activeKpi ? drafts[activeKpi.id] : null;

  function updateDraft(kpiId: string, updater: (draft: KpiDraft) => KpiDraft) {
    setDrafts((current) => {
      const draft = current[kpiId];
      if (!draft) return current;
      return { ...current, [kpiId]: updater(draft) };
    });
  }

  function updateMonth(index: number, field: keyof MonthDraft, value: string) {
    if (!activeKpi) return;
    updateDraft(activeKpi.id, (draft) => ({
      ...draft,
      months: draft.months.map((month, monthIndex) => (monthIndex === index ? { ...month, [field]: value } : month)),
    }));
  }

  function distributeEqually() {
    if (!activeKpi || !activeDraft || activeKpi.key === "cash") return;
    const annual = parseInputNumber(activeDraft.annualTarget);
    if (annual === null) return;
    const monthlyTarget = activeKpi.unit === "percent" ? annual : annual / 12;
    updateDraft(activeKpi.id, (draft) => ({
      ...draft,
      months: draft.months.map((month) => ({ ...month, targetValue: formatInputNumber(monthlyTarget) })),
    }));
  }

  function saveActiveKpi() {
    if (!activeKpi || !activeDraft) return;
    setSaving(true);
    setMessage(null);

    dispatch({
      type: "upsert_kpi_definition",
      kpiId: activeKpi.id,
      annualTarget: activeKpi.key === "cash" ? activeKpi.annualTarget : parseInputNumber(activeDraft.annualTarget),
      openingBalance: activeKpi.key === "cash" ? parseInputNumber(activeDraft.openingBalance) : activeKpi.openingBalance,
      onError: (error) => {
        setSaving(false);
        setMessage(error);
      },
      onSuccess: () => {
        dispatch({
          type: "upsert_kpi_month",
          kpiId: activeKpi.id,
          year,
          values: activeDraft.months.map((month, index) => ({
            month: index + 1,
            targetValue: activeKpi.key === "cash" ? null : parseInputNumber(month.targetValue),
            targetStage: activeKpi.key === "cash" ? month.targetStage || null : null,
            actualValue: parseInputNumber(month.actualValue),
            secondaryActual: activeKpi.secondaryUnit ? parseInputNumber(month.secondaryActual) : null,
            note: month.note.trim() || null,
          })),
          onError: (error) => {
            setSaving(false);
            setMessage(error);
          },
          onSuccess: () => {
            setSaving(false);
            setMessage("Lançamentos salvos.");
          },
        });
      },
    });
  }

  function discardImportSuggestion() {
    setSpreadsheetSuggestion(null);
    setImportSource(null);
  }

  async function importKpiFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setMessage(null);
    discardImportSuggestion();

    try {
      const imported = isKpiImageFile(file)
        ? await readKpiImage(file)
        : await readKpiSpreadsheet(file);
      const image = "image" in imported;
      const suggestion = image
        ? await suggestKpiSpreadsheet({ kind: "image", fileName: imported.fileName, image: imported.image })
        : await suggestKpiSpreadsheet({ kind: "spreadsheet", fileName: imported.fileName, rawText: imported.rawText });
      if (!suggestion.rows.length) {
        setMessage(suggestion.warnings[0] ?? "Não encontrei lançamentos de Meta ou Atingido no arquivo.");
        return;
      }
      setSpreadsheetSuggestion({
        ...suggestion,
        warnings: !image && imported.truncated
          ? ["A planilha é grande; a leitura foi limitada às primeiras abas e linhas.", ...suggestion.warnings]
          : suggestion.warnings,
      });
      setImportSource({ fileName: imported.fileName, kind: image ? "image" : "spreadsheet" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar este arquivo.");
    } finally {
      setImporting(false);
    }
  }

  async function applySpreadsheetSuggestion() {
    if (!spreadsheetSuggestion || !importSource) return;
    setApplyingImport(true);
    setMessage(null);

    try {
      const importedCount = await applyKpiSpreadsheetSuggestion(spreadsheetSuggestion, importSource);
      if (spreadsheetSuggestion.rows.some((suggested) => suggested.year === year)) {
        setDrafts((current) => {
          const next = { ...current };
          for (const suggested of spreadsheetSuggestion.rows) {
            const kpi = orderedKpis.find((item) => item.key === suggested.kpiKey);
            const draft = kpi ? next[kpi.id] : null;
            if (!kpi || !draft || suggested.year !== year) continue;
            next[kpi.id] = {
              ...draft,
              months: draft.months.map((month, index) => index !== suggested.month - 1 ? month : {
                ...month,
                targetValue: suggested.targetValue === null ? month.targetValue : numberToInput(suggested.targetValue),
                targetStage: suggested.targetStage ?? month.targetStage,
                actualValue: suggested.actualValue === null ? month.actualValue : numberToInput(suggested.actualValue),
                secondaryActual: suggested.secondaryActual === null ? month.secondaryActual : numberToInput(suggested.secondaryActual),
                note: suggested.note ?? month.note,
              }),
            };
          }
          return next;
        });
      }
      const years = suggestionYears(spreadsheetSuggestion).join(", ");
      discardImportSuggestion();
      setMessage(`${importedCount} lançamentos de ${years} carregados e registrados em Documentos.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os lançamentos do arquivo.");
    } finally {
      setApplyingImport(false);
    }
  }

  if (!activeKpi || !activeDraft) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
        <Card className="w-full max-w-xl p-0">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Dashboard executivo</p>
              <h2 className="text-xl font-semibold text-text">Lançar KPIs</h2>
            </div>
            <Button variant="quiet" size="icon" icon={X} onClick={onClose} aria-label="Fechar" />
          </div>
          <div className="p-6 text-sm text-text-secondary">KPIs executivos ainda não carregados.</div>
        </Card>
      </div>
    );
  }

  const draftedMonthValues = monthValuesFromDraft(activeKpi, activeDraft, year);
  const cashMonthValues = activeKpi.key === "cash" ? draftedMonthValues : [];
  const cashMonthlyDeltas = activeKpi.key === "cash" ? cashDeltas(cashMonthValues, parseInputNumber(activeDraft.openingBalance)) : [];
  const cashMonthlyAverage = activeKpi.key === "cash" ? movingAverage3(cashMonthlyDeltas) : [];
  const ladder = orderedLadder(activeKpi.ladder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
      <Card className="max-h-[92vh] w-full max-w-5xl overflow-auto p-0">
        <div className="sticky top-0 z-20 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Dashboard executivo · {year}</p>
              <h2 className="text-xl font-semibold text-text">Lançar KPIs</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={spreadsheetInputRef}
                type="file"
                accept={KPI_IMPORT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const [file] = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void importKpiFile(file ?? null);
                }}
              />
              <Button variant="ghost" icon={FileSpreadsheet} onClick={() => spreadsheetInputRef.current?.click()} disabled={importing}>
                {importing ? "Lendo arquivo" : "Importar planilha ou imagem"}
              </Button>
              <Button variant="quiet" size="icon" icon={X} onClick={onClose} aria-label="Fechar" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {orderedKpis.map((kpi) => (
              <button
                key={kpi.id}
                type="button"
                onClick={() => {
                  setActiveKpiId(kpi.id);
                  setMessage(null);
                }}
                className={[
                  "h-9 rounded-[10px] border px-3 text-sm font-medium transition",
                  activeKpi.id === kpi.id ? "border-[#1D1D1F] bg-[#F7F7F8] text-text" : "border-border bg-white text-text-secondary hover:border-[#1D1D1F]/20",
                ].join(" ")}
              >
                {kpi.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-6">
          {spreadsheetSuggestion ? (
            <section className="border border-border bg-[#F7F7F8] p-4" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">
                    Prévia da importação · {suggestionYears(spreadsheetSuggestion).join(", ")}
                    {importSource?.kind === "image" ? " · Imagem" : " · Planilha"}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">{spreadsheetSuggestion.summary}</p>
                </div>
                <Button variant="quiet" size="icon" icon={X} onClick={discardImportSuggestion} aria-label="Descartar prévia" />
              </div>

              {spreadsheetSuggestion.warnings.length ? (
                <div className="mt-3 flex items-start gap-2 text-sm text-[#8A5A0A]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>{spreadsheetSuggestion.warnings.join(" ")}</div>
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto border border-border bg-white">
                <table className="min-w-[620px] w-full border-collapse text-left text-sm">
                  <thead className="bg-[#EEF1F4] text-xs uppercase tracking-[0.08em] text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Indicador</th>
                      <th className="px-3 py-2 font-semibold">Ano</th>
                      <th className="px-3 py-2 font-semibold">Mês</th>
                      <th className="px-3 py-2 font-semibold">Meta</th>
                      <th className="px-3 py-2 font-semibold">Atingido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spreadsheetSuggestion.rows.slice(0, 12).map((suggested) => {
                      const kpi = orderedKpis.find((item) => item.key === suggested.kpiKey);
                      const target = suggested.targetStage && kpi ? ladderLabel(kpi.ladder, suggested.targetStage) : kpi ? formatKpiValue(suggested.targetValue, kpi.unit, { compact: true }) : "—";
                      const actual = kpi ? formatKpiValue(suggested.actualValue, kpi.unit, { compact: true }) : "—";
                      return (
                        <tr key={`${suggested.year}-${suggested.kpiKey}-${suggested.month}`} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-text">{kpi?.label ?? suggested.kpiKey}</td>
                          <td className="px-3 py-2 text-text-secondary">{suggested.year}</td>
                          <td className="px-3 py-2 text-text-secondary">{KPI_MONTHS[suggested.month - 1]}</td>
                          <td className="px-3 py-2 text-text-secondary">{target ?? "—"}</td>
                          <td className="px-3 py-2 text-text-secondary">{actual}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {spreadsheetSuggestion.rows.length > 12 ? <p className="mt-2 text-xs text-text-tertiary">Mais {spreadsheetSuggestion.rows.length - 12} lançamentos serão aplicados.</p> : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={discardImportSuggestion} disabled={applyingImport}>Descartar</Button>
                <Button icon={FileSpreadsheet} onClick={applySpreadsheetSuggestion} disabled={applyingImport}>
                  {applyingImport ? "Carregando" : `Aplicar ${spreadsheetSuggestion.rows.length} lançamentos`}
                </Button>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            {activeKpi.key === "cash" ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Saldo inicial</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={activeDraft.openingBalance}
                  onChange={(event) => updateDraft(activeKpi.id, (draft) => ({ ...draft, openingBalance: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                />
              </label>
            ) : (
              <>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-text">Meta anual</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={activeDraft.annualTarget}
                    onChange={(event) => updateDraft(activeKpi.id, (draft) => ({ ...draft, annualTarget: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                  />
                </label>
                <div className="flex items-end">
                  <Button variant="ghost" icon={Wand2} onClick={distributeEqually} className="w-full">
                    Distribuir igualmente
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-[760px] w-full border-collapse bg-white text-left text-sm">
              <thead className="bg-[#F7F7F8] text-xs uppercase tracking-[0.08em] text-text-tertiary">
                <tr>
                  <th className="w-20 px-3 py-3 font-semibold">Mês</th>
                  {activeKpi.key === "cash" ? (
                    <>
                      <th className="px-3 py-3 font-semibold">Estágio-alvo</th>
                      <th className="px-3 py-3 font-semibold">Saldo fim do mês</th>
                      <th className="px-3 py-3 font-semibold">Geração</th>
                      <th className="px-3 py-3 font-semibold">MA3</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 font-semibold">Meta</th>
                      <th className="px-3 py-3 font-semibold">Atingido</th>
                      {activeKpi.secondaryUnit ? <th className="px-3 py-3 font-semibold">Qtd</th> : null}
                      <th className="px-3 py-3 font-semibold">%</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeDraft.months.map((month, index) => {
                  const target = parseInputNumber(month.targetValue);
                  const actual = parseInputNumber(month.actualValue);
                  const percent = target && actual !== null ? actual / target : null;
                  return (
                    <tr key={KPI_MONTHS[index]} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-text">{KPI_MONTHS[index]}</td>
                      {activeKpi.key === "cash" ? (
                        <>
                          <td className="px-3 py-2">
                            <select
                              value={month.targetStage}
                              onChange={(event) => updateMonth(index, "targetStage", event.target.value)}
                              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                            >
                              <option value="">A definir</option>
                              {ladder.map((stage) => (
                                <option key={stage.key} value={stage.key}>
                                  {stage.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={month.actualValue}
                              onChange={(event) => updateMonth(index, "actualValue", event.target.value)}
                              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                            />
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{formatKpiValue(cashMonthlyDeltas[index] ?? null, "currency", { compact: true })}</td>
                          <td className="px-3 py-2 text-text-secondary">{formatKpiValue(cashMonthlyAverage[index] ?? null, "currency", { compact: true })}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={month.targetValue}
                              onChange={(event) => updateMonth(index, "targetValue", event.target.value)}
                              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={month.actualValue}
                              onChange={(event) => updateMonth(index, "actualValue", event.target.value)}
                              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                            />
                          </td>
                          {activeKpi.secondaryUnit ? (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                value={month.secondaryActual}
                                onChange={(event) => updateMonth(index, "secondaryActual", event.target.value)}
                                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                              />
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-text-secondary">{percent === null ? "—" : `${Math.round(percent * 100)}%`}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {message ? <p className="text-sm font-medium text-text-secondary">{message}</p> : null}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Save} onClick={saveActiveKpi} disabled={saving}>
            {saving ? "Salvando" : "Salvar aba"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
