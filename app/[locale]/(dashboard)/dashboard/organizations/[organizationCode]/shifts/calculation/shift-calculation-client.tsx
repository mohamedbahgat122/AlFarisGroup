"use client";

import { useMemo, useState, useTransition } from "react";
import {
  calculateShiftMetrics,
  calculateShiftScenarios,
  durationMinutes,
  findPeriodWarnings,
  validateInputs,
  type CalculationResult,
  type CalculationSettings,
  type HighDemandRangeKey,
  type KeetaPeriodInput,
  type PrincipalShiftInput,
  type ScenarioResult,
} from "./shift-calculation-engine";

type Text = {
  calculationTitle: string;
  calculationIntro: string;
  basicData: string;
  totalDrivers: string;
  targetHours: string;
  maxResults: string;
  allowBelow: string;
  allowAbove: string;
  keetaPeriods: string;
  principalShifts: string;
  addPeriod: string;
  addShift: string;
  remove: string;
  up: string;
  down: string;
  enabled: string;
  name: string;
  start: string;
  end: string;
  min: string;
  max: string;
  duration: string;
  breaks: string;
  addBreak: string;
  elapsed: string;
  breakDuration: string;
  effective: string;
  coveredPeriods: string;
  calculate: string;
  calculating: string;
  cancel: string;
  reset: string;
  loadExample: string;
  sampleData: string;
  warnings: string;
  overlapWarning: string;
  duplicateWarning: string;
  validationTitle: string;
  validation: Record<string, string>;
  summary: string;
  enabledPeriods: string;
  enabledShifts: string;
  generatedScenarios: string;
  completePossible: string;
  bestScenario: string;
  bestScenarioShortage: string;
  bestScenarioExcess: string;
  recommendedBestScenario: string;
  recommendation: Record<string, string>;
  highDemandCoverage: string;
  highDemandAssigned: string;
  highDemandAssignedPercentage: string;
  highDemandRanges: Record<HighDemandRangeKey, string>;
  highDemandStatus: Record<string, string>;
  allEnabledShiftsAssigned: string;
  yes: string;
  no: string;
  scenarios: string;
  scenario: string;
  score: string;
  assignedDrivers: string;
  unusedDrivers: string;
  distribution: string;
  coverageTable: string;
  shortage: string;
  excess: string;
  status: string;
  metrics: string;
  minCoveragePercentage: string;
  utilizationPercentage: string;
  totalShortage: string;
  totalExcess: string;
  worstPeriod: string;
  noWorstPeriod: string;
  compare: string;
  selectForCompare: string;
  comparison: string;
  copyResult: string;
  copied: string;
  howCalculated: string;
  howText: readonly string[];
  noResults: string;
  noResultsHelp: string;
  targetWarning: string;
  reason: Record<string, string>;
  strategies: Record<string, string>;
  feasibility: Record<string, string>;
  periodStatus: Record<string, string>;
};

const initialPeriods: KeetaPeriodInput[] = [
  { id: "p-1", name: "الفترة الأولى", start: "08:00", end: "12:00", minDrivers: 6, maxDrivers: 10, enabled: true },
  { id: "p-2", name: "الفترة الثانية", start: "12:00", end: "16:00", minDrivers: 8, maxDrivers: 14, enabled: true },
  { id: "p-3", name: "الفترة الثالثة", start: "16:00", end: "20:00", minDrivers: 10, maxDrivers: 16, enabled: true },
  { id: "p-4", name: "الفترة الرابعة", start: "20:00", end: "00:00", minDrivers: 9, maxDrivers: 15, enabled: true },
  { id: "p-5", name: "الفترة الخامسة", start: "00:00", end: "03:00", minDrivers: 5, maxDrivers: 9, enabled: true },
];

const initialShifts: PrincipalShiftInput[] = [
  { id: "s-1", name: "الشيفت الأول", start: "08:00", end: "20:00", breaks: [], enabled: true },
  { id: "s-2", name: "الشيفت الثاني", start: "08:00", end: "00:00", breaks: [{ start: "16:00", end: "20:00" }], enabled: true },
  { id: "s-3", name: "الشيفت الثالث", start: "12:00", end: "00:00", breaks: [], enabled: true },
  { id: "s-4", name: "الشيفت الرابع", start: "12:00", end: "03:00", breaks: [{ start: "16:00", end: "20:00" }], enabled: true },
  { id: "s-5", name: "الشيفت الخامس", start: "16:00", end: "03:00", breaks: [], enabled: true },
  { id: "s-6", name: "الشيفت السادس", start: "20:00", end: "08:00", breaks: [], enabled: true },
];

export function ShiftCalculationClient({
  text,
  locale,
}: {
  text: Text;
  locale: string;
}) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [shifts, setShifts] = useState(initialShifts);
  const [settings, setSettings] = useState<CalculationSettings>({
    totalDrivers: 24,
    targetHours: 12,
    maxResults: 10,
    allowBelowMinimum: true,
    allowAboveMaximum: true,
  });
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const warnings = useMemo(() => findPeriodWarnings(periods), [periods]);
  const validationErrors = useMemo(
    () => validateInputs(periods, shifts, settings),
    [periods, settings, shifts],
  );
  const canCalculate = validationErrors.length === 0;
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  function updatePeriods(nextPeriods: KeetaPeriodInput[]) {
    setPeriods(nextPeriods);
    setResult(null);
    setSelected([]);
  }

  function updateShifts(nextShifts: PrincipalShiftInput[]) {
    setShifts(nextShifts);
    setResult(null);
    setSelected([]);
  }

  function updateSettings(patch: Partial<CalculationSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setResult(null);
    setSelected([]);
  }

  function calculate() {
    if (!canCalculate) return;
    startTransition(() => {
      const next = calculateShiftScenarios(periods, shifts, settings);
      setResult(next);
      setSelected([]);
    });
  }

  function reset() {
    setPeriods(initialPeriods);
    setShifts(initialShifts);
    setSettings({
      totalDrivers: 24,
      targetHours: 12,
      maxResults: 10,
      allowBelowMinimum: true,
      allowAboveMaximum: true,
    });
    setResult(null);
    setSelected([]);
  }

  function loadExample() {
    setPeriods([
      { id: "ex-1", name: "08-12", start: "08:00", end: "12:00", minDrivers: 5, maxDrivers: 8, enabled: true },
      { id: "ex-2", name: "12-16", start: "12:00", end: "16:00", minDrivers: 7, maxDrivers: 12, enabled: true },
      { id: "ex-3", name: "16-20", start: "16:00", end: "20:00", minDrivers: 9, maxDrivers: 14, enabled: true },
      { id: "ex-4", name: "20-00", start: "20:00", end: "00:00", minDrivers: 8, maxDrivers: 12, enabled: true },
      { id: "ex-5", name: "00-03", start: "00:00", end: "03:00", minDrivers: 4, maxDrivers: 8, enabled: true },
    ]);
    setSettings((current) => ({ ...current, totalDrivers: 22 }));
    setResult(null);
    setSelected([]);
  }

  const compared = result?.scenarios.filter((scenario) => selected.includes(scenario.id)) ?? [];

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">{text.calculationTitle}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{text.calculationIntro}</p>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-navy">{text.basicData}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadExample} className={secondaryButton}>{text.loadExample}</button>
              <button type="button" onClick={reset} className={secondaryButton}>{text.reset}</button>
            </div>
          </div>
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            {text.sampleData}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <NumberField label={text.totalDrivers} value={settings.totalDrivers} min={1} onChange={(value) => updateSettings({ totalDrivers: value })} />
            <NumberField label={text.targetHours} value={settings.targetHours} min={1} onChange={(value) => updateSettings({ targetHours: value })} />
            <NumberField label={text.maxResults} value={settings.maxResults} min={1} max={30} onChange={(value) => updateSettings({ maxResults: value })} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Toggle label={text.allowBelow} checked={settings.allowBelowMinimum} onChange={(checked) => updateSettings({ allowBelowMinimum: checked })} />
            <Toggle label={text.allowAbove} checked={settings.allowAboveMaximum} onChange={(checked) => updateSettings({ allowAboveMaximum: checked })} />
          </div>
          {validationErrors.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <p className="font-bold">{text.validationTitle}</p>
              <ul className="mt-2 list-inside list-disc">
                {validationErrors.map((error) => <li key={error}>{text.validation[error] ?? error}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 lg:col-start-1">
            <EditablePeriods text={text} periods={periods} setPeriods={updatePeriods} formatter={formatter} warnings={warnings} />
          </div>
          <div className="min-w-0 lg:col-start-2">
            <EditableShifts text={text} shifts={shifts} periods={periods} setShifts={updateShifts} formatter={formatter} targetHours={settings.targetHours} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canCalculate || isPending}
            onClick={calculate}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? text.calculating : text.calculate}
          </button>
          {isPending ? <button type="button" className={secondaryButton}>{text.cancel}</button> : null}
        </div>

        {result ? <Results text={text} result={result} shifts={shifts} periods={periods} settings={settings} formatter={formatter} selected={selected} setSelected={setSelected} /> : null}

        {compared.length > 0 ? (
          <Comparison text={text} scenarios={compared} shifts={shifts} periods={periods} formatter={formatter} copied={copied} onCopy={() => copyComparison(compared, shifts, periods, text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })} />
        ) : null}

        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-base font-bold text-navy">{text.howCalculated}</summary>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-muted">
            {text.howText.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      </div>
    </div>
  );
}

function EditablePeriods({
  text,
  periods,
  setPeriods,
  formatter,
  warnings,
}: {
  text: Text;
  periods: KeetaPeriodInput[];
  setPeriods: (periods: KeetaPeriodInput[]) => void;
  formatter: Intl.NumberFormat;
  warnings: { duplicateIds: string[]; overlappingIds: string[] };
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <SectionHeader title={text.keetaPeriods} action={text.addPeriod} onAction={() => setPeriods([...periods, { id: `p-${Date.now()}`, name: getNextPeriodName(periods), start: "08:00", end: "12:00", minDrivers: 0, maxDrivers: 0, enabled: true }])} />
      {(warnings.duplicateIds.length > 0 || warnings.overlappingIds.length > 0) ? (
        <div className="mb-3 space-y-2 text-sm font-semibold">
          {warnings.overlappingIds.length > 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{text.overlapWarning}</p> : null}
          {warnings.duplicateIds.length > 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{text.duplicateWarning}</p> : null}
        </div>
      ) : null}
      <div className="space-y-3">
        {periods.map((period, index) => (
          <div key={period.id} className="grid gap-4 rounded-lg border border-border bg-background p-3">
            <TextField label={text.name} value={period.name} onChange={(value) => updateItem(periods, setPeriods, index, { name: value })} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TimeField label={text.start} value={period.start} onChange={(value) => updateItem(periods, setPeriods, index, { start: value })} />
              <TimeField label={text.end} value={period.end} onChange={(value) => updateItem(periods, setPeriods, index, { end: value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField label={text.min} value={period.minDrivers} min={0} onChange={(value) => updateItem(periods, setPeriods, index, { minDrivers: value })} />
              <NumberField label={text.max} value={period.maxDrivers} min={0} onChange={(value) => updateItem(periods, setPeriods, index, { maxDrivers: value })} />
            </div>
            <p className="text-xs font-bold text-muted">{text.duration}: {formatHours(durationMinutes(period), formatter)}</p>
            <RowActions text={text} enabled={period.enabled} onToggle={(enabled) => updateItem(periods, setPeriods, index, { enabled })} onUp={() => moveItem(periods, setPeriods, index, -1)} onDown={() => moveItem(periods, setPeriods, index, 1)} onRemove={() => setPeriods(periods.filter((item) => item.id !== period.id))} />
          </div>
        ))}
      </div>
    </section>
  );
}

function EditableShifts({
  text,
  shifts,
  periods,
  setShifts,
  formatter,
  targetHours,
}: {
  text: Text;
  shifts: PrincipalShiftInput[];
  periods: KeetaPeriodInput[];
  setShifts: (shifts: PrincipalShiftInput[]) => void;
  formatter: Intl.NumberFormat;
  targetHours: number;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <SectionHeader title={text.principalShifts} action={text.addShift} onAction={() => setShifts([...shifts, { id: `s-${Date.now()}`, name: getNextShiftName(shifts), start: "08:00", end: "20:00", breaks: [], enabled: true }])} />
      <div className="space-y-3">
        {shifts.map((shift, index) => {
          const metrics = calculateShiftMetrics(shift, periods.filter((period) => period.enabled));
          const effectiveHours = metrics.effectiveMinutes / 60;
          return (
            <div key={shift.id} className="space-y-4 rounded-lg border border-border bg-background p-3">
              <TextField label={text.name} value={shift.name} onChange={(value) => updateItem(shifts, setShifts, index, { name: value })} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TimeField label={text.start} value={shift.start} onChange={(value) => updateItem(shifts, setShifts, index, { start: value })} />
                <TimeField label={text.end} value={shift.end} onChange={(value) => updateItem(shifts, setShifts, index, { end: value })} />
              </div>
              <RowActions text={text} enabled={shift.enabled} onToggle={(enabled) => updateItem(shifts, setShifts, index, { enabled })} onUp={() => moveItem(shifts, setShifts, index, -1)} onDown={() => moveItem(shifts, setShifts, index, 1)} onRemove={() => setShifts(shifts.filter((item) => item.id !== shift.id))} />
              <div className="flex flex-wrap gap-2 text-xs font-bold text-muted">
                <Badge>{text.elapsed}: {formatHours(metrics.elapsedMinutes, formatter)}</Badge>
                <Badge>{text.breakDuration}: {formatHours(metrics.breakMinutes, formatter)}</Badge>
                <Badge>{text.effective}: {formatHours(metrics.effectiveMinutes, formatter)}</Badge>
                <Badge>{text.coveredPeriods}: {formatter.format(metrics.coveredPeriodIds.length)}</Badge>
              </div>
              {Math.abs(effectiveHours - targetHours) > 0.01 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  {formatTemplate(text.targetWarning, {
                    actual: formatHours(metrics.effectiveMinutes, formatter),
                    target: formatter.format(targetHours),
                  })}
                </p>
              ) : null}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-navy">{text.breaks}</p>
                  <button type="button" className={secondaryButton} onClick={() => updateItem(shifts, setShifts, index, { breaks: [...shift.breaks, { start: "16:00", end: "20:00" }] })}>{text.addBreak}</button>
                </div>
                {shift.breaks.map((item, breakIndex) => (
                  <div key={`${shift.id}-break-${breakIndex}`} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <TimeField label={text.start} value={item.start} onChange={(value) => updateBreak(shifts, setShifts, index, breakIndex, { start: value })} />
                    <TimeField label={text.end} value={item.end} onChange={(value) => updateBreak(shifts, setShifts, index, breakIndex, { end: value })} />
                    <button type="button" className={`${compactButton} self-end`} onClick={() => updateItem(shifts, setShifts, index, { breaks: shift.breaks.filter((_, i) => i !== breakIndex) })}>{text.remove}</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Results({
  text,
  result,
  shifts,
  periods,
  settings,
  formatter,
  selected,
  setSelected,
}: {
  text: Text;
  result: CalculationResult;
  shifts: PrincipalShiftInput[];
  periods: KeetaPeriodInput[];
  settings: CalculationSettings;
  formatter: Intl.NumberFormat;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const recommended = result.scenarios.find((scenario) => scenario.isRecommended);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={text.totalDrivers} value={formatter.format(settings.totalDrivers)} />
        <Metric label={text.enabledPeriods} value={formatter.format(result.enabledPeriods.length)} />
        <Metric label={text.enabledShifts} value={formatter.format(result.enabledShifts.length)} />
        <Metric label={text.generatedScenarios} value={formatter.format(result.scenarios.length)} />
        <Metric label={text.completePossible} value={result.completeMinimumPossible ? text.yes : text.no} />
        <Metric label={text.bestScenario} value={recommended ? `${text.scenario} ${formatter.format(recommended.rank)}` : text.no} />
        <Metric label={text.bestScenarioShortage} value={formatter.format(recommended?.totalShortage ?? 0)} />
        <Metric label={text.bestScenarioExcess} value={formatter.format(recommended?.totalExcess ?? 0)} />
        <Metric label={text.highDemandCoverage} value={`${formatter.format(recommended?.highDemandAssignedPercentage ?? 0)}%`} />
      </div>
      {result.scenarios.length > 0 ? (
        <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
          {text.allEnabledShiftsAssigned}
        </p>
      ) : null}
      <h2 className="text-lg font-bold text-navy">{text.scenarios}</h2>
      {result.scenarios.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="font-bold text-navy">{text.noResults}</p>
          <p className="mt-2 text-sm text-muted">{text.noResultsHelp}</p>
        </div>
      ) : null}
      {result.scenarios.map((scenario, index) => (
        <details
          key={scenario.id}
          open={index === 0}
          className={`rounded-xl border p-4 ${
            scenario.isRecommended
              ? "border-primary/35 bg-primary-soft/40"
              : "border-border bg-surface"
          }`}
        >
          <summary className="cursor-pointer">
            <div className="inline-flex w-full flex-wrap items-center gap-2">
              <span className="text-base font-bold text-navy">{text.scenario} {formatter.format(scenario.rank)}</span>
              {scenario.isRecommended ? <StatusBadge tone="green">{text.recommendedBestScenario}</StatusBadge> : null}
              <StatusBadge tone={scenario.feasibility === "feasible" ? "green" : scenario.feasibility === "exceeds_maximum" ? "amber" : "red"}>{text.feasibility[scenario.feasibility]}</StatusBadge>
              <Badge>{text.strategies[scenario.strategy]}</Badge>
              <Badge>{text.score}: {formatter.format(scenario.score)}</Badge>
              <Badge>{text.assignedDrivers}: {formatter.format(scenario.totalAssigned)}</Badge>
              <Badge>{text.unusedDrivers}: {formatter.format(scenario.unusedDrivers)}</Badge>
            </div>
          </summary>
          <p className="mt-4 rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">
            {text.reason[scenario.reasonCode]}
          </p>
          {scenario.isRecommended && scenario.recommendationCode ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {text.recommendation[scenario.recommendationCode]}
            </p>
          ) : null}
          <label className="mt-4 flex items-center gap-2 text-sm font-bold text-navy">
            <input type="checkbox" checked={selected.includes(scenario.id)} onChange={(event) => {
              if (event.target.checked && selected.length < 3) setSelected([...selected, scenario.id]);
              if (!event.target.checked) setSelected(selected.filter((id) => id !== scenario.id));
            }} />
            {text.selectForCompare}
          </label>
          <ScenarioDetails text={text} scenario={scenario} shifts={shifts} periods={periods} formatter={formatter} />
        </details>
      ))}
    </section>
  );
}

function ScenarioDetails({ text, scenario, shifts, periods, formatter }: { text: Text; scenario: ScenarioResult; shifts: PrincipalShiftInput[]; periods: KeetaPeriodInput[]; formatter: Intl.NumberFormat }) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">{text.distribution}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {shifts.filter((shift) => shift.enabled).map((shift) => {
            const metrics = calculateShiftMetrics(shift, periods.filter((period) => period.enabled));
            return (
              <div key={shift.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                <div className="flex justify-between gap-3 font-bold text-navy"><span>{shift.name}</span><span>{formatter.format(scenario.assignments[shift.id] ?? 0)}</span></div>
                <p className="mt-1 text-xs text-muted">{shift.start} - {shift.end} | {text.effective}: {formatHours(metrics.effectiveMinutes, formatter)}</p>
                <p className="mt-1 text-xs text-muted">{text.breaks}: {shift.breaks.length ? shift.breaks.map((item) => `${item.start}-${item.end}`).join(", ") : "-"}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">{text.highDemandCoverage}</h3>
        <div className="grid gap-2 md:grid-cols-3">
          {scenario.highDemandMetrics.map((metric) => (
            <div key={metric.shiftId} className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-navy">{text.highDemandRanges[metric.rangeKey]}</p>
                <StatusBadge tone={metric.status === "strong" ? "green" : metric.status === "suitable" ? "amber" : "red"}>
                  {text.highDemandStatus[metric.status]}
                </StatusBadge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-muted">
                <Badge>{text.assignedDrivers}: {formatter.format(metric.assignedDrivers)}</Badge>
                <Badge>{text.effective}: {formatHours(metric.effectiveMinutes, formatter)}</Badge>
                <Badge>{text.coveredPeriods}: {formatter.format(metric.coveredPeriodIds.length)}</Badge>
                <Badge>{text.shortage}: {formatter.format(metric.shortageInCoveredPeriods)}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">{text.coverageTable}</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <Header>{text.keetaPeriods}</Header><Header>{text.min}</Header><Header>{text.max}</Header><Header>{text.coveredPeriods}</Header><Header>{text.shortage}</Header><Header>{text.excess}</Header><Header>{text.status}</Header>
              </tr>
            </thead>
            <tbody>
              {scenario.periodCoverage.map((coverage) => {
                const period = periods.find((item) => item.id === coverage.periodId);
                return (
                  <tr key={coverage.periodId} className="border-t border-border">
                    <Cell>{period?.name} ({period?.start}-{period?.end})</Cell>
                    <Cell>{formatter.format(coverage.minDrivers)}</Cell>
                    <Cell>{formatter.format(coverage.maxDrivers)}</Cell>
                    <Cell>{formatter.format(coverage.coverage)}</Cell>
                    <Cell>{formatter.format(coverage.shortage)}</Cell>
                    <Cell>{formatter.format(coverage.excess)}</Cell>
                    <Cell><StatusBadge tone={coverage.status === "shortage" ? "red" : coverage.status === "excess" ? "amber" : "green"}>{text.periodStatus[coverage.status]}</StatusBadge></Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <Metric label={text.minCoveragePercentage} value={`${formatter.format(scenario.minimumCoveragePercentage)}%`} />
        <Metric label={text.utilizationPercentage} value={`${formatter.format(scenario.utilizationPercentage)}%`} />
        <Metric label={text.totalShortage} value={formatter.format(scenario.totalShortage)} />
        <Metric label={text.totalExcess} value={formatter.format(scenario.totalExcess)} />
        <Metric label={text.worstPeriod} value={scenario.worstPeriodId ?? text.noWorstPeriod} />
      </div>
    </div>
  );
}

function Comparison({ text, scenarios, shifts, periods, formatter, copied, onCopy }: { text: Text; scenarios: ScenarioResult[]; shifts: PrincipalShiftInput[]; periods: KeetaPeriodInput[]; formatter: Intl.NumberFormat; copied: boolean; onCopy: () => void }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-navy">{text.comparison}</h2>
        <button type="button" className={secondaryButton} onClick={onCopy}>{copied ? text.copied : text.copyResult}</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {scenarios.map((scenario) => (
          <div key={scenario.id} className="rounded-lg border border-border bg-background p-3">
            <h3 className="font-bold text-navy">{text.scenario} {formatter.format(scenario.rank)}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Metric label={text.assignedDrivers} value={formatter.format(scenario.totalAssigned)} />
              <Metric label={text.unusedDrivers} value={formatter.format(scenario.unusedDrivers)} />
              <Metric label={text.shortage} value={formatter.format(scenario.totalShortage)} />
              <Metric label={text.excess} value={formatter.format(scenario.totalExcess)} />
              <Metric label={text.minCoveragePercentage} value={`${formatter.format(scenario.minimumCoveragePercentage)}%`} />
            </div>
            <ScenarioDetails text={text} scenario={scenario} shifts={shifts} periods={periods} formatter={formatter} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-navy">{title}</h2><button type="button" className={secondaryButton} onClick={onAction}>{action}</button></div>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (value: number) => void }) {
  return <label className="block min-w-0 text-sm font-bold text-navy"><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0 text-sm font-bold text-navy"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0 text-sm font-bold text-navy"><span>{label}</span><input type="time" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-4 text-sm font-bold text-navy"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4" />{label}</label>;
}

function RowActions({ text, enabled, onToggle, onUp, onDown, onRemove }: { text: Text; enabled: boolean; onToggle: (enabled: boolean) => void; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CompactToggle label={text.enabled} checked={enabled} onChange={onToggle} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={compactButton} onClick={onUp}>{text.up}</button>
        <button type="button" className={compactButton} onClick={onDown}>{text.down}</button>
        <button type="button" className={compactButton} onClick={onRemove}>{text.remove}</button>
      </div>
    </div>
  );
}

function CompactToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="inline-flex min-h-10 w-auto items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-bold text-navy"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4" />{label}</label>;
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start text-xs font-bold">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-navy">{children}</td>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs font-bold text-muted">{label}</p><p className="mt-1 text-lg font-black text-navy">{value}</p></div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted">{children}</span>;
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "red" }) {
  const classes = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

function updateItem<T>(items: T[], setItems: (items: T[]) => void, index: number, patch: Partial<T>) {
  setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
}

function updateBreak(items: PrincipalShiftInput[], setItems: (items: PrincipalShiftInput[]) => void, index: number, breakIndex: number, patch: Partial<{ start: string; end: string }>) {
  const shift = items[index];
  updateItem(items, setItems, index, { breaks: shift.breaks.map((item, itemIndex) => itemIndex === breakIndex ? { ...item, ...patch } : item) });
}

function moveItem<T>(items: T[], setItems: (items: T[]) => void, index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  setItems(next);
}

function getNextPeriodName(periods: KeetaPeriodInput[]) {
  return getArabicSequentialName({
    names: periods.map((period) => period.name),
    prefix: "الفترة",
    ordinals: feminineOrdinals,
  });
}

function getNextShiftName(shifts: PrincipalShiftInput[]) {
  return getArabicSequentialName({
    names: shifts.map((shift) => shift.name),
    prefix: "الشيفت",
    ordinals: masculineOrdinals,
  });
}

function getArabicSequentialName({
  names,
  prefix,
  ordinals,
}: {
  names: string[];
  prefix: string;
  ordinals: readonly string[];
}) {
  const highest = names.reduce(
    (max, name) => Math.max(max, getGeneratedNameNumber(name, prefix, ordinals)),
    0,
  );
  const next = highest + 1;

  return next <= ordinals.length ? `${prefix} ${ordinals[next - 1]}` : `${prefix} ${next}`;
}

function getGeneratedNameNumber(
  name: string,
  prefix: string,
  ordinals: readonly string[],
) {
  const normalizedName = name.trim();
  const ordinalIndex = ordinals.findIndex(
    (ordinal) => normalizedName === `${prefix} ${ordinal}`,
  );

  if (ordinalIndex >= 0) return ordinalIndex + 1;

  const numericMatch = normalizedName.match(new RegExp(`^${prefix} (\\d+)$`));

  return numericMatch ? Number(numericMatch[1]) : 0;
}

function formatHours(minutes: number, formatter: Intl.NumberFormat) {
  return formatter.format(Math.round((minutes / 60) * 10) / 10);
}

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

async function copyComparison(scenarios: ScenarioResult[], shifts: PrincipalShiftInput[], periods: KeetaPeriodInput[], text: Text) {
  const body = scenarios.map((scenario) => {
    const distribution = shifts.map((shift) => `${shift.name}: ${scenario.assignments[shift.id] ?? 0}`).join(", ");
    const coverage = scenario.periodCoverage.map((item) => {
      const period = periods.find((candidate) => candidate.id === item.periodId);
      return `${period?.name}: ${item.coverage}/${item.minDrivers}-${item.maxDrivers}`;
    }).join(", ");
    return `${text.scenario} ${scenario.rank} | ${text.assignedDrivers}: ${scenario.totalAssigned} | ${text.shortage}: ${scenario.totalShortage} | ${text.excess}: ${scenario.totalExcess}\n${distribution}\n${coverage}`;
  }).join("\n\n");
  await navigator.clipboard.writeText(body);
}

const inputClass = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary";
const compactButton = "inline-flex min-h-9 w-auto items-center justify-center rounded-lg border border-border bg-surface px-3 text-xs font-bold text-navy transition hover:bg-primary-soft";
const feminineOrdinals = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
  "التاسعة",
  "العاشرة",
] as const;
const masculineOrdinals = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
] as const;
