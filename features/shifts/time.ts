const DAY_MINUTES = 24 * 60;

export type ShiftTimeSummary = {
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  crossesMidnight: boolean;
};

export type ShiftTimeValidation =
  | ({ ok: true } & ShiftTimeSummary)
  | { ok: false; code: string };

type MinuteRange = {
  start: number;
  end: number;
};

export function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;

  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function validateShiftTimes({
  startTime,
  endTime,
  hasBreak,
  breakStartTime,
  breakEndTime,
}: {
  startTime: string;
  endTime: string;
  hasBreak: boolean;
  breakStartTime: string | null;
  breakEndTime: string | null;
}): ShiftTimeValidation {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null) {
    return { ok: false, code: "time_required" };
  }

  if (start === end) {
    return { ok: false, code: "zero_duration" };
  }

  const shift = normalizeRange(start, end);
  const totalMinutes = shift.end - shift.start;
  let breakMinutes = 0;

  if (hasBreak) {
    const breakStart = parseTimeToMinutes(breakStartTime);
    const breakEnd = parseTimeToMinutes(breakEndTime);

    if (breakStart === null || breakEnd === null) {
      return { ok: false, code: "break_required" };
    }

    if (breakStart === breakEnd) {
      return { ok: false, code: "break_zero_duration" };
    }

    const breakRange = normalizeRangeInsideShift(breakStart, breakEnd, shift);

    if (!rangeContains(shift, breakRange)) {
      return { ok: false, code: "break_outside_shift" };
    }

    breakMinutes = breakRange.end - breakRange.start;

    if (breakMinutes >= totalMinutes) {
      return { ok: false, code: "break_consumes_shift" };
    }
  }

  return {
    ok: true,
    totalMinutes,
    breakMinutes,
    effectiveMinutes: totalMinutes - breakMinutes,
    crossesMidnight: end < start,
  };
}

export function rangesOverlap(
  firstStartTime: string,
  firstEndTime: string,
  secondStartTime: string,
  secondEndTime: string,
) {
  const firstStart = parseTimeToMinutes(firstStartTime);
  const firstEnd = parseTimeToMinutes(firstEndTime);
  const secondStart = parseTimeToMinutes(secondStartTime);
  const secondEnd = parseTimeToMinutes(secondEndTime);

  if (
    firstStart === null ||
    firstEnd === null ||
    secondStart === null ||
    secondEnd === null ||
    firstStart === firstEnd ||
    secondStart === secondEnd
  ) {
    return false;
  }

  return expandRange(normalizeRange(firstStart, firstEnd)).some((first) =>
    expandRange(normalizeRange(secondStart, secondEnd)).some(
      (second) => first.start < second.end && second.start < first.end,
    ),
  );
}

function normalizeRange(start: number, end: number): MinuteRange {
  return {
    start,
    end: end > start ? end : end + DAY_MINUTES,
  };
}

function normalizeRangeInsideShift(
  start: number,
  end: number,
  shift: MinuteRange,
): MinuteRange {
  let range = normalizeRange(start, end);

  if (range.start < shift.start) {
    range = {
      start: range.start + DAY_MINUTES,
      end: range.end + DAY_MINUTES,
    };
  }

  return range;
}

function rangeContains(parent: MinuteRange, child: MinuteRange) {
  return child.start >= parent.start && child.end <= parent.end;
}

function expandRange(range: MinuteRange) {
  if (range.end <= DAY_MINUTES) {
    return [range];
  }

  return [
    { start: range.start, end: DAY_MINUTES },
    { start: 0, end: range.end - DAY_MINUTES },
  ];
}
