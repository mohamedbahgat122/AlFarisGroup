import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateShiftMetrics,
  calculateShiftScenarios,
  durationMinutes,
  generateCoverageMatrix,
  getHighDemandRangeKey,
  subtractBreaks,
  validateInputs,
} from "./shift-calculation-engine.ts";

const periods = [
  { id: "p1", name: "08-12", start: "08:00", end: "12:00", minDrivers: 2, maxDrivers: 4, enabled: true },
  { id: "p2", name: "12-16", start: "12:00", end: "16:00", minDrivers: 2, maxDrivers: 4, enabled: true },
  { id: "p3", name: "16-20", start: "16:00", end: "20:00", minDrivers: 2, maxDrivers: 4, enabled: true },
  { id: "p4", name: "20-00", start: "20:00", end: "00:00", minDrivers: 2, maxDrivers: 4, enabled: true },
  { id: "p5", name: "00-03", start: "00:00", end: "03:00", minDrivers: 1, maxDrivers: 3, enabled: true },
];

const shifts = [
  { id: "s1", name: "08:00 - 20:00", start: "08:00", end: "20:00", breaks: [], enabled: true },
  { id: "s2", name: "08:00 - 00:00", start: "08:00", end: "00:00", breaks: [{ start: "16:00", end: "20:00" }], enabled: true },
  { id: "s3", name: "12:00 - 00:00", start: "12:00", end: "00:00", breaks: [], enabled: true },
  { id: "s4", name: "12:00 - 03:00", start: "12:00", end: "03:00", breaks: [{ start: "16:00", end: "20:00" }], enabled: true },
  { id: "s5", name: "16:00 - 03:00", start: "16:00", end: "03:00", breaks: [], enabled: true },
  { id: "s6", name: "20:00 - 08:00", start: "20:00", end: "08:00", breaks: [], enabled: true },
];

const settings = {
  totalDrivers: 8,
  targetHours: 12,
  maxResults: 5,
  allowBelowMinimum: true,
  allowAboveMaximum: true,
};

test("normalizes overnight periods and subtracts breaks", () => {
  assert.equal(durationMinutes({ start: "20:00", end: "08:00" }), 720);
  assert.deepEqual(
    subtractBreaks({ start: 480, end: 1440 }, [{ start: "16:00", end: "20:00" }]),
    [
      { start: 480, end: 960 },
      { start: 1200, end: 1440 },
    ],
  );
});

test("calculates effective hours for the required principal shift templates", () => {
  const effectiveHours = shifts.map((shift) => calculateShiftMetrics(shift, periods).effectiveMinutes / 60);

  assert.deepEqual(effectiveHours, [12, 12, 12, 11, 11, 12]);
});

test("builds coverage matrix without counting partial break coverage", () => {
  const matrix = generateCoverageMatrix(periods, shifts);
  const shiftWithBreak = matrix.find((row) => row.shiftId === "s2");

  assert.equal(shiftWithBreak?.coverage.p1, true);
  assert.equal(shiftWithBreak?.coverage.p2, true);
  assert.equal(shiftWithBreak?.coverage.p3, false);
  assert.equal(shiftWithBreak?.coverage.p4, true);
});

test("generates deterministic bounded scenarios with real shift ids", () => {
  const result = calculateShiftScenarios(periods, shifts, settings);

  assert.ok(result.scenarios.length > 0);
  assert.ok(result.scenarios.length <= settings.maxResults);
  assert.equal(result.enabledPeriods.length, periods.length);
  assert.equal(result.enabledShifts.length, shifts.length);
  assert.ok(Object.keys(result.scenarios[0].assignments).every((id) => shifts.some((shift) => shift.id === id)));
});

test("enabled shifts never receive zero drivers and totals stay within available drivers", () => {
  const result = calculateShiftScenarios(periods, shifts, settings);

  assert.ok(result.scenarios.length > 0);
  for (const scenario of result.scenarios) {
    assert.ok(shifts.every((shift) => scenario.assignments[shift.id] >= 1));
    assert.ok(scenario.totalAssigned <= settings.totalDrivers);
  }
});

test("disabled shifts are ignored and receive zero drivers in displayed assignments", () => {
  const localShifts = [
    { id: "enabled-a", name: "enabled", start: "08:00", end: "12:00", breaks: [], enabled: true },
    { id: "disabled-b", name: "disabled", start: "12:00", end: "16:00", breaks: [], enabled: false },
  ];
  const result = calculateShiftScenarios(periods.slice(0, 1), localShifts, {
    ...settings,
    totalDrivers: 1,
  });

  assert.equal(result.enabledShifts.length, 1);
  assert.equal(result.scenarios[0].assignments["enabled-a"], 1);
  assert.equal(result.scenarios[0].assignments["disabled-b"] ?? 0, 0);
});

test("three enabled shifts with three drivers allocates one driver to each", () => {
  const localShifts = shifts.slice(0, 3);
  const result = calculateShiftScenarios(periods, localShifts, {
    ...settings,
    totalDrivers: 3,
    maxResults: 5,
  });

  assert.ok(result.scenarios.length > 0);
  for (const scenario of result.scenarios) {
    assert.deepEqual(localShifts.map((shift) => scenario.assignments[shift.id]), [1, 1, 1]);
  }
});

test("fewer drivers than enabled shifts returns validation failure and no scenarios", () => {
  const localSettings = {
    ...settings,
    totalDrivers: 5,
  };

  assert.ok(validateInputs(periods, shifts, localSettings).includes("drivers_below_enabled_shifts"));
  assert.equal(calculateShiftScenarios(periods, shifts, localSettings).scenarios.length, 0);
});

test("recognizes the approved high-demand shift ranges by time, not name", () => {
  assert.equal(getHighDemandRangeKey({ start: "00:00", end: "12:00" }), "midnight_to_noon");
  assert.equal(getHighDemandRangeKey({ start: "20:00", end: "08:00" }), "evening_to_morning");
  assert.equal(getHighDemandRangeKey({ start: "12:00", end: "00:00" }), "noon_to_midnight");
  assert.equal(getHighDemandRangeKey({ start: "08:00", end: "20:00" }), null);
  assert.equal(getHighDemandRangeKey({ start: "20:00", end: "08:00", name: "custom edited name" }), "evening_to_morning");
});

test("ranks zero-shortage coverage above high-demand-heavy coverage with shortage", () => {
  const localPeriods = [
    { id: "early", name: "early", start: "00:00", end: "04:00", minDrivers: 2, maxDrivers: 4, enabled: true },
    { id: "late", name: "late", start: "16:00", end: "20:00", minDrivers: 2, maxDrivers: 4, enabled: true },
  ];
  const localShifts = [
    { id: "high", name: "edited high demand", start: "00:00", end: "12:00", breaks: [], enabled: true },
    { id: "regular", name: "regular", start: "16:00", end: "20:00", breaks: [], enabled: true },
  ];
  const result = calculateShiftScenarios(localPeriods, localShifts, {
    ...settings,
    totalDrivers: 4,
    maxResults: 8,
  });
  const recommended = result.scenarios[0];

  assert.equal(recommended.totalShortage, 0);
  assert.ok(recommended.assignments.high >= 1);
  assert.ok(recommended.assignments.regular >= 1);
  assert.ok(result.scenarios.some((scenario) => scenario.totalShortage > 0 && scenario.assignments.high > 0));
});

test("prefers stronger high-demand allocation between zero-shortage scenarios", () => {
  const localPeriods = [
    { id: "mid", name: "mid", start: "00:00", end: "04:00", minDrivers: 1, maxDrivers: 3, enabled: true },
  ];
  const localShifts = [
    { id: "regular", name: "regular", start: "00:00", end: "04:00", breaks: [], enabled: false },
    { id: "high", name: "renamed by user", start: "00:00", end: "12:00", breaks: [], enabled: true },
  ];
  const result = calculateShiftScenarios(localPeriods, localShifts, {
    ...settings,
    totalDrivers: 1,
    maxResults: 6,
  });

  assert.equal(result.scenarios[0].totalShortage, 0);
  assert.equal(result.scenarios[0].assignments.high, 1);
  assert.equal(result.scenarios[0].highDemandAssignedDrivers, 1);
});

test("marks exactly one first recommended scenario and remains deterministic", () => {
  const first = calculateShiftScenarios(periods, shifts, settings);
  const second = calculateShiftScenarios(periods, shifts, settings);

  assert.equal(first.scenarios.filter((scenario) => scenario.isRecommended).length, 1);
  assert.equal(first.scenarios[0].isRecommended, true);
  assert.deepEqual(first.scenarios, second.scenarios);
});

test("least-drivers strategy and recommended scenario satisfy the baseline constraint", () => {
  const result = calculateShiftScenarios(periods, shifts, {
    ...settings,
    totalDrivers: 6,
    maxResults: 10,
  });
  const leastDriversScenario = result.scenarios.find((scenario) => scenario.strategy === "fewest_drivers");

  assert.ok(leastDriversScenario);
  assert.ok(result.scenarios[0].isRecommended);
  for (const scenario of [result.scenarios[0], leastDriversScenario]) {
    assert.ok(shifts.every((shift) => scenario.assignments[shift.id] >= 1));
    assert.equal(scenario.totalAssigned, 6);
  }
});

test("disabling one shift releases its baseline driver", () => {
  const enabledResult = calculateShiftScenarios(periods.slice(0, 1), shifts.slice(0, 2), {
    ...settings,
    totalDrivers: 2,
  });
  const disabledResult = calculateShiftScenarios(periods.slice(0, 1), [
    shifts[0],
    { ...shifts[1], enabled: false },
  ], {
    ...settings,
    totalDrivers: 1,
  });

  assert.equal(enabledResult.scenarios[0].totalAssigned, 2);
  assert.equal(disabledResult.enabledShifts.length, 1);
  assert.equal(disabledResult.scenarios[0].totalAssigned, 1);
  assert.equal(disabledResult.scenarios[0].assignments[shifts[1].id] ?? 0, 0);
});

test("counts high-demand drivers once even when one shift covers multiple periods", () => {
  const localPeriods = [
    { id: "a", name: "a", start: "00:00", end: "04:00", minDrivers: 1, maxDrivers: 3, enabled: true },
    { id: "b", name: "b", start: "04:00", end: "08:00", minDrivers: 1, maxDrivers: 3, enabled: true },
    { id: "c", name: "c", start: "08:00", end: "12:00", minDrivers: 1, maxDrivers: 3, enabled: true },
  ];
  const localShifts = [
    { id: "high", name: "any name", start: "00:00", end: "12:00", breaks: [], enabled: true },
  ];
  const result = calculateShiftScenarios(localPeriods, localShifts, {
    ...settings,
    totalDrivers: 1,
    maxResults: 3,
  });
  const recommended = result.scenarios[0];

  assert.equal(recommended.totalAssigned, 1);
  assert.equal(recommended.highDemandAssignedDrivers, 1);
  assert.deepEqual(recommended.highDemandCoveredPeriodIds.sort(), ["a", "b", "c"]);
  assert.equal(recommended.highDemandMetrics[0].coveredPeriodIds.length, 3);
});
