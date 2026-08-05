import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getFuelManagementData } from "@/features/fuel/queries";
import type { FuelManagementRow } from "@/features/fuel/types";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale, type Locale } from "@/types/locale";

type RouteContext = {
  params: Promise<{ locale: string; organizationCode: string }>;
};

const TABLE_START_ROW = 8;
const NAVY = "FF0F2747";
const PRIMARY = "FF0B6CFB";
const GOLD = "FFC69A2B";
const LIGHT_BLUE = "FFEAF3FF";
const BORDER = "FFD7E3F0";
const WHITE = "FFFFFFFF";

export async function GET(request: Request, context: RouteContext) {
  const { locale: localeValue, organizationCode } = await context.params;
  const url = new URL(request.url);

  if (!isLocale(localeValue)) {
    return new NextResponse(null, { status: 404 });
  }

  const locale = localeValue;
  const fuelDate = isDate(url.searchParams.get("date"))
    ? url.searchParams.get("date")!
    : getBusinessDateString();
  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization || !organization.navigation.fuelManagement) {
    return new NextResponse(null, { status: 404 });
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return new NextResponse(null, { status: 401 });
  }

  const data = await getFuelManagementData({
    organizationId: organization.id,
    fuelDate,
  });

  if (data.status !== "success") {
    return new NextResponse(null, { status: 500 });
  }

  const dictionary = getDictionary(locale).dashboard.fuel;
  const workbook = await createWorkbook({
    dictionary,
    exportedBy: admin.profile.full_name,
    fuelDate,
    locale,
    organizationName: organization.name,
    rows: data.rows,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = createFilename(locale, organization.name, fuelDate);

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": createContentDisposition(filename),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
    },
  });
}

async function createWorkbook({
  dictionary,
  exportedBy,
  fuelDate,
  locale,
  organizationName,
  rows,
}: {
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["fuel"];
  exportedBy: string;
  fuelDate: string;
  locale: Locale;
  organizationName: string;
  rows: FuelManagementRow[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Faris Group";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(dictionary.managementTitle, {
    views: [
      {
        rightToLeft: locale === "ar",
        state: "frozen",
        ySplit: TABLE_START_ROW,
      },
    ],
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      orientation: "landscape",
      printTitlesRow: `${TABLE_START_ROW}:${TABLE_START_ROW}`,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  worksheet.properties.defaultRowHeight = 22;
  worksheet.columns = [
    { key: "number", width: 8 },
    { key: "driver", width: 30 },
    { key: "driverId", width: 24 },
    { key: "vehicle", width: 18 },
    { key: "plate", width: 18 },
    { key: "openingStatus", width: 24 },
    { key: "openingAmount", width: 18 },
    { key: "approvedIncreases", width: 20 },
    { key: "pendingRequest", width: 22 },
    { key: "totalFuel", width: 18 },
    { key: "notes", width: 34 },
  ];

  applyHeader(worksheet, {
    dictionary,
    exportedBy,
    fuelDate,
    locale,
    organizationName,
  });
  applyTable(worksheet, { dictionary, locale, rows });

  return workbook;
}

function applyHeader(
  worksheet: ExcelJS.Worksheet,
  {
    dictionary,
    exportedBy,
    fuelDate,
    locale,
    organizationName,
  }: {
    dictionary: ReturnType<typeof getDictionary>["dashboard"]["fuel"];
    exportedBy: string;
    fuelDate: string;
    locale: Locale;
    organizationName: string;
  },
) {
  worksheet.mergeCells("A1:K1");
  const brandRow = worksheet.getRow(1);
  brandRow.height = 28;
  brandRow.getCell(1).value = "Al Faris Group";
  brandRow.getCell(1).font = {
    bold: true,
    color: { argb: GOLD },
    name: "Arial",
    size: 16,
  };
  brandRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  brandRow.getCell(1).fill = solidFill(NAVY);

  worksheet.mergeCells("A2:K2");
  const titleRow = worksheet.getRow(2);
  titleRow.height = 34;
  titleRow.getCell(1).value = dictionary.dailyManagementReportTitle;
  titleRow.getCell(1).font = {
    bold: true,
    color: { argb: WHITE },
    name: "Arial",
    size: 18,
  };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.getCell(1).fill = solidFill(PRIMARY);

  const metadata = [
    [dictionary.organization, organizationName],
    [dictionary.fuelDate, formatDate(fuelDate, locale)],
    [dictionary.exportDate, formatDateTime(new Date(), locale)],
    [dictionary.exportedBy, exportedBy],
  ];

  metadata.forEach(([label, value], index) => {
    const row = worksheet.getRow(3 + index);
    row.height = 24;
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    worksheet.mergeCells(3 + index, 2, 3 + index, 11);

    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 11, bold: columnNumber === 1 };
      cell.alignment = {
        horizontal: columnNumber === 1 ? "center" : locale === "ar" ? "right" : "left",
        vertical: "middle",
      };
      cell.fill = solidFill(columnNumber === 1 ? LIGHT_BLUE : WHITE);
      cell.border = subtleBorder();
    });
  });
}

function applyTable(
  worksheet: ExcelJS.Worksheet,
  {
    dictionary,
    locale,
    rows,
  }: {
    dictionary: ReturnType<typeof getDictionary>["dashboard"]["fuel"];
    locale: Locale;
    rows: FuelManagementRow[];
  },
) {
  const headers = [
    dictionary.exportColumns.number,
    dictionary.exportColumns.driver,
    dictionary.exportColumns.driverId,
    dictionary.exportColumns.vehicle,
    dictionary.exportColumns.plate,
    dictionary.exportColumns.openingStatus,
    dictionary.exportColumns.openingAmount,
    dictionary.exportColumns.approvedIncreases,
    dictionary.exportColumns.pendingRequest,
    dictionary.exportColumns.totalFuel,
    dictionary.exportColumns.notes,
  ];
  const headerRow = worksheet.getRow(TABLE_START_ROW);
  headerRow.values = headers;
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, name: "Arial", size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = solidFill(NAVY);
    cell.border = subtleBorder();
  });

  if (rows.length === 0) {
    const emptyRow = worksheet.getRow(TABLE_START_ROW + 1);
    worksheet.mergeCells(TABLE_START_ROW + 1, 1, TABLE_START_ROW + 1, 11);
    emptyRow.getCell(1).value = dictionary.emptyExport;
    emptyRow.getCell(1).font = { name: "Arial", size: 12, bold: true };
    emptyRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    emptyRow.height = 34;
    return;
  }

  const firstDataRow = TABLE_START_ROW + 1;

  rows.forEach((row, index) => {
    const worksheetRow = worksheet.getRow(firstDataRow + index);
    const pendingAmount = row.pendingRequest?.requestedAmountSar ?? null;
    worksheetRow.values = [
      index + 1,
      row.driverName,
      textCell(row.driverIdentifier),
      formatVehicleLabel(row.vehicleLabel, dictionary),
      textCell(row.vehiclePlate),
      row.openingAmountSar > 0
        ? dictionary.fuelOpened
        : dictionary.fuelNotOpened,
      row.openingAmountSar,
      row.approvedIncreaseAmountSar,
      pendingAmount ?? dictionary.none,
      row.dailyTotalSar,
      row.pendingRequest?.reason ?? "",
    ];
    worksheetRow.height = 28;

    worksheetRow.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = {
        horizontal: getColumnAlignment(columnNumber, locale),
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = solidFill(index % 2 === 0 ? WHITE : "FFF8FBFF");
      cell.border = subtleBorder();

      if ([7, 8, 9, 10].includes(columnNumber) && typeof cell.value === "number") {
        cell.numFmt = locale === "ar" ? '#,##0.00 "ر.س"' : '#,##0.00 "SAR"';
      }

      if (columnNumber === 3 || columnNumber === 5) {
        cell.numFmt = "@";
      }
    });
  });

  const totalsRowNumber = firstDataRow + rows.length;
  const totalsRow = worksheet.getRow(totalsRowNumber);
  totalsRow.height = 30;
  totalsRow.getCell(1).value = dictionary.totalsLabel;
  worksheet.mergeCells(totalsRowNumber, 1, totalsRowNumber, 6);
  totalsRow.getCell(7).value = {
    formula: `SUM(G${firstDataRow}:G${totalsRowNumber - 1})`,
  };
  totalsRow.getCell(8).value = {
    formula: `SUM(H${firstDataRow}:H${totalsRowNumber - 1})`,
  };
  totalsRow.getCell(9).value = {
    formula: `SUM(I${firstDataRow}:I${totalsRowNumber - 1})`,
  };
  totalsRow.getCell(10).value = {
    formula: `SUM(J${firstDataRow}:J${totalsRowNumber - 1})`,
  };

  totalsRow.eachCell((cell, columnNumber) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY } };
    cell.alignment = {
      horizontal: columnNumber <= 6 ? "center" : "right",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = solidFill(LIGHT_BLUE);
    cell.border = {
      ...subtleBorder(),
      top: { style: "medium", color: { argb: NAVY } },
    };

    if ([7, 8, 9, 10].includes(columnNumber)) {
      cell.numFmt = locale === "ar" ? '#,##0.00 "ر.س"' : '#,##0.00 "SAR"';
    }
  });

  worksheet.autoFilter = {
    from: { row: TABLE_START_ROW, column: 1 },
    to: { row: totalsRowNumber - 1, column: 11 },
  };
}

function getColumnAlignment(columnNumber: number, locale: Locale) {
  if ([1, 7, 8, 9, 10].includes(columnNumber)) {
    return "center";
  }

  return locale === "ar" ? "right" : "left";
}

function formatVehicleLabel(
  value: string | null,
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["fuel"],
) {
  if (!value) {
    return dictionary.notAvailable;
  }

  return dictionary.vehicleTypes[value as keyof typeof dictionary.vehicleTypes] ?? value;
}

function textCell(value: string | null) {
  return value ? String(value) : "";
}

function solidFill(color: string): ExcelJS.Fill {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };
}

function subtleBorder(): Partial<ExcelJS.Borders> {
  return {
    bottom: { style: "thin", color: { argb: BORDER } },
    left: { style: "thin", color: { argb: BORDER } },
    right: { style: "thin", color: { argb: BORDER } },
    top: { style: "thin", color: { argb: BORDER } },
  };
}

function createFilename(locale: Locale, organizationName: string, fuelDate: string) {
  const prefix = locale === "ar" ? "إدارة-الوقود" : "Fuel-Management";
  return `${sanitizeFilenamePart(prefix)}-${sanitizeFilenamePart(
    organizationName,
  )}-${fuelDate}.xlsx`;
}

function createContentDisposition(filename: string) {
  return `attachment; filename="fuel-management.xlsx"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "long",
    timeZone: "Asia/Riyadh",
  }).format(new Date(`${value}T00:00:00+03:00`));
}

function formatDateTime(value: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(value);
}

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
