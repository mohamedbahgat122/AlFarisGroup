import "server-only";

import * as XLSX from "xlsx";
import type {
  DriverReportImportErrorDetails,
  DriverReportImportErrorCode,
  DriverReportImportPayload,
  DriverReportImportRowPayload,
} from "@/features/driver-reports/types";

type ParseFailure = {
  success: false;
  code: DriverReportImportErrorCode;
  field?: "performanceFile" | "rankingFile";
  details?: DriverReportImportErrorDetails;
};

type ParseSuccess<T> = {
  success: true;
  data: T;
};

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

type ActiveDriver = {
  id: string;
  fullName: string;
  keetaDriverId: string | null;
};

type PerformanceRow = {
  reportDate: string;
  keetaDriverId: string;
  onShift: boolean;
  eligible: boolean | null;
  validOnlineSeconds: number;
  acceptedTasks: number;
  deliveredTasks: number;
  rejectedTasks: number;
  onTimeRate: number | null;
};

type RankingRow = {
  keetaDriverId: string;
  evaluation: string | null;
  cityRankingPercentage: number;
  evaluationTotalOrders: number;
};
type RankingField = keyof typeof rankingHeaders;

type PerformanceField = keyof typeof performanceHeaders;
type PerformanceColumnResolution = Partial<Record<PerformanceField, number>>;
type RequiredPerformanceColumnResolution = Required<
  Pick<
    PerformanceColumnResolution,
    | "reportDate"
    | "keetaDriverId"
    | "validOnlineDuration"
    | "acceptedTasks"
    | "deliveredTasks"
    | "rejectedTasks"
    | "onTimeRate"
  >
> &
  Pick<PerformanceColumnResolution, "onShift" | "eligible">;
type DerivedPerformanceField = "shiftTimeline";
type PerformanceSource = "separate_column" | "timeline";

type HeaderCell = {
  display: string;
  fullKey: string;
  leafKey: string;
  keys: string[];
};

type HeaderAliasRule = {
  full: string[];
  leaf: string[];
};

type HeaderLayoutCandidate = {
  sheetName: string;
  headerRows: number[];
  cells: HeaderCell[];
  dataRows: PerformanceDataRow[];
  missingFields: PerformanceField[];
  ambiguousFields: PerformanceField[];
  resolvedColumns: PerformanceColumnResolution;
  shiftTimelineColumn?: number;
  attendanceSource?: PerformanceSource;
  eligibilitySource?: PerformanceSource;
  score: number;
};
type PerformanceWorksheet = {
  header: string[];
  rows: PerformanceDataRow[];
  columns: PerformanceColumnResolution;
  shiftTimelineColumn?: number;
  attendanceSource?: PerformanceSource;
  eligibilitySource?: PerformanceSource;
  missingFields: PerformanceField[];
  ambiguousFields: PerformanceField[];
  sheetName: string;
  headerRows: number[];
  worksheet: XLSX.WorkSheet;
};
type PerformanceDataRow = {
  values: unknown[];
  rowIndex: number;
};
type DurationParseResult =
  | { ok: true; seconds: number }
  | {
      ok: false;
      reason:
        | "empty"
        | "invalid_format"
        | "negative"
        | "non_finite"
        | "unsupported_type";
      normalizedValue: string;
    };
type DurationParseContext = {
  workbookFileName: string;
  worksheetName: string;
  rowNumber: number;
  columnIndex: number;
  columnHeader: string;
  cell: XLSX.CellObject | undefined;
};
type ArabicDurationParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};
type ArabicDurationUnit = keyof ArabicDurationParts;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 10_000;
const HEADER_SCAN_ROWS = 20;
const MAX_DURATION_ERRORS = 10;

const performanceHeaders = {
  reportDate: "التاريخ",
  keetaDriverId: "معرّف السائق",
  onShift: "فترة الوردية_هل أنت في الوردية؟",
  eligible: "فترة الوردية_شريك التوصيل الصالح؟",
  validOnlineDuration: "فترة الوردية_courier_valid_online_duration",
  acceptedTasks: "أحجام المهام_المهام المقبولة",
  deliveredTasks: "أحجام المهام_المهام التي تم تسليمها",
  rejectedTasks: "أحجام المهام_المهام المرفوضة",
  onTimeRate:
    "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)",
} as const;

const rankingHeaders = {
  keetaDriverId: "معرّف سائق التوصيل",
  evaluation: "المستوى التقديري الحالي",
  cityRanking: "النسبة المئوية لتصنيف سائق التوصيل",
  evaluationTotalOrders: "حجم الطلبات",
} as const;

const rankingHeaderAliases: Record<RankingField, string[]> = {
  keetaDriverId: [
    rankingHeaders.keetaDriverId,
    "معرف سائق التوصيل",
    "معرّف السائق",
    "معرف السائق",
    "رقم السائق",
    "driver id",
    "courier id",
    "delivery driver id",
  ],
  evaluation: [
    rankingHeaders.evaluation,
    "التقييم",
    "تقييم السائق",
    "الدرجة",
    "score",
    "evaluation",
    "rating",
  ],
  cityRanking: [
    rankingHeaders.cityRanking,
    "الترتيب على المدينة",
    "النسبة المئوية لتصنيف سائق التوصيل",
    "ترتيب المدينة",
    "الترتيب داخل المدينة",
    "تصنيف السائق في المدينة",
    "city rank",
    "city ranking",
    "rank in city",
  ],
  evaluationTotalOrders: [
    rankingHeaders.evaluationTotalOrders,
    "إجمالي الطلبات",
    "مجموع الطلبات",
    "عدد الطلبات",
    "الطلبات المكتملة",
    "حجم الطلبات",
    "total orders",
    "order count",
    "completed orders",
  ],
};

const performanceFieldLabels: Record<PerformanceField, string> = {
  reportDate: "تاريخ التقرير",
  keetaDriverId: "معرّف السائق",
  onShift: "في الوردية",
  eligible: "شريك التوصيل الصالح",
  validOnlineDuration: "مدة الاتصال الصالحة",
  acceptedTasks: "المهام المقبولة",
  deliveredTasks: "المهام التي تم تسليمها",
  rejectedTasks: "المهام المرفوضة",
  onTimeRate: "نسبة الطلبات التي تم تسليمها في الوقت المحدد",
};

const derivedPerformanceFieldLabels: Record<DerivedPerformanceField, string> = {
  shiftTimeline: "فترة الوردية",
};

void derivedPerformanceFieldLabels;

const performanceHeaderAliases: Record<PerformanceField, string[]> = {
  reportDate: ["التاريخ", "تاريخ", "date", "report date"],
  keetaDriverId: [
    "معرّف السائق",
    "معرف السائق",
    "معرّف سائق التوصيل",
    "معرف سائق التوصيل",
    "courier id",
    "driver id",
    "delivery driver id",
  ],
  onShift: [
    "هل أنت في الوردية؟",
    "هل أنت في الوردية",
    "في الوردية",
    "on shift",
    "are you on shift",
    "فترة الوردية_هل أنت في الوردية؟",
    "فترة الوردية_هل أنت في الوردية",
  ],
  eligible: [
    "شريك التوصيل الصالح؟",
    "شريك التوصيل الصالح",
    "صالح",
    "valid delivery partner",
    "eligible delivery partner",
    "فترة الوردية_شريك التوصيل الصالح؟",
    "فترة الوردية_شريك التوصيل الصالح",
  ],
  validOnlineDuration: [
    "courier_valid_online_duration",
    "valid online duration",
    "مدة الاتصال الصالحة",
    "مدة العمل الصالحة",
    "الساعات المتصلة",
    "فترة الوردية_courier_valid_online_duration",
  ],
  acceptedTasks: [
    "المهام المقبولة",
    "عدد المهام المقبولة",
    "accepted tasks",
    "accepted orders",
    "أحجام المهام_المهام المقبولة",
    "أحجام المهام_عدد المهام المقبولة",
  ],
  deliveredTasks: [
    "المهام التي تم تسليمها",
    "المهام المسلمة",
    "الطلبات التي تم تسليمها",
    "الطلبات المسلمة",
    "delivered tasks",
    "delivered orders",
    "completed tasks",
    "أحجام المهام_المهام التي تم تسليمها",
    "أحجام المهام_المهام المسلمة",
    "أحجام المهام_الطلبات التي تم تسليمها",
    "أحجام المهام_الطلبات المسلمة",
  ],
  rejectedTasks: [
    "المهام المرفوضة",
    "الطلبات المرفوضة",
    "rejected tasks",
    "rejected orders",
    "أحجام المهام_المهام المرفوضة",
    "أحجام المهام_الطلبات المرفوضة",
  ],
  onTimeRate: [
    "نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)",
    "نسبة الطلبات التي تم تسليمها في الوقت المحدد",
    "نسبة التسليم في الموعد",
    "في الموعد",
    "on-time delivery rate",
    "on time rate",
    "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)",
    "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد",
    "تجربة التوصيل_نسبة التسليم في الموعد",
    "تجربة التوصيل_في الموعد",
  ],
};

const performanceTimelineAliases: Record<DerivedPerformanceField, string[]> = {
  shiftTimeline: [
    "فترة الوردية",
    "الوردية",
    "shift timeline",
    "shift",
    "shift period",
    "shift details",
    "shift status",
    "on/off shift",
  ],
};

void performanceHeaderAliases;
void performanceTimelineAliases;

const performanceHeaderRules: Record<PerformanceField, HeaderAliasRule> = {
  reportDate: {
    full: ["التاريخ"],
    leaf: ["التاريخ", "تاريخ", "date", "report date"],
  },
  keetaDriverId: {
    full: ["معرّف السائق", "معرف السائق"],
    leaf: ["معرّف السائق", "معرف السائق"],
  },
  onShift: {
    full: [
      "فترة الوردية_هل أنت في الوردية؟",
      "فترة الوردية_هل أنت في الوردية",
    ],
    leaf: ["هل أنت في الوردية؟", "هل أنت في الوردية"],
  },
  eligible: {
    full: [
      "فترة الوردية_شريك التوصيل الصالح؟",
      "فترة الوردية_شريك التوصيل الصالح",
    ],
    leaf: ["شريك التوصيل الصالح؟", "شريك التوصيل الصالح"],
  },
  validOnlineDuration: {
    full: ["فترة الوردية_courier_valid_online_duration"],
    leaf: ["courier_valid_online_duration"],
  },
  acceptedTasks: {
    full: ["أحجام المهام_المهام المقبولة"],
    leaf: ["المهام المقبولة"],
  },
  deliveredTasks: {
    full: ["أحجام المهام_المهام التي تم تسليمها"],
    leaf: ["المهام التي تم تسليمها"],
  },
  rejectedTasks: {
    full: ["أحجام المهام_المهام المرفوضة"],
    leaf: ["المهام المرفوضة"],
  },
  onTimeRate: {
    full: [
      "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)",
      "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد",
    ],
    leaf: [
      "نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)",
      "نسبة الطلبات التي تم تسليمها في الوقت المحدد",
    ],
  },
};

const performanceTimelineRule: HeaderAliasRule = {
  full: ["ملخص الاتصال", "فترة الوردية_ملخص الاتصال"],
  leaf: ["ملخص الاتصال", "فترة الوردية"],
};

const performanceFieldOrder = Object.keys(performanceHeaders) as PerformanceField[];

export async function parseKeetaReportFiles({
  performanceFile,
  rankingFile,
  activeDrivers,
}: {
  performanceFile: File;
  rankingFile: File;
  activeDrivers: ActiveDriver[];
}): Promise<ParseResult<DriverReportImportPayload>> {
  const performanceBuffer = await readAndValidateFile(
    performanceFile,
    "performanceFile",
  );
  if (!performanceBuffer.success) {
    return performanceBuffer;
  }

  const rankingBuffer = await readAndValidateFile(rankingFile, "rankingFile");
  if (!rankingBuffer.success) {
    return rankingBuffer;
  }

  if (
    performanceBuffer.data.length === rankingBuffer.data.length &&
    Buffer.compare(performanceBuffer.data, rankingBuffer.data) === 0
  ) {
    return {
      success: false,
      code: "same_file",
      field: "rankingFile",
    };
  }

  const performance = parsePerformanceWorkbook(
    performanceBuffer.data,
    performanceFile.name,
  );
  if (!performance.success) {
    return performance;
  }

  const ranking = parseRankingWorkbook(rankingBuffer.data);
  if (!ranking.success) {
    return ranking;
  }

  const driverIds = new Set(
    activeDrivers
      .map((driver) => driver.keetaDriverId)
      .filter((id): id is string => Boolean(id)),
  );

  const performanceByKeetaId = new Map(
    performance.data.rows.map((row) => [row.keetaDriverId, row]),
  );
  const rankingByKeetaId = new Map(
    ranking.data.rows.map((row) => [row.keetaDriverId, row]),
  );

  let presentDrivers = 0;
  let matchedRankingRows = 0;
  let driversMissingKeetaId = 0;

  const rows: DriverReportImportRowPayload[] = activeDrivers.map((driver) => {
    if (!driver.keetaDriverId) {
      driversMissingKeetaId += 1;
    }

    const performanceRow = driver.keetaDriverId
      ? performanceByKeetaId.get(driver.keetaDriverId)
      : undefined;
    const rankingRow = driver.keetaDriverId
      ? rankingByKeetaId.get(driver.keetaDriverId)
      : undefined;

    if (rankingRow) {
      matchedRankingRows += 1;
    }

    const attendanceStatus =
      performanceRow?.onShift === true ? "present" : "absent";

    if (attendanceStatus === "present") {
      presentDrivers += 1;
    }

    const acceptedTasks = performanceRow?.acceptedTasks ?? 0;
    const deliveredTasks = performanceRow?.deliveredTasks ?? 0;
    const rejectedTasks = performanceRow?.rejectedTasks ?? 0;

    const mergedRow: DriverReportImportRowPayload = {
      driver_id: driver.id,
      driver_full_name: driver.fullName,
      keeta_driver_id: driver.keetaDriverId,
      attendance_status: attendanceStatus,
      accepted_tasks: acceptedTasks,
      delivered_tasks: deliveredTasks,
      rejected_tasks: rejectedTasks,
      valid_online_seconds: performanceRow?.validOnlineSeconds ?? 0,
      delivery_rate:
        acceptedTasks > 0 ? Math.min(deliveredTasks / acceptedTasks, 1) : null,
      level: rankingRow?.evaluation ?? null,
      city_ranking: null,
      ranking_percentage: rankingRow?.cityRankingPercentage ?? null,
      mandatory_assignment_score: null,
      estimated_reward_amount: null,
      evaluation_on_time_rate: null,
      evaluation_completion_rate: null,
      not_early_delivery_confirmation_rate: null,
      evaluation_total_orders: rankingRow?.evaluationTotalOrders ?? null,
      on_time_rate: performanceRow?.onTimeRate ?? null,
      incomplete_orders: Math.max(acceptedTasks - deliveredTasks, 0),
      eligibility_status:
        performanceRow?.eligible === true
          ? "eligible"
          : performanceRow?.eligible === false
            ? "not_eligible"
            : null,
    };

    return mergedRow;
  });

  const unmatchedPerformanceIds = performance.data.rows
    .map((row) => row.keetaDriverId)
    .filter((keetaDriverId) => !driverIds.has(keetaDriverId));
  const unmatchedRankingIds = ranking.data.rows
    .map((row) => row.keetaDriverId)
    .filter((keetaDriverId) => !driverIds.has(keetaDriverId));

  return {
    success: true,
    data: {
      summary: {
        reportDate: performance.data.reportDate,
        registeredActiveDrivers: activeDrivers.length,
        presentDrivers,
        absentDrivers: activeDrivers.length - presentDrivers,
        matchedRankingRows,
        unmatchedPerformanceIds,
        unmatchedRankingIds,
        driversMissingKeetaId,
      },
      rows,
    },
  };
}

async function readAndValidateFile(
  file: File,
  field: "performanceFile" | "rankingFile",
): Promise<ParseResult<Buffer>> {
  if (file.size <= 0) {
    return {
      success: false,
      code:
        field === "performanceFile"
          ? "missing_performance_file"
          : "missing_ranking_file",
      field,
    };
  }

  if (file.size > MAX_FILE_BYTES || !file.name.toLowerCase().endsWith(".xlsx")) {
    return { success: false, code: "invalid_excel_file", field };
  }

  return {
    success: true,
    data: Buffer.from(await file.arrayBuffer()),
  };
}

function parsePerformanceWorkbook(buffer: Buffer, fileName: string) {
  const workbook = readWorkbook(buffer, "performanceFile");
  if (!workbook.success) {
    return workbook;
  }

  const worksheet = findPerformanceWorksheet(workbook.data);
  if (!worksheet) {
    return {
      success: false as const,
      code: "performance_worksheet_not_found" as const,
      field: "performanceFile" as const,
    };
  }

  if (worksheet.missingFields.length > 0 || worksheet.ambiguousFields.length > 0) {
    return {
      success: false as const,
      code: "missing_performance_headers" as const,
      field: "performanceFile" as const,
      details: {
        missingFields: worksheet.missingFields.map(formatMissingPerformanceField),
        ambiguousFields: worksheet.ambiguousFields.map(
          (field) => performanceFieldLabels[field],
        ),
      },
    };
  }
  const columns = worksheet.columns as RequiredPerformanceColumnResolution;

  const rows: PerformanceRow[] = [];
  const dates = new Set<string>();
  const seenKeetaIds = new Set<string>();
  const durationErrors: Array<{
    rowNumber: number;
    column: string;
    columnHeader: string;
    rawValue: string;
  }> = [];
  let additionalDurationErrorCount = 0;

  for (const dataRow of worksheet.rows) {
    const row = dataRow.values;
    const keetaDriverId = normalizeKeetaDriverId(row[columns.keetaDriverId]);
    if (!keetaDriverId) {
      continue;
    }

    if (seenKeetaIds.has(keetaDriverId)) {
      return {
        success: false as const,
        code: "duplicate_performance_keeta_id" as const,
        field: "performanceFile" as const,
      };
    }
    seenKeetaIds.add(keetaDriverId);

    const reportDate = parseReportDate(row[columns.reportDate]);
    if (!reportDate) {
      return {
        success: false as const,
        code: "invalid_report_date" as const,
        field: "performanceFile" as const,
      };
    }
    dates.add(reportDate);

    const durationCellReference = XLSX.utils.encode_cell({
      r: dataRow.rowIndex,
      c: columns.validOnlineDuration,
    });
    const durationContext: DurationParseContext = {
      workbookFileName: fileName,
      worksheetName: worksheet.sheetName,
      rowNumber: dataRow.rowIndex + 1,
      columnIndex: columns.validOnlineDuration,
      columnHeader:
        worksheet.header[columns.validOnlineDuration] ??
        performanceFieldLabels.validOnlineDuration,
      cell: worksheet.worksheet[durationCellReference],
    };
    const validOnlineDuration = parseExcelDurationToSeconds(
      row[columns.validOnlineDuration],
      durationContext,
    );
    if (!validOnlineDuration.ok) {
      logInvalidDurationDiagnostic(durationContext, validOnlineDuration);
      if (durationErrors.length < MAX_DURATION_ERRORS) {
        durationErrors.push({
          rowNumber: durationContext.rowNumber,
          column: XLSX.utils.encode_col(durationContext.columnIndex),
          columnHeader: durationContext.columnHeader,
          rawValue: serializeCellValue(
            durationContext.cell?.v ?? row[columns.validOnlineDuration],
          ),
        });
      } else {
        additionalDurationErrorCount += 1;
      }
      continue;
    }

    if (validOnlineDuration.seconds > 86_400) {
      const dailyDurationError = {
        ok: false as const,
        reason: "invalid_format" as const,
        normalizedValue: normalizeCell(row[columns.validOnlineDuration]),
      };
      logInvalidDurationDiagnostic(durationContext, dailyDurationError);
      if (durationErrors.length < MAX_DURATION_ERRORS) {
        durationErrors.push({
          rowNumber: durationContext.rowNumber,
          column: XLSX.utils.encode_col(durationContext.columnIndex),
          columnHeader: durationContext.columnHeader,
          rawValue: serializeCellValue(
            durationContext.cell?.v ?? row[columns.validOnlineDuration],
          ),
        });
      } else {
        additionalDurationErrorCount += 1;
      }
      continue;
    }

    const acceptedTasks = parseNonNegativeInteger(row[columns.acceptedTasks]);
    const deliveredTasks = parseNonNegativeInteger(row[columns.deliveredTasks]);
    const rejectedTasks = parseNonNegativeInteger(row[columns.rejectedTasks]);
    if (
      acceptedTasks === null ||
      deliveredTasks === null ||
      rejectedTasks === null
    ) {
      return {
        success: false as const,
        code: "invalid_counts" as const,
        field: "performanceFile" as const,
      };
    }

    const onTimeRate = parseNullableRatio(row[columns.onTimeRate]);
    if (onTimeRate === "invalid") {
      return {
        success: false as const,
        code: "invalid_ratio" as const,
        field: "performanceFile" as const,
      };
    }

    const timeline = worksheet.shiftTimelineColumn === undefined
      ? null
      : parseShiftTimeline(row[worksheet.shiftTimelineColumn]);
    const onShift =
      columns.onShift === undefined
        ? (timeline?.onShift ?? false)
        : parseBooleanYesNo(row[columns.onShift]) === true;
    const eligible =
      columns.eligible === undefined
        ? (timeline?.eligible ?? null)
        : parseBooleanYesNo(row[columns.eligible]);

    rows.push({
      reportDate,
      keetaDriverId,
      onShift,
      eligible,
      validOnlineSeconds: validOnlineDuration.seconds,
      acceptedTasks,
      deliveredTasks,
      rejectedTasks,
      onTimeRate,
    });
  }

  if (durationErrors.length > 0) {
    return {
      success: false as const,
      code: "invalid_duration" as const,
      field: "performanceFile" as const,
      details: {
        durationErrors,
        additionalDurationErrorCount,
      },
    };
  }

  if (dates.size === 0) {
    return {
      success: false as const,
      code: "invalid_report_date" as const,
      field: "performanceFile" as const,
    };
  }

  if (dates.size > 1) {
    return {
      success: false as const,
      code: "multiple_report_dates" as const,
      field: "performanceFile" as const,
    };
  }

  return {
    success: true as const,
    data: {
      reportDate: Array.from(dates)[0],
      rows,
    },
  };
}

function parseRankingWorkbook(buffer: Buffer): ParseResult<{ rows: RankingRow[] }> {
  const workbook = readWorkbook(buffer, "rankingFile");
  if (!workbook.success) {
    return workbook;
  }

  const worksheet = findRankingWorksheet(workbook.data);
  if (!worksheet) {
    return {
      success: false as const,
      code: "ranking_worksheet_not_found" as const,
      field: "rankingFile" as const,
    };
  }

  if (worksheet.missingFields.length > 0 || worksheet.ambiguousFields.length > 0) {
    return {
      success: false as const,
      code: "missing_ranking_headers" as const,
      field: "rankingFile" as const,
      details: {
        missingFields: worksheet.missingFields.map(formatRankingFieldLabel),
        ambiguousFields: worksheet.ambiguousFields.map(formatRankingFieldLabel),
      },
    };
  }
  const columns = worksheet.columns as Record<RankingField, number>;

  const rows: RankingRow[] = [];
  const seenKeetaIds = new Set<string>();

  for (const row of worksheet.rows) {
    const keetaDriverId = normalizeKeetaDriverId(row[columns.keetaDriverId]);
    if (!keetaDriverId) {
      continue;
    }

    if (seenKeetaIds.has(keetaDriverId)) {
      return {
        success: false as const,
        code: "duplicate_ranking_keeta_id" as const,
        field: "rankingFile" as const,
      };
    }
    seenKeetaIds.add(keetaDriverId);

    const evaluation = parseEvaluationValue(row[columns.evaluation]);
    const cityRankingPercentage = parseRankingPercentage(
      row[columns.cityRanking],
    );
    const evaluationTotalOrders = parseWholeNonNegativeInteger(
      row[columns.evaluationTotalOrders],
    );

    if (
      cityRankingPercentage === "invalid" ||
      evaluationTotalOrders === null
    ) {
      return {
        success: false as const,
        code:
          cityRankingPercentage === "invalid"
            ? "invalid_ratio"
            : "invalid_counts",
        field: "rankingFile" as const,
      };
    }

    rows.push({
      keetaDriverId,
      evaluation,
      cityRankingPercentage,
      evaluationTotalOrders,
    });
  }

  return {
    success: true as const,
    data: { rows },
  };
}

function formatMissingPerformanceField(field: PerformanceField) {
  if (field === "onShift") {
    return "مصدر الحضور: عمود مستقل أو فترة الوردية";
  }

  if (field === "eligible") {
    return "مصدر الأهلية: عمود مستقل أو فترة الوردية";
  }

  return performanceFieldLabels[field];
}

function readWorkbook(
  buffer: Buffer,
  field: "performanceFile" | "rankingFile",
): ParseResult<XLSX.WorkBook> {
  try {
    return {
      success: true,
      data: XLSX.read(buffer, {
        type: "buffer",
        cellDates: false,
        cellText: true,
        raw: false,
      }),
    };
  } catch {
    return { success: false, code: "invalid_excel_file", field };
  }
}

function findPerformanceWorksheet(workbook: XLSX.WorkBook): PerformanceWorksheet | null {
  const candidates: HeaderLayoutCandidate[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const actualRange = repairWorksheetRange(sheet);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
      ...(actualRange ? { range: actualRange } : {}),
    });
    const inspectedRows = rows.slice(0, HEADER_SCAN_ROWS);
    const anchorHeaderRowIndex = inspectedRows.findIndex((row) =>
      isPerformanceAnchorRow(row),
    );

    if (anchorHeaderRowIndex >= 0) {
      const anchorCandidate = scorePerformanceHeaderCandidate({
        sheetName,
        headerRows: [anchorHeaderRowIndex],
        cells: buildSingleRowHeaderCells(inspectedRows[anchorHeaderRowIndex]),
        rows,
      });
      candidates.push(anchorCandidate);
    } else {
      for (let index = 0; index < inspectedRows.length; index += 1) {
        const singleRowCandidate = scorePerformanceHeaderCandidate({
          sheetName,
          headerRows: [index],
          cells: buildSingleRowHeaderCells(inspectedRows[index]),
          rows,
        });
        candidates.push(singleRowCandidate);

        if (index + 1 < inspectedRows.length) {
          const twoRowCandidate = scorePerformanceHeaderCandidate({
            sheetName,
            headerRows: [index, index + 1],
            cells: buildTwoRowHeaderCells(
              inspectedRows[index],
              inspectedRows[index + 1],
              sheet["!merges"] ?? [],
              index,
            ),
            rows,
          });
          candidates.push(twoRowCandidate);
        }
      }
    }
  }

  const selected = candidates
    .filter(
      (candidate) =>
        candidate.missingFields.length === 0 &&
        candidate.ambiguousFields.length === 0 &&
        candidate.dataRows.length <= MAX_ROWS,
    )
    .sort(compareHeaderCandidates)[0];

  if (selected) {
    return {
      header: selected.cells.map((cell) => cell.display),
      rows: selected.dataRows,
      columns: selected.resolvedColumns,
      shiftTimelineColumn: selected.shiftTimelineColumn,
      attendanceSource: selected.attendanceSource,
      eligibilitySource: selected.eligibilitySource,
      missingFields: [],
      ambiguousFields: [],
      sheetName: selected.sheetName,
      headerRows: selected.headerRows,
      worksheet: workbook.Sheets[selected.sheetName],
    };
  }

  const best = candidates.sort(compareHeaderCandidates)[0] ?? null;

  if (!best) {
    return null;
  }

  return {
    header: best.cells.map((cell) => cell.display),
    rows: best.dataRows,
    columns: best.resolvedColumns,
    shiftTimelineColumn: best.shiftTimelineColumn,
    attendanceSource: best.attendanceSource,
    eligibilitySource: best.eligibilitySource,
    missingFields: best.missingFields,
    ambiguousFields: best.ambiguousFields,
    sheetName: best.sheetName,
    headerRows: best.headerRows,
    worksheet: workbook.Sheets[best.sheetName],
  };
}

function scorePerformanceHeaderCandidate({
  sheetName,
  headerRows,
  cells,
  rows,
}: {
  sheetName: string;
  headerRows: number[];
  cells: HeaderCell[];
  rows: unknown[][];
}): HeaderLayoutCandidate {
  const resolvedColumns: PerformanceColumnResolution = {};
  const missingFields: PerformanceField[] = [];
  const ambiguousFields: PerformanceField[] = [];
  const shiftTimelineMatches = resolveHeaderMatches(
    cells,
    performanceTimelineRule,
  );
  const shiftTimelineColumn =
    shiftTimelineMatches.status === "resolved"
      ? shiftTimelineMatches.columnIndex
      : undefined;

  for (const field of performanceFieldOrder) {
    const matches = resolveHeaderMatches(cells, performanceHeaderRules[field]);

    if (matches.status === "resolved") {
      resolvedColumns[field] = matches.columnIndex;
      continue;
    }

    if (
      (field === "onShift" || field === "eligible") &&
      shiftTimelineMatches.status === "resolved"
    ) {
      continue;
    }

    if (
      (field === "onShift" || field === "eligible") &&
      shiftTimelineMatches.status === "ambiguous"
    ) {
      ambiguousFields.push(field);
      continue;
    }

    if (matches.status === "missing") {
      missingFields.push(field);
    } else {
      ambiguousFields.push(field);
    }
  }

  return {
    sheetName,
    headerRows,
    cells,
    dataRows: rows
      .map((values, rowIndex) => ({ values, rowIndex }))
      .slice(headerRows[headerRows.length - 1] + 1)
      .filter((row) =>
        row.values.some((cell) => normalizeCell(cell) !== ""),
      ),
    missingFields,
    ambiguousFields,
    resolvedColumns,
    shiftTimelineColumn,
    attendanceSource:
      resolvedColumns.onShift !== undefined
        ? "separate_column"
        : shiftTimelineColumn !== undefined
          ? "timeline"
          : undefined,
    eligibilitySource:
      resolvedColumns.eligible !== undefined
        ? "separate_column"
        : shiftTimelineColumn !== undefined
          ? "timeline"
          : undefined,
    score: Object.keys(resolvedColumns).length,
  };
}

function resolveHeaderMatches(cells: HeaderCell[], aliases: HeaderAliasRule) {
  const fullAliasKeys = new Set(aliases.full.map(normalizeHeaderKey));
  const leafAliasKeys = new Set(aliases.leaf.map(normalizeHeaderKey));
  const matches = cells
    .map((cell, columnIndex) =>
      fullAliasKeys.has(cell.fullKey) || leafAliasKeys.has(cell.leafKey)
        ? columnIndex
        : -1,
    )
    .filter((columnIndex) => columnIndex >= 0);
  const uniqueMatches = Array.from(new Set(matches));

  if (uniqueMatches.length === 0) {
    return { status: "missing" as const };
  }

  if (uniqueMatches.length === 1) {
    return { status: "resolved" as const, columnIndex: uniqueMatches[0] };
  }

  return { status: "ambiguous" as const };
}

function isPerformanceAnchorRow(row: unknown[]) {
  const headerKeys = new Set(row.map((cell) => buildHeaderCell(cell).fullKey));

  return (
    headerKeys.has(normalizeHeaderKey("التاريخ")) &&
    headerKeys.has(normalizeHeaderKey("معرّف السائق"))
  );
}

function buildSingleRowHeaderCells(row: unknown[]): HeaderCell[] {
  return row.map(buildHeaderCell);
}

function buildTwoRowHeaderCells(
  groupRow: unknown[],
  metricRow: unknown[],
  merges: XLSX.Range[],
  groupRowIndex: number,
): HeaderCell[] {
  const columnCount = Math.max(groupRow.length, metricRow.length);
  const filledGroups = fillGroupHeaderRow(groupRow, merges, groupRowIndex, columnCount);

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const group = normalizeHeaderDisplay(filledGroups[columnIndex]);
    const metric = normalizeHeaderDisplay(metricRow[columnIndex]);
    const combined = group && metric ? `${group}_${metric}` : metric || group;
    return buildHeaderCell(combined);
  });
}

function buildHeaderCell(value: unknown): HeaderCell {
  const display = normalizeHeaderDisplay(value);
  const fullKey = normalizeHeaderKey(display);
  const leafKey = normalizeHeaderKey(getHeaderLeaf(display));
  const keys = Array.from(new Set([fullKey, leafKey].filter(Boolean)));

  return {
    display,
    fullKey,
    leafKey,
    keys,
  };
}

function getHeaderLeaf(value: string) {
  return value.split("_").at(-1) ?? value;
}

function fillGroupHeaderRow(
  row: unknown[],
  merges: XLSX.Range[],
  rowIndex: number,
  columnCount: number,
) {
  const filled = Array.from({ length: columnCount }, (_, index) => row[index] ?? "");

  for (const merge of merges) {
    if (merge.s.r !== rowIndex || merge.e.r !== rowIndex) {
      continue;
    }

    const value = row[merge.s.c] ?? "";
    for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
      filled[columnIndex] = value;
    }
  }

  let currentGroup = "";
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const value = normalizeHeaderDisplay(filled[columnIndex]);
    if (value) {
      currentGroup = value;
      continue;
    }

    if (currentGroup) {
      filled[columnIndex] = currentGroup;
    }
  }

  return filled;
}

function compareHeaderCandidates(
  left: HeaderLayoutCandidate,
  right: HeaderLayoutCandidate,
) {
  return (
    right.score - left.score ||
    left.ambiguousFields.length - right.ambiguousFields.length ||
    left.missingFields.length - right.missingFields.length ||
    left.headerRows[0] - right.headerRows[0] ||
    left.headerRows.length - right.headerRows.length
  );
}

function findRankingWorksheet(workbook: XLSX.WorkBook) {
  const candidates: Array<{
    sheetName: string;
    headerRowIndex: number;
    header: string[];
    rows: unknown[][];
    columns: Partial<Record<RankingField, number>>;
    missingFields: RankingField[];
    ambiguousFields: RankingField[];
    resolvedHeaders: Partial<Record<RankingField, string>>;
    score: number;
  }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const actualRange = repairWorksheetRange(sheet);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
      ...(actualRange ? { range: actualRange } : {}),
    });
    const inspectedRows = rows.slice(0, HEADER_SCAN_ROWS);
    inspectedRows.forEach((row, rowIndex) => {
      const header = row.map(normalizeHeaderDisplay);
      const resolved = resolveRankingColumns(header);
      const candidate = {
        sheetName,
        headerRowIndex: rowIndex,
        header,
        rows: rows
          .slice(rowIndex + 1)
          .filter((dataRow) =>
            dataRow.some((cell) => normalizeCell(cell) !== ""),
          ),
        ...resolved,
        score: Object.keys(resolved.columns).length,
      };
      candidates.push(candidate);
    });
  }

  const selected = candidates
    .filter(
      (candidate) =>
        candidate.missingFields.length === 0 &&
        candidate.ambiguousFields.length === 0 &&
        candidate.rows.length <= MAX_ROWS,
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.headerRowIndex - right.headerRowIndex,
    )[0];
  const best = selected ??
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.headerRowIndex - right.headerRowIndex,
    )[0] ??
    null;

  if (!best) {
    return null;
  }

  return {
    header: best.header,
    rows: best.rows,
    columns: best.columns,
    missingFields: best.missingFields,
    ambiguousFields: best.ambiguousFields,
    sheetName: best.sheetName,
    headerRow: best.headerRowIndex,
  };
}

function resolveRankingColumns(header: string[]) {
  const columns: Partial<Record<RankingField, number>> = {};
  const missingFields: RankingField[] = [];
  const ambiguousFields: RankingField[] = [];
  const resolvedHeaders: Partial<Record<RankingField, string>> = {};

  for (const field of Object.keys(rankingHeaders) as RankingField[]) {
    const aliases = new Set(rankingHeaderAliases[field].map(normalizeHeaderKey));
    const matches = header
      .map((value, index) => (aliases.has(normalizeHeaderKey(value)) ? index : -1))
      .filter((index) => index >= 0);
    const uniqueMatches = Array.from(new Set(matches));

    if (uniqueMatches.length === 0) {
      missingFields.push(field);
      continue;
    }

    if (uniqueMatches.length > 1) {
      ambiguousFields.push(field);
      continue;
    }

    columns[field] = uniqueMatches[0];
    resolvedHeaders[field] = header[uniqueMatches[0]];
  }

  return {
    columns,
    missingFields,
    ambiguousFields,
    resolvedHeaders,
  };
}

function formatRankingFieldLabel(field: RankingField) {
  return rankingHeaders[field];
}

function normalizeHeaderDisplay(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\u061c]/g, "")
    .replace(/[؟?]/g, "?")
    .replace(/[،؛]/g, ",")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*_\s*/g, "_");
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u061c]/g, "")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[ط£ط¥ط¢]/g, "ط§")
    .replace(/ظ‰/g, "ظٹ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*_\s*/g, "_")
    .toLowerCase();
}

function normalizeLegacyHeaderKey(value: unknown) {
  return normalizeHeaderDisplay(value)
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[؟?]/g, "")
    .replace(/[(),،؛:]/g, " ")
    .replace(/[-/]+/g, " ")
    .replace(/\s*_\s*/g, "_")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

void normalizeLegacyHeaderKey;

function normalizeCell(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getActualWorksheetRange(worksheet: XLSX.WorkSheet): string | null {
  const cellReferences = Object.keys(worksheet).filter(
    (key) => !key.startsWith("!") && /^[A-Z]+[1-9]\d*$/i.test(key),
  );

  if (cellReferences.length === 0) {
    return worksheet["!ref"] ?? null;
  }

  let minimumRow = Number.POSITIVE_INFINITY;
  let minimumColumn = Number.POSITIVE_INFINITY;
  let maximumRow = Number.NEGATIVE_INFINITY;
  let maximumColumn = Number.NEGATIVE_INFINITY;

  for (const reference of cellReferences) {
    const cell = XLSX.utils.decode_cell(reference);

    minimumRow = Math.min(minimumRow, cell.r);
    minimumColumn = Math.min(minimumColumn, cell.c);
    maximumRow = Math.max(maximumRow, cell.r);
    maximumColumn = Math.max(maximumColumn, cell.c);
  }

  return XLSX.utils.encode_range({
    s: {
      r: minimumRow,
      c: minimumColumn,
    },
    e: {
      r: maximumRow,
      c: maximumColumn,
    },
  });
}

function repairWorksheetRange(worksheet: XLSX.WorkSheet): string | null {
  const actualRange = getActualWorksheetRange(worksheet);

  if (actualRange) {
    worksheet["!ref"] = actualRange;
  }

  return actualRange;
}

function normalizeKeetaDriverId(value: unknown) {
  const normalized = normalizeCell(value);
  if (!normalized || /e[+-]?\d+/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseReportDate(value: unknown) {
  const normalized = normalizeCell(value).replace(/[^\d-]/g, "");
  const compact = normalized.replace(/-/g, "");

  if (!/^\d{8}$/.test(compact)) {
    return null;
  }

  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function parseExcelDurationToSeconds(
  value: unknown,
  context: DurationParseContext,
): DurationParseResult {
  const rawValue = context.cell?.v ?? value;

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { ok: false, reason: "empty", normalizedValue: "" };
  }

  if (rawValue instanceof Date) {
    return parseDateDuration(rawValue);
  }

  if (typeof rawValue === "number") {
    return parseNumericExcelDuration(rawValue, context);
  }

  if (typeof rawValue === "string") {
    return parseStringDuration(rawValue);
  }

  if (typeof rawValue === "boolean") {
    return {
      ok: false,
      reason: "unsupported_type",
      normalizedValue: String(rawValue),
    };
  }

  return {
    ok: false,
    reason: "unsupported_type",
    normalizedValue: serializeCellValue(rawValue),
  };
}

function parseNumericExcelDuration(
  value: number,
  context: DurationParseContext,
): DurationParseResult {
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      reason: "non_finite",
      normalizedValue: String(value),
    };
  }

  if (value < 0) {
    return {
      ok: false,
      reason: "negative",
      normalizedValue: String(value),
    };
  }

  if (isDurationNumberFormat(context.cell?.z)) {
    const seconds = Math.round(value * 86_400);

    if (!isBracketedDurationNumberFormat(context.cell?.z) && seconds > 86_400) {
      return {
        ok: false,
        reason: "invalid_format",
        normalizedValue: String(value),
      };
    }

    return {
      ok: true,
      seconds,
    };
  }

  if (value > 24) {
    return {
      ok: false,
      reason: "invalid_format",
      normalizedValue: String(value),
    };
  }

  return {
    ok: true,
    seconds: Math.round(value * 3600),
  };
}

function parseDateDuration(value: Date): DurationParseResult {
  const seconds =
    value.getUTCHours() * 3600 +
    value.getUTCMinutes() * 60 +
    value.getUTCSeconds() +
    Math.round(value.getUTCMilliseconds() / 1000);

  return { ok: true, seconds };
}

function parseStringDuration(value: string): DurationParseResult {
  const normalized = normalizeDurationText(value);

  if (!normalized) {
    return { ok: false, reason: "empty", normalizedValue: normalized };
  }

  if (/^-/.test(normalized)) {
    return { ok: false, reason: "negative", normalizedValue: normalized };
  }

  if (/^0+(?::0+){0,2}$/.test(normalized)) {
    return { ok: true, seconds: 0 };
  }

  const arabicUnitDuration = parseArabicUnitDuration(normalized);
  if (arabicUnitDuration !== null) {
    return arabicUnitDuration;
  }

  const decimalHours = parseDecimalHourString(normalized);
  if (decimalHours !== null) {
    return decimalHours;
  }

  const timeParts = normalized.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (timeParts) {
    const hours = Number(timeParts[1]);
    const minutes = Number(timeParts[2]);
    const seconds = timeParts[3] ? Number(timeParts[3]) : 0;

    return {
      ok: true,
      seconds: hours * 3600 + minutes * 60 + seconds,
    };
  }

  const textDuration = parseTextDuration(normalized);
  if (textDuration !== null) {
    return { ok: true, seconds: textDuration };
  }

  return {
    ok: false,
    reason: "invalid_format",
    normalizedValue: normalized,
  };
}

function normalizeDurationText(value: string) {
  const normalized = normalizeLocalizedDigits(value)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u061c]/g, "")
    .replace(/[٫٬]/g, ".")
    .replace(/[：﹕꞉]/g, ":")
    .trim()
    .replace(/\s+/g, " ");

  return normalized;
}

function parseDecimalHourString(value: string): DurationParseResult | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) {
    return null;
  }

  const hours = Number(value.replace(",", "."));

  if (!Number.isFinite(hours)) {
    return {
      ok: false,
      reason: "non_finite",
      normalizedValue: value,
    };
  }

  if (hours > 24) {
    return {
      ok: false,
      reason: "invalid_format",
      normalizedValue: value,
    };
  }

  return {
    ok: true,
    seconds: Math.round(hours * 3600),
  };
}

function parseArabicUnitDuration(value: string): DurationParseResult | null {
  if (!containsArabicDurationUnit(value)) {
    return null;
  }

  const normalized = normalizeArabicUnitDurationText(value);
  const parts: ArabicDurationParts = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  };
  const seenUnits = new Set<ArabicDurationUnit>();
  const tokenPattern =
    /(?:(\d+)\s*)?(يوم|يوما|يوماً|يومًا|يومان|يومين|أيام|ايام|ساعة|ساعات|دقيقة|دقائق|ثانية|ثوان|ثواني|ثوانٍ|س|د|ث)/g;
  const matches = Array.from(normalized.matchAll(tokenPattern));

  if (matches.length === 0) {
    return {
      ok: false,
      reason: "invalid_format",
      normalizedValue: normalized,
    };
  }

  const consumed = matches
    .map((match) => match[0])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (consumed !== normalized) {
    return {
      ok: false,
      reason: "invalid_format",
      normalizedValue: normalized,
    };
  }

  for (const match of matches) {
    const unit = getArabicDurationUnit(match[2]);
    const amountText = match[1];

    if (!unit || seenUnits.has(unit)) {
      return {
        ok: false,
        reason: "invalid_format",
        normalizedValue: normalized,
      };
    }

    if (!amountText && !isImplicitOneArabicUnit(match[2])) {
      return {
        ok: false,
        reason: "invalid_format",
        normalizedValue: normalized,
      };
    }

    const amount = amountText ? Number(amountText) : 1;

    if (!Number.isSafeInteger(amount) || amount < 0) {
      return {
        ok: false,
        reason: amount < 0 ? "negative" : "invalid_format",
        normalizedValue: normalized,
      };
    }

    seenUnits.add(unit);
    parts[unit] = amount;
  }

  if (
    (seenUnits.has("hours") && parts.minutes > 59) ||
    (seenUnits.size > 1 && parts.seconds > 59)
  ) {
    return {
      ok: false,
      reason: "invalid_format",
      normalizedValue: normalized,
    };
  }

  return {
    ok: true,
    seconds:
      parts.days * 86_400 +
      parts.hours * 3600 +
      parts.minutes * 60 +
      parts.seconds,
  };
}

function normalizeArabicUnitDurationText(value: string) {
  return value
    .replace(/[،,]/g, " ")
    .replace(/(?:^|\s)و(?=\s|\d|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsArabicDurationUnit(value: string) {
  return /(?:يوم|يوما|يوماً|يومًا|يومان|يومين|أيام|ايام|ساعة|ساعات|دقيقة|دقائق|ثانية|ثوان|ثواني|ثوانٍ|س|د|ث)/.test(value);
}

function getArabicDurationUnit(unit: string): ArabicDurationUnit | null {
  if (/^(?:يوم|يوما|يوماً|يومًا|يومان|يومين|أيام|ايام)$/.test(unit)) {
    return "days";
  }

  if (/^(?:ساعة|ساعات|س)$/.test(unit)) {
    return "hours";
  }

  if (/^(?:دقيقة|دقائق|د)$/.test(unit)) {
    return "minutes";
  }

  if (/^(?:ثانية|ثوان|ثواني|ثوانٍ|ث)$/.test(unit)) {
    return "seconds";
  }

  return null;
}

function isImplicitOneArabicUnit(unit: string) {
  return /^(?:يوم|ساعة|دقيقة|ثانية)$/.test(unit);
}

function normalizeLocalizedDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const codePoint = digit.codePointAt(0) ?? 0;
    if (codePoint >= 0x0660 && codePoint <= 0x0669) {
      return String(codePoint - 0x0660);
    }

    return String(codePoint - 0x06f0);
  });
}

function parseTextDuration(value: string) {
  const pattern =
    /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min|m|seconds?|secs?|sec|s|ساعة|ساعات|دقيقة|دقائق|ثانية|ثواني)/gi;
  const matches = Array.from(value.matchAll(pattern));

  if (matches.length === 0) {
    return null;
  }

  const consumed = matches
    .map((match) => match[0])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const simplified = value
    .replace(/\b(?:and)\b/gi, "")
    .replace(/[،,]/g, " ")
    .replace(/\s*و\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (consumed !== simplified) {
    return null;
  }

  let seconds = 0;

  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (!Number.isSafeInteger(amount) || amount < 0) {
      return null;
    }

    if (/^(hours?|hrs?|h|ساعة|ساعات)$/.test(unit)) {
      seconds += amount * 3600;
    } else if (/^(minutes?|mins?|min|m|دقيقة|دقائق)$/.test(unit)) {
      seconds += amount * 60;
    } else if (/^(seconds?|secs?|sec|s|ثانية|ثواني)$/.test(unit)) {
      seconds += amount;
    }
  }

  return seconds;
}

function isDurationNumberFormat(format: unknown) {
  if (!format) {
    return false;
  }

  const normalized = String(format).toLowerCase().replace(/"[^"]*"/g, "");
  return /(?:\[h\]|h{1,2}):m{1,2}(?::s{1,2})?/.test(normalized);
}

function isBracketedDurationNumberFormat(format: unknown) {
  if (!format) {
    return false;
  }

  return /\[h\]/i.test(String(format));
}

function logInvalidDurationDiagnostic(
  context: DurationParseContext,
  result: Exclude<DurationParseResult, { ok: true }>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[driver-reports:performance:invalid-duration]", {
    workbookFileName: context.workbookFileName,
    worksheetName: context.worksheetName,
    rowNumber: context.rowNumber,
    column: XLSX.utils.encode_col(context.columnIndex),
    columnHeader: context.columnHeader,
    rawCellType: getCellType(context.cell),
    rawValue: serializeCellValue(context.cell?.v),
    cellNumberFormat: context.cell?.z ?? null,
    normalizedValue: result.normalizedValue,
    reason: result.reason,
  });
}

function getCellType(cell: XLSX.CellObject | undefined) {
  if (!cell) {
    return "undefined";
  }

  if (cell.f) {
    return `formula:${cell.t ?? "unknown"}`;
  }

  return cell.t ?? "unknown";
}

function serializeCellValue(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function parseLegacyDurationSeconds(value: unknown) {
  const normalized = normalizeCell(value);
  if (!normalized) {
    return null;
  }

  const matches = Array.from(normalized.matchAll(/(\d+)\s*([سدث])/g));
  if (matches.length === 0) {
    return null;
  }

  let seconds = 0;
  const consumed = matches.map((match) => match[0]).join(" ");
  const simplifiedInput = normalized.replace(/\s+/g, " ").trim();
  const simplifiedConsumed = consumed.replace(/\s+/g, " ").trim();

  if (simplifiedInput !== simplifiedConsumed) {
    return null;
  }

  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2];

    if (!Number.isInteger(amount) || amount < 0) {
      return null;
    }

    if (unit === "س") {
      seconds += amount * 60 * 60;
    } else if (unit === "د") {
      seconds += amount * 60;
    } else if (unit === "ث") {
      seconds += amount;
    }
  }

  return seconds;
}

void parseLegacyDurationSeconds;

function parseNonNegativeInteger(value: unknown) {
  const normalized = normalizeCell(value).replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const number = Number(normalized);
  return Number.isSafeInteger(number) ? number : null;
}

function parseNullableRatio(value: unknown) {
  const normalized = normalizeCell(value);
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "null") {
    return null;
  }

  const isPercent = normalized.endsWith("%");
  const number = Number(normalized.replace("%", ""));
  if (!Number.isFinite(number) || number < 0) {
    return "invalid" as const;
  }

  const ratio = isPercent || number > 1 ? number / 100 : number;
  return ratio >= 0 && ratio <= 1 ? ratio : ("invalid" as const);
}

function parseWholeNonNegativeInteger(value: unknown) {
  const normalized = normalizeDigitsForNumber(normalizeCell(value)).replace(/,/g, "");
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "null") {
    return null;
  }

  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    return null;
  }

  return Number.isSafeInteger(number) ? number : null;
}

function parseShiftTimeline(value: unknown): {
  onShift: boolean;
  eligible: boolean | null;
} {
  const text = normalizeCell(value).toLowerCase();
  if (!text) {
    return { onShift: false, eligible: null };
  }

  const shiftMatches = Array.from(text.matchAll(/\b(?:on-shift|off-shift)\b/g));
  if (shiftMatches.length === 0) {
    return { onShift: false, eligible: null };
  }

  let hasOnShift = false;
  let hasQualifiedOnShift = false;
  let hasUnqualifiedOnShift = false;

  for (let index = 0; index < shiftMatches.length; index += 1) {
    const match = shiftMatches[index];
    const shiftToken = match[0];
    const startIndex = match.index ?? 0;
    const endIndex =
      index + 1 < shiftMatches.length
        ? (shiftMatches[index + 1].index ?? text.length)
        : text.length;
    const segment = text.slice(startIndex, endIndex);

    if (shiftToken !== "on-shift") {
      continue;
    }

    hasOnShift = true;
    if (hasToken(segment, "unqualified")) {
      hasUnqualifiedOnShift = true;
    } else if (hasToken(segment, "qualified")) {
      hasQualifiedOnShift = true;
    }
  }

  return {
    onShift: hasOnShift,
    eligible: hasUnqualifiedOnShift
      ? false
      : hasQualifiedOnShift
        ? true
        : null,
  };
}

function hasToken(text: string, token: string) {
  return new RegExp(`(^|[^a-z])${token}([^a-z]|$)`, "i").test(text);
}

function parseBooleanYesNo(value: unknown) {
  const normalized = normalizeCell(value).toLowerCase();
  if (["yes", "y", "true", "1", "نعم"].includes(normalized)) {
    return true;
  }

  if (["no", "n", "false", "0", "لا"].includes(normalized)) {
    return false;
  }

  return null;
}

function parseEvaluationValue(value: unknown) {
  const normalized = normalizeDigitsForNumber(normalizeCell(value));

  if (!normalized || normalized === "-") {
    return null;
  }

  return normalized;
}

function parseRankingPercentage(value: unknown) {
  const normalized = normalizeDigitsForNumber(normalizeCell(value))
    .replace(/,/g, "")
    .trim();

  if (!normalized || normalized === "-" || normalized.toLowerCase() === "null") {
    return "invalid" as const;
  }

  const isPercent = normalized.endsWith("%");
  const number = Number(normalized.replace("%", ""));

  if (!Number.isFinite(number) || number < 0) {
    return "invalid" as const;
  }

  const ratio = isPercent || number > 1 ? number / 100 : number;
  return ratio >= 0 && ratio <= 1 ? ratio : ("invalid" as const);
}

function normalizeDigitsForNumber(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const codePoint = digit.codePointAt(0) ?? 0;
    if (codePoint >= 0x0660 && codePoint <= 0x0669) {
      return String(codePoint - 0x0660);
    }

    return String(codePoint - 0x06f0);
  });
}
