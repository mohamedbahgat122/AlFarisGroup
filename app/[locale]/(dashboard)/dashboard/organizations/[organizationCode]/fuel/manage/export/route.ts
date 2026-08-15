import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getKafaratplusFuelManagementData } from "@/features/fuel/queries";
import type { KafaratplusFuelManagementRow } from "@/features/fuel/types";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale, type Locale } from "@/types/locale";

type RouteContext = {
  params: Promise<{ locale: string; organizationCode: string }>;
};

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
  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status === "unauthenticated") {
    return new NextResponse(null, { status: 401 });
  }

  if (access.status === "not_found") {
    return new NextResponse(null, { status: 404 });
  }

  if (access.status !== "success" || !access.organization.navigation.fuelManagement) {
    return new NextResponse(null, { status: 403 });
  }

  const organization = access.organization;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return new NextResponse(null, { status: 401 });
  }

  const data = await getKafaratplusFuelManagementData({
    organizationId: organization.id,
    fuelDate,
  });

  if (data.status !== "success") {
    return NextResponse.json({ message: data.message }, { status: 503 });
  }

  const workbook = createWorkbook({
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

function createWorkbook({
  exportedBy,
  fuelDate,
  locale,
  organizationName,
  rows,
}: {
  exportedBy: string;
  fuelDate: string;
  locale: Locale;
  organizationName: string;
  rows: KafaratplusFuelManagementRow[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Faris Group";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Kafaratplus Fuel", {
    views: [{ rightToLeft: locale === "ar", state: "frozen", ySplit: 5 }],
  });
  worksheet.columns = [
    { key: "localDriver", width: 28 },
    { key: "localDriverIqama", width: 18 },
    { key: "localDriverId", width: 36 },
    { key: "kafaratplusDriver", width: 28 },
    { key: "licencePlate", width: 18 },
    { key: "vehicle", width: 28 },
    { key: "brandModel", width: 24 },
    { key: "operationCount", width: 18 },
    { key: "totalQuantity", width: 18 },
    { key: "total", width: 18 },
    { key: "fuelProducts", width: 28 },
    { key: "latestProvider", width: 24 },
    { key: "latestOdometer", width: 18 },
    { key: "branch", width: 24 },
    { key: "nfcIdentifier", width: 22 },
  ];

  worksheet.getCell("A1").value = "Al Faris Group - Kafaratplus Fuel";
  worksheet.getCell("A2").value = organizationName;
  worksheet.getCell("A3").value = fuelDate;
  worksheet.getCell("A4").value = exportedBy;

  worksheet.addRow([
    "السائق المحلي",
    "سائق Kafaratplus",
    "رقم اللوحة",
    "المركبة",
    "الماركة / الموديل",
    "عدد العمليات اليوم",
    "إجمالي اللترات",
    "إجمالي التكلفة",
    "نوع الوقود",
    "آخر محطة",
    "آخر عداد",
    "الفرع",
    "NFC",
  ]);
  worksheet.spliceRows(5, 1, [
    "Local driver",
    "Iqama",
    "Driver ID",
    "Kafaratplus driver",
    "Actual plate",
    "Vehicle",
    "Brand / model",
    "Operations today",
    "Total liters",
    "Total cost",
    "Fuel product",
    "Latest provider",
    "Latest odometer",
    "Branch",
    "NFC",
  ]);

  for (const row of rows) {
    worksheet.addRow([
      row.localDriver,
      row.localDriverIqama,
      row.localDriverId,
      row.kafaratplusDriver,
      row.licencePlate,
      row.vehicle,
      row.brandModel,
      row.operationCount,
      row.totalQuantity,
      row.total,
      row.fuelProducts.join(" / "),
      row.latestProvider,
      row.latestOdometer,
      row.branch,
      row.nfcIdentifier,
    ]);
  }

  return workbook;
}

function createFilename(locale: Locale, organizationName: string, fuelDate: string) {
  const prefix = locale === "ar" ? "kafaratplus-fuel" : "kafaratplus-fuel";
  return `${sanitizeFilenamePart(prefix)}-${sanitizeFilenamePart(
    organizationName,
  )}-${fuelDate}.xlsx`;
}

function createContentDisposition(filename: string) {
  return `attachment; filename="kafaratplus-fuel.xlsx"; filename*=UTF-8''${encodeURIComponent(
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

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
