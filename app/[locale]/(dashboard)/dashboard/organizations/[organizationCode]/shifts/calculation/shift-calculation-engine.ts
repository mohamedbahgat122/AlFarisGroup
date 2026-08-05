export type TimeRange = {
  start: string;
  end: string;
};

export type NormalizedRange = {
  start: number;
  end: number;
};

export type KeetaPeriodInput = TimeRange & {
  id: string;
  name: string;
  minDrivers: number;
  maxDrivers: number;
  enabled: boolean;
};

export type PrincipalShiftInput = TimeRange & {
  id: string;
  name: string;
  breaks: TimeRange[];
  enabled: boolean;
};

export type CalculationSettings = {
  totalDrivers: number;
  targetHours: number;
  maxResults: number;
  allowBelowMinimum: boolean;
  allowAboveMaximum: boolean;
};

export type ShiftMetrics = {
  elapsedMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  coveredPeriodIds: string[];
};

export type CoverageMatrixRow = ShiftMetrics & {
  shiftId: string;
  coverage: Record<string, boolean>;
  partialCoverage: Record<string, boolean>;
};

export type PeriodCoverageResult = {
  periodId: string;
  coverage: number;
  minDrivers: number;
  maxDrivers: number;
  shortage: number;
  excess: number;
  status: "complete" | "shortage" | "excess" | "within";
};

export type HighDemandShiftMetric = {
  shiftId: string;
  rangeKey: HighDemandRangeKey;
  assignedDrivers: number;
  effectiveMinutes: number;
  coveredPeriodIds: string[];
  shortageInCoveredPeriods: number;
  status: "strong" | "suitable" | "weak" | "unused";
};

export type HighDemandRangeKey =
  | "midnight_to_noon"
  | "evening_to_morning"
  | "noon_to_midnight";

export type ScenarioScoreBreakdown = {
  minimumCoverageScore: number;
  totalShortagePenalty: number;
  worstPeriodShortagePenalty: number;
  aboveMaximumPenalty: number;
  unusedDriverPenalty: number;
  highDemandShiftCoverageScore: number;
  balanceScore: number;
};

export type ScenarioStrategy =
  | "minimum"
  | "balanced"
  | "highest_coverage"
  | "lowest_shortage"
  | "fewest_drivers";

export type ScenarioResult = {
  id: string;
  rank: number;
  strategy: ScenarioStrategy;
  assignments: Record<string, number>;
  totalAssigned: number;
  unusedDrivers: number;
  periodCoverage: PeriodCoverageResult[];
  totalShortage: number;
  totalExcess: number;
  periodsMeetingMinimum: number;
  periodsWithinMaximum: number;
  utilizationPercentage: number;
  minimumCoveragePercentage: number;
  score: number;
  scoreBreakdown: ScenarioScoreBreakdown;
  highDemandMetrics: HighDemandShiftMetric[];
  highDemandAssignedDrivers: number;
  highDemandAssignedPercentage: number;
  highDemandCoveredPeriodIds: string[];
  highDemandCoveredPeriodShortage: number;
  isRecommended: boolean;
  recommendationCode: "complete" | "shortage" | null;
  feasibility:
    | "feasible"
    | "feasible_with_shortage"
    | "exceeds_maximum"
    | "impossible";
  reasonCode:
    | "complete_low_staff"
    | "balanced"
    | "high_coverage"
    | "lowest_shortage"
    | "fewest_drivers"
    | "insufficient";
  worstPeriodId: string | null;
};

export type CalculationResult = {
  scenarios: ScenarioResult[];
  matrix: CoverageMatrixRow[];
  completeMinimumPossible: boolean;
  enabledPeriods: KeetaPeriodInput[];
  enabledShifts: PrincipalShiftInput[];
};

const MINUTES_PER_DAY = 1440;
const MAX_RESULTS_LIMIT = 30;
const MAX_LOCAL_SEARCH_STEPS = 900;
const HIGH_DEMAND_RANGES: Array<{
  key: HighDemandRangeKey;
  start: number;
  end: number;
}> = [
  { key: "midnight_to_noon", start: 0, end: 720 },
  { key: "evening_to_morning", start: 1200, end: 1920 },
  { key: "noon_to_midnight", start: 720, end: 1440 },
];

export function parseTime(value: string): number {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    throw new Error(`Invalid time: ${value}`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeRange(range: TimeRange, anchorStart = 0): NormalizedRange {
  const startBase = parseTime(range.start);
  const endBase = parseTime(range.end);
  const start = startBase < anchorStart % MINUTES_PER_DAY ? startBase + MINUTES_PER_DAY : startBase;
  const end = endBase <= start % MINUTES_PER_DAY ? endBase + MINUTES_PER_DAY : endBase;

  return { start, end };
}

export function durationMinutes(range: TimeRange): number {
  const normalized = normalizeRange(range);

  return normalized.end - normalized.start;
}

export function rangesIntersect(a: NormalizedRange, b: NormalizedRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function intersectionMinutes(a: NormalizedRange, b: NormalizedRange): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function fullyCovers(container: NormalizedRange, child: NormalizedRange): boolean {
  return container.start <= child.start && container.end >= child.end;
}

export function subtractBreaks(
  workingRange: NormalizedRange,
  breaks: TimeRange[],
): NormalizedRange[] {
  let segments = [workingRange];

  for (const breakRange of breaks) {
    const normalizedBreak = normalizeRange(breakRange, workingRange.start);
    const nextSegments: NormalizedRange[] = [];

    for (const segment of segments) {
      if (!rangesIntersect(segment, normalizedBreak)) {
        nextSegments.push(segment);
        continue;
      }

      if (normalizedBreak.start > segment.start) {
        nextSegments.push({ start: segment.start, end: normalizedBreak.start });
      }

      if (normalizedBreak.end < segment.end) {
        nextSegments.push({ start: normalizedBreak.end, end: segment.end });
      }
    }

    segments = nextSegments;
  }

  return segments.filter((segment) => segment.end > segment.start);
}

export function calculateShiftMetrics(
  shift: PrincipalShiftInput,
  periods: KeetaPeriodInput[],
): ShiftMetrics {
  const range = normalizeRange(shift);
  const workSegments = subtractBreaks(range, shift.breaks);
  const elapsedMinutes = range.end - range.start;
  const effectiveMinutes = workSegments.reduce(
    (total, segment) => total + segment.end - segment.start,
    0,
  );
  const coveredPeriodIds = periods
    .filter((period) => isPeriodFullyCoveredBySegments(period, workSegments))
    .map((period) => period.id);

  return {
    elapsedMinutes,
    breakMinutes: elapsedMinutes - effectiveMinutes,
    effectiveMinutes,
    coveredPeriodIds,
  };
}

export function generateCoverageMatrix(
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
): CoverageMatrixRow[] {
  const enabledPeriods = periods.filter((period) => period.enabled);

  return shifts
    .filter((shift) => shift.enabled)
    .map((shift) => {
      const range = normalizeRange(shift);
      const workSegments = subtractBreaks(range, shift.breaks);
      const metrics = calculateShiftMetrics(shift, enabledPeriods);
      const coverage: Record<string, boolean> = {};
      const partialCoverage: Record<string, boolean> = {};

      for (const period of enabledPeriods) {
        coverage[period.id] = isPeriodFullyCoveredBySegments(period, workSegments);
        partialCoverage[period.id] =
          !coverage[period.id] &&
          workSegments.some((segment) =>
            rangesIntersect(segment, normalizePeriodForShift(period, range)),
          );
      }

      return {
        shiftId: shift.id,
        ...metrics,
        coverage,
        partialCoverage,
      };
    });
}

export function getHighDemandRangeKey(
  shift: TimeRange,
): HighDemandRangeKey | null {
  const normalized = normalizeRange(shift);
  const match = HIGH_DEMAND_RANGES.find(
    (range) => normalized.start === range.start && normalized.end === range.end,
  );

  return match?.key ?? null;
}

export function validateInputs(
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  settings: CalculationSettings,
): string[] {
  const errors: string[] = [];
  const enabledShiftCount = shifts.filter((shift) => shift.enabled).length;

  if (!Number.isInteger(settings.totalDrivers) || settings.totalDrivers <= 0) {
    errors.push("total_drivers");
  }

  if (!Number.isFinite(settings.targetHours) || settings.targetHours <= 0) {
    errors.push("target_hours");
  }

  if (
    !Number.isInteger(settings.maxResults) ||
    settings.maxResults <= 0 ||
    settings.maxResults > MAX_RESULTS_LIMIT
  ) {
    errors.push("max_results");
  }

  if (enabledShiftCount === 0) {
    errors.push("enabled_shift_required");
  }

  if (settings.totalDrivers < enabledShiftCount) {
    errors.push("drivers_below_enabled_shifts");
  }

  for (const period of periods) {
    if (period.minDrivers < 0 || period.maxDrivers < 0) errors.push("negative_period");
    if (period.maxDrivers < period.minDrivers) errors.push("period_max_below_min");
    if (!period.start || !period.end) errors.push("period_time_required");
  }

  for (const shift of shifts) {
    if (!shift.start || !shift.end) errors.push("shift_time_required");
  }

  return [...new Set(errors)];
}

export function findPeriodWarnings(periods: KeetaPeriodInput[]): {
  duplicateIds: string[];
  overlappingIds: string[];
} {
  const enabled = periods.filter((period) => period.enabled);
  const duplicateIds = new Set<string>();
  const overlappingIds = new Set<string>();

  for (let i = 0; i < enabled.length; i += 1) {
    const a = enabled[i];
    const aRange = normalizeRange(a);

    for (let j = i + 1; j < enabled.length; j += 1) {
      const b = enabled[j];
      const bRange = alignRangeNear(normalizeRange(b), aRange);

      if (
        a.start === b.start &&
        a.end === b.end &&
        a.minDrivers === b.minDrivers &&
        a.maxDrivers === b.maxDrivers
      ) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
      }

      if (rangesIntersect(aRange, bRange)) {
        overlappingIds.add(a.id);
        overlappingIds.add(b.id);
      }
    }
  }

  return {
    duplicateIds: [...duplicateIds],
    overlappingIds: [...overlappingIds],
  };
}

export function calculateShiftScenarios(
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  settings: CalculationSettings,
): CalculationResult {
  const enabledPeriods = periods.filter((period) => period.enabled);
  const enabledShifts = shifts.filter((shift) => shift.enabled);
  const matrix = generateCoverageMatrix(enabledPeriods, enabledShifts);

  if (enabledPeriods.length === 0 || enabledShifts.length === 0) {
    return {
      scenarios: [],
      matrix,
      completeMinimumPossible: false,
      enabledPeriods,
      enabledShifts,
    };
  }

  const maxResults = Math.min(settings.maxResults, MAX_RESULTS_LIMIT);
  if (settings.totalDrivers < enabledShifts.length) {
    return {
      scenarios: [],
      matrix,
      completeMinimumPossible: false,
      enabledPeriods,
      enabledShifts,
    };
  }

  const seeds = buildSeeds(enabledPeriods, enabledShifts, matrix, settings);
  const candidates = new Map<string, ScenarioResult>();

  for (const [strategy, seed] of seeds) {
    const improved = improveDistribution(strategy, seed, enabledPeriods, enabledShifts, matrix, settings);
    for (const distribution of improved) {
      const scenario = evaluateScenario(strategy, distribution, enabledPeriods, enabledShifts, matrix, settings);

      if (!settings.allowBelowMinimum && scenario.totalShortage > 0) continue;
      if (!settings.allowAboveMaximum && scenario.totalExcess > 0) continue;
      if (!satisfiesMinimumShiftAllocation(distribution, enabledShifts)) continue;

      candidates.set(distributionKey(distribution, enabledShifts), scenario);
    }
  }

  const scenarios = [...candidates.values()]
    .sort((a, b) => compareScenarios(a, b, enabledShifts))
    .slice(0, maxResults)
    .map((scenario, index) => {
      const recommendationCode: ScenarioResult["recommendationCode"] =
        index === 0 ? scenario.totalShortage === 0 ? "complete" : "shortage" : null;

      return {
        ...scenario,
        id: `scenario-${index + 1}`,
        rank: index + 1,
        isRecommended: index === 0,
        recommendationCode,
      };
    });

  return {
    scenarios,
    matrix,
    completeMinimumPossible: scenarios.some((scenario) => scenario.totalShortage === 0),
    enabledPeriods,
    enabledShifts,
  };
}

function isPeriodFullyCoveredBySegments(
  period: KeetaPeriodInput,
  workSegments: NormalizedRange[],
) {
  if (workSegments.length === 0) return false;
  const periodRange = normalizePeriodForShift(period, {
    start: workSegments[0].start,
    end: workSegments[workSegments.length - 1].end,
  });

  return workSegments.some((segment) => fullyCovers(segment, periodRange));
}

function normalizePeriodForShift(
  period: TimeRange,
  shiftRange: NormalizedRange,
): NormalizedRange {
  const sameDay = normalizeRange(period);
  const nextDay = {
    start: sameDay.start + MINUTES_PER_DAY,
    end: sameDay.end + MINUTES_PER_DAY,
  };

  return intersectionMinutes(shiftRange, nextDay) > intersectionMinutes(shiftRange, sameDay)
    ? nextDay
    : sameDay;
}

function alignRangeNear(range: NormalizedRange, anchor: NormalizedRange) {
  const shifted = {
    start: range.start + MINUTES_PER_DAY,
    end: range.end + MINUTES_PER_DAY,
  };

  return intersectionMinutes(anchor, shifted) > intersectionMinutes(anchor, range)
    ? shifted
    : range;
}

function buildSeeds(
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  matrix: CoverageMatrixRow[],
  settings: CalculationSettings,
): Array<[ScenarioStrategy, Record<string, number>]> {
  const strategies: ScenarioStrategy[] = [
    "minimum",
    "balanced",
    "highest_coverage",
    "lowest_shortage",
    "fewest_drivers",
  ];

  return strategies.map((strategy) => [
    strategy,
    greedyDistribution(strategy, periods, shifts, matrix, settings),
  ]);
}

function greedyDistribution(
  strategy: ScenarioStrategy,
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  matrix: CoverageMatrixRow[],
  settings: CalculationSettings,
) {
  const assignments = createBaselineAssignments(shifts);
  const maxIterations = Math.min(
    Math.max(0, settings.totalDrivers - shifts.length),
    500,
  );

  for (let count = 0; count < maxIterations; count += 1) {
    const current = evaluateScenario(strategy, assignments, periods, shifts, matrix, settings);
    const needsMoreMinimum = current.totalShortage > 0;
    const shouldContinue =
      strategy === "highest_coverage"
        ? count < settings.totalDrivers && (settings.allowAboveMaximum || current.totalExcess === 0)
        : needsMoreMinimum;

    if (!shouldContinue) break;

    const bestShift = shifts
      .map((shift) => {
        const next = { ...assignments, [shift.id]: assignments[shift.id] + 1 };
        const scenario = evaluateScenario(strategy, next, periods, shifts, matrix, settings);
        return {
          shift,
          gain:
            (current.totalShortage - scenario.totalShortage) * 1000 -
            (scenario.totalExcess - current.totalExcess) * 80 +
            (scenario.periodsMeetingMinimum - current.periodsMeetingMinimum) * 200 +
            (strategy === "balanced" ? scenario.minimumCoveragePercentage : 0),
        };
      })
      .sort((a, b) => b.gain - a.gain)[0];

    if (!bestShift || bestShift.gain < -200) break;
    assignments[bestShift.shift.id] += 1;
  }

  return assignments;
}

function improveDistribution(
  strategy: ScenarioStrategy,
  seed: Record<string, number>,
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  matrix: CoverageMatrixRow[],
  settings: CalculationSettings,
) {
  const queue = [seed];
  const seen = new Set<string>();
  const best: Record<string, number>[] = [];
  let steps = 0;

  while (queue.length > 0 && steps < MAX_LOCAL_SEARCH_STEPS) {
    steps += 1;
    const current = queue.shift()!;
    const key = distributionKey(current, shifts);
    if (seen.has(key)) continue;
    seen.add(key);
    best.push(current);

    for (const shift of shifts) {
      const total = totalAssigned(current);
      if (total < settings.totalDrivers) {
        queue.push({ ...current, [shift.id]: current[shift.id] + 1 });
      }
      if (current[shift.id] > 1) {
        queue.push({ ...current, [shift.id]: current[shift.id] - 1 });
      }
    }

    queue
      .sort(
        (a, b) =>
          evaluateScenario(strategy, b, periods, shifts, matrix, settings).score -
          evaluateScenario(strategy, a, periods, shifts, matrix, settings).score,
      )
      .splice(80);
  }

  return best
    .sort(
      (a, b) =>
        evaluateScenario(strategy, b, periods, shifts, matrix, settings).score -
        evaluateScenario(strategy, a, periods, shifts, matrix, settings).score,
    )
    .slice(0, 8);
}

function evaluateScenario(
  strategy: ScenarioStrategy,
  assignments: Record<string, number>,
  periods: KeetaPeriodInput[],
  shifts: PrincipalShiftInput[],
  matrix: CoverageMatrixRow[],
  settings: CalculationSettings,
): ScenarioResult {
  const total = totalAssigned(assignments);
  const periodCoverage = periods.map((period) => {
    const coverage = shifts.reduce((sum, shift) => {
      const row = matrix.find((item) => item.shiftId === shift.id);
      return sum + (row?.coverage[period.id] ? assignments[shift.id] : 0);
    }, 0);
    const shortage = Math.max(0, period.minDrivers - coverage);
    const excess = Math.max(0, coverage - period.maxDrivers);
    const status =
      shortage > 0
        ? "shortage"
        : excess > 0
          ? "excess"
          : coverage === period.minDrivers
            ? "complete"
            : "within";

    return {
      periodId: period.id,
      coverage,
      minDrivers: period.minDrivers,
      maxDrivers: period.maxDrivers,
      shortage,
      excess,
      status,
    } satisfies PeriodCoverageResult;
  });
  const totalShortage = periodCoverage.reduce((sum, period) => sum + period.shortage, 0);
  const totalExcess = periodCoverage.reduce((sum, period) => sum + period.excess, 0);
  const periodsMeetingMinimum = periodCoverage.filter((period) => period.shortage === 0).length;
  const periodsWithinMaximum = periodCoverage.filter((period) => period.excess === 0).length;
  const minimumCoveragePercentage = periods.length
    ? Math.round((periodsMeetingMinimum / periods.length) * 100)
    : 0;
  const utilizationPercentage = settings.totalDrivers
    ? Math.round((total / settings.totalDrivers) * 100)
    : 0;
  const worst = [...periodCoverage].sort((a, b) => b.shortage - a.shortage)[0];
  const worstShortage = worst?.shortage ?? 0;
  const variance = coverageVariance(periodCoverage);
  const highDemandMetrics = calculateHighDemandMetrics(
    assignments,
    shifts,
    matrix,
    periodCoverage,
  );
  const highDemandAssignedDrivers = highDemandMetrics.reduce(
    (sum, metric) => sum + metric.assignedDrivers,
    0,
  );
  const highDemandAssignedPercentage = total
    ? Math.round((highDemandAssignedDrivers / total) * 100)
    : 0;
  const highDemandCoveredPeriodIds = [
    ...new Set(highDemandMetrics.flatMap((metric) => metric.coveredPeriodIds)),
  ];
  const highDemandCoveredPeriodShortage = highDemandCoveredPeriodIds.reduce(
    (sum, periodId) =>
      sum + (periodCoverage.find((period) => period.periodId === periodId)?.shortage ?? 0),
    0,
  );
  const highDemandShiftCoverageScore = highDemandMetrics.reduce((sum, metric) => {
    if (metric.assignedDrivers === 0) return sum;
    const coveredRequirement = metric.coveredPeriodIds.reduce(
      (coveredTotal, periodId) => {
        const period = periodCoverage.find((item) => item.periodId === periodId);
        if (!period) return coveredTotal;

        return coveredTotal + Math.min(metric.assignedDrivers, period.minDrivers);
      },
      0,
    );
    const shortagePenalty = metric.shortageInCoveredPeriods * 8;

    return sum + Math.max(0, coveredRequirement - shortagePenalty);
  }, 0);
  const feasibility =
    totalShortage > 0 && total >= settings.totalDrivers
      ? "impossible"
      : totalShortage > 0
        ? "feasible_with_shortage"
        : totalExcess > 0
          ? "exceeds_maximum"
          : "feasible";

  const scoreBreakdown: ScenarioScoreBreakdown = {
    minimumCoverageScore: periodsMeetingMinimum * 10_000,
    totalShortagePenalty: totalShortage * 1_000_000,
    worstPeriodShortagePenalty: worstShortage * 100_000,
    aboveMaximumPenalty: totalExcess * 1_000,
    unusedDriverPenalty: Math.max(0, settings.totalDrivers - total) * 80,
    highDemandShiftCoverageScore: highDemandShiftCoverageScore * 700,
    balanceScore: Math.round(Math.max(0, 100 - variance * 100) * 15),
  };
  const base =
    scoreBreakdown.minimumCoverageScore -
    scoreBreakdown.totalShortagePenalty -
    scoreBreakdown.worstPeriodShortagePenalty -
    scoreBreakdown.aboveMaximumPenalty -
    scoreBreakdown.unusedDriverPenalty +
    scoreBreakdown.highDemandShiftCoverageScore +
    scoreBreakdown.balanceScore -
    Math.max(0, total - settings.totalDrivers) * 1_000_000;
  const strategyScore = {
    minimum: base - total * 12 - totalExcess * 120,
    balanced: base - variance * 60 + utilizationPercentage * 3,
    highest_coverage: base + highDemandShiftCoverageScore * 8 + utilizationPercentage * 2,
    lowest_shortage: base - worstShortage * 250,
    fewest_drivers: base - total * 28 - totalShortage * 300,
  }[strategy];

  return {
    id: "",
    rank: 0,
    strategy,
    assignments,
    totalAssigned: total,
    unusedDrivers: Math.max(0, settings.totalDrivers - total),
    periodCoverage,
    totalShortage,
    totalExcess,
    periodsMeetingMinimum,
    periodsWithinMaximum,
    utilizationPercentage,
    minimumCoveragePercentage,
    score: Math.round(strategyScore),
    scoreBreakdown,
    highDemandMetrics,
    highDemandAssignedDrivers,
    highDemandAssignedPercentage,
    highDemandCoveredPeriodIds,
    highDemandCoveredPeriodShortage,
    isRecommended: false,
    recommendationCode: null,
    feasibility,
    reasonCode:
      totalShortage > 0
        ? "insufficient"
        : strategy === "minimum"
          ? "complete_low_staff"
          : strategy === "balanced"
            ? "balanced"
            : strategy === "highest_coverage"
              ? "high_coverage"
              : strategy === "lowest_shortage"
                ? "lowest_shortage"
                : "fewest_drivers",
    worstPeriodId: worstShortage ? worst.periodId : null,
  };
}

function createBaselineAssignments(shifts: PrincipalShiftInput[]) {
  return Object.fromEntries(shifts.map((shift) => [shift.id, 1]));
}

function satisfiesMinimumShiftAllocation(
  assignments: Record<string, number>,
  shifts: PrincipalShiftInput[],
) {
  return shifts.every((shift) => (assignments[shift.id] ?? 0) >= 1);
}

function calculateHighDemandMetrics(
  assignments: Record<string, number>,
  shifts: PrincipalShiftInput[],
  matrix: CoverageMatrixRow[],
  periodCoverage: PeriodCoverageResult[],
): HighDemandShiftMetric[] {
  return shifts.flatMap((shift) => {
    const rangeKey = getHighDemandRangeKey(shift);
    if (!rangeKey) return [];

    const row = matrix.find((item) => item.shiftId === shift.id);
    const assignedDrivers = assignments[shift.id] ?? 0;
    const coveredPeriodIds = row
      ? Object.entries(row.coverage)
          .filter(([, covered]) => covered)
          .map(([periodId]) => periodId)
      : [];
    const shortageInCoveredPeriods = coveredPeriodIds.reduce(
      (sum, periodId) =>
        sum + (periodCoverage.find((period) => period.periodId === periodId)?.shortage ?? 0),
      0,
    );
    const coveredPeriodCount = coveredPeriodIds.length;
    const status =
      assignedDrivers === 0
        ? "unused"
        : shortageInCoveredPeriods > 0 || coveredPeriodCount === 0
          ? "weak"
          : coveredPeriodCount >= 3 || assignedDrivers >= 3
            ? "strong"
            : "suitable";

    return [{
      shiftId: shift.id,
      rangeKey,
      assignedDrivers,
      effectiveMinutes: row?.effectiveMinutes ?? calculateShiftMetrics(shift, []).effectiveMinutes,
      coveredPeriodIds,
      shortageInCoveredPeriods,
      status,
    }];
  });
}

function compareScenarios(
  a: ScenarioResult,
  b: ScenarioResult,
  shifts: PrincipalShiftInput[],
) {
  const aWorst = getWorstShortage(a);
  const bWorst = getWorstShortage(b);

  return (
    a.totalShortage - b.totalShortage ||
    aWorst - bWorst ||
    b.periodsMeetingMinimum - a.periodsMeetingMinimum ||
    b.highDemandAssignedDrivers - a.highDemandAssignedDrivers ||
    b.scoreBreakdown.highDemandShiftCoverageScore -
      a.scoreBreakdown.highDemandShiftCoverageScore ||
    a.totalExcess - b.totalExcess ||
    b.score - a.score ||
    a.totalAssigned - b.totalAssigned ||
    a.unusedDrivers - b.unusedDrivers ||
    distributionKey(a.assignments, shifts).localeCompare(distributionKey(b.assignments, shifts))
  );
}

function getWorstShortage(scenario: ScenarioResult) {
  return Math.max(0, ...scenario.periodCoverage.map((period) => period.shortage));
}

function coverageVariance(periodCoverage: PeriodCoverageResult[]) {
  if (periodCoverage.length === 0) return 0;
  const ratios = periodCoverage.map((period) =>
    period.minDrivers === 0 ? 1 : period.coverage / period.minDrivers,
  );
  const average = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;

  return (
    ratios.reduce((sum, ratio) => sum + (ratio - average) ** 2, 0) /
    ratios.length
  );
}

function totalAssigned(assignments: Record<string, number>) {
  return Object.values(assignments).reduce((sum, value) => sum + value, 0);
}

function distributionKey(
  assignments: Record<string, number>,
  shifts: PrincipalShiftInput[],
) {
  return shifts.map((shift) => assignments[shift.id] ?? 0).join("|");
}
