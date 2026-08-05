"use server";

import { revalidatePath } from "next/cache";
import { importKeetaReportsForOrganization } from "@/features/driver-reports/service";
import type { DriverReportImportActionState } from "@/features/driver-reports/action-state";
import type {
  DriverReportFieldErrors,
  DriverReportImportErrorCode,
  DriverReportImportErrorDetails,
} from "@/features/driver-reports/types";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

export async function importKeetaReportsAction(
  _previousState: DriverReportImportActionState,
  formData: FormData,
): Promise<DriverReportImportActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const replaceExisting = getStringValue(formData, "replaceExisting") === "true";

  if (!isLocale(locale)) {
    return {
      status: "error",
      code: "import_failed",
      submissionId: createSubmissionId(),
    };
  }

  const performanceFile = getFileValue(formData, "performanceFile");
  const rankingFile = getFileValue(formData, "rankingFile");
  const fieldErrors: DriverReportFieldErrors = {};

  if (!performanceFile) {
    fieldErrors.performanceFile = getErrorMessage(
      locale,
      "missing_performance_file",
    );
  }

  if (!rankingFile) {
    fieldErrors.rankingFile = getErrorMessage(locale, "missing_ranking_file");
  }

  if (!organizationCode) {
    return {
      status: "error",
      code: "organization_unavailable",
      message: getErrorMessage(locale, "organization_unavailable"),
      submissionId: createSubmissionId(),
    };
  }

  if (Object.keys(fieldErrors).length > 0 || !performanceFile || !rankingFile) {
    return {
      status: "validation_error",
      code: "missing_performance_file",
      message: getErrorMessage(locale, "missing_performance_file"),
      fieldErrors,
      submissionId: createSubmissionId(),
    };
  }

  const result = await importKeetaReportsForOrganization({
    organizationCode,
    performanceFile,
    rankingFile,
    replaceExisting,
  });

  if (!result.success) {
    const message = getErrorMessage(locale, result.code, result.details);

    if (result.code === "duplicate_saved_report" && !replaceExisting) {
      return {
        status: "validation_error",
        code: result.code,
        message,
        fieldErrors: {},
        reportDate: result.reportDate,
        submissionId: createSubmissionId(),
        requiresReplacement: true,
      };
    }

    if (result.field) {
      return {
        status: "validation_error",
        code: result.code,
        message,
        fieldErrors: {
          [result.field]: message,
        },
        submissionId: createSubmissionId(),
      };
    }

    return {
      status: "error",
      code: result.code,
      message,
      submissionId: createSubmissionId(),
    };
  }

  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/drivers/reports`,
  );

  return {
    status: "success",
    code: "success",
    reportDate: result.reportDate,
    submissionId: createSubmissionId(),
    message: replaceExisting
      ? getReplacementSuccessMessage(locale, result.reportDate)
      : getDictionary(locale).dashboard.drivers.reportImportSuccess,
  };
}

function createSubmissionId() {
  return crypto.randomUUID();
}

function getStringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getFileValue(formData: FormData, name: string) {
  const value = formData.get(name);

  if (!(value instanceof File) || value.size <= 0) {
    return null;
  }

  return value;
}

function getReplacementSuccessMessage(locale: "ar" | "en", reportDate: string) {
  const formattedDate = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(new Date(`${reportDate}T00:00:00.000Z`));

  return getDictionary(locale).dashboard.drivers.reportReplaceSuccess.replace(
    "{date}",
    formattedDate,
  );
}

function getErrorMessage(
  locale: "ar" | "en",
  code: DriverReportImportErrorCode,
  details?: DriverReportImportErrorDetails,
) {
  const base = getDictionary(locale).dashboard.drivers.reportErrors[code];
  if (
    code === "invalid_duration" &&
    details?.durationErrors &&
    details.durationErrors.length > 0
  ) {
    return formatDurationErrorMessage(locale, details);
  }

  if (
    code === "missing_ranking_headers" &&
    details &&
    ((details.missingFields?.length ?? 0) > 0 ||
      (details.ambiguousFields?.length ?? 0) > 0)
  ) {
    return formatRankingHeaderErrorMessage(locale, details);
  }

  if (
    code !== "missing_performance_headers" ||
    !details ||
    ((details.missingFields?.length ?? 0) === 0 &&
      (details.ambiguousFields?.length ?? 0) === 0)
  ) {
    return base;
  }

  const missing = details.missingFields ?? [];
  const ambiguous = details.ambiguousFields ?? [];

  if (locale === "ar") {
    return [
      "تعذر التعرّف على بعض أعمدة تقرير الأداء:",
      ...missing.map((field) => `- ${field}`),
      ...ambiguous.map((field) => `- ${field} (عمود مكرر أو غير واضح)`),
      "تم اكتشاف ورقة العمل، لكن تنسيق الأعمدة يختلف عن التنسيق المدعوم.",
    ].join("\n");
  }

  return [
    "Some Daily Performance columns could not be identified:",
    ...missing.map((field) => `- ${field}`),
    ...ambiguous.map((field) => `- ${field} (duplicate or ambiguous column)`),
    "A worksheet was detected, but its column layout differs from the supported formats.",
  ].join("\n");
}

function formatRankingHeaderErrorMessage(
  locale: "ar" | "en",
  details: DriverReportImportErrorDetails,
) {
  const missing = details.missingFields ?? [];
  const ambiguous = details.ambiguousFields ?? [];

  if (locale === "ar") {
    return [
      "تعذر العثور على بعض أعمدة تقرير التقييم والترتيب:",
      ...missing.map((field) => `- ${field}`),
      ...ambiguous.map((field) => `- ${field} (عمود مكرر أو غير واضح)`),
    ].join("\n");
  }

  return [
    "Some Evaluation and Ranking columns could not be identified:",
    ...missing.map((field) => `- ${field}`),
    ...ambiguous.map((field) => `- ${field} (duplicate or ambiguous column)`),
  ].join("\n");
}

function formatDurationErrorMessage(
  locale: "ar" | "en",
  details: DriverReportImportErrorDetails,
) {
  const durationErrors = details.durationErrors ?? [];
  const additionalCount = details.additionalDurationErrorCount ?? 0;

  if (durationErrors.length === 1 && additionalCount === 0) {
    const error = durationErrors[0];

    if (locale === "ar") {
      return [
        `قيمة مدة الاتصال غير صحيحة في الصف ${error.rowNumber}، عمود ${error.columnHeader}:`,
        `"${error.rawValue}"`,
      ].join("\n");
    }

    return [
      `Invalid call duration at row ${error.rowNumber}, ${error.columnHeader} column:`,
      `"${error.rawValue}"`,
    ].join("\n");
  }

  if (locale === "ar") {
    return [
      `تم العثور على ${durationErrors.length + additionalCount} قيم غير صحيحة في عمود مدة الاتصال:`,
      "",
      ...durationErrors.map(
        (error) => `الصف ${error.rowNumber}: "${error.rawValue}"`,
      ),
      ...(additionalCount > 0
        ? [`و${additionalCount} أخطاء إضافية غير معروضة.`]
        : []),
    ].join("\n");
  }

  return [
    `Found ${durationErrors.length + additionalCount} invalid call duration values:`,
    "",
    ...durationErrors.map(
      (error) => `Row ${error.rowNumber}: "${error.rawValue}"`,
    ),
    ...(additionalCount > 0
      ? [`${additionalCount} additional errors are not shown.`]
      : []),
  ].join("\n");
}
