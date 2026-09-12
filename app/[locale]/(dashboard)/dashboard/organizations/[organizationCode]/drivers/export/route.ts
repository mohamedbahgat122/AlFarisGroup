import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getDriversExportData } from "@/features/drivers/queries";
import type { DriverListItem } from "@/features/drivers/types";
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
  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status === "unauthenticated") {
    return new NextResponse(null, { status: 401 });
  }

  if (access.status === "not_found") {
    return new NextResponse(null, { status: 404 });
  }

  if (access.status !== "success" || !access.organization.navigation.drivers) {
    return new NextResponse(null, { status: 403 });
  }

  const organization = access.organization;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return new NextResponse(null, { status: 401 });
  }

  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") as any || undefined;
  const nationality = url.searchParams.get("nationality") || undefined;
  const sponsorship = url.searchParams.get("sponsorship") || undefined;
  const documentStatus = url.searchParams.get("documentStatus") as any || undefined;
  const vehicleType = url.searchParams.get("vehicleType") || undefined;
  const appAccountStatus = url.searchParams.get("appAccountStatus") || undefined;
  const archived = url.searchParams.get("archived") || undefined;

  const rows = await getDriversExportData(organization.id, organization.name, {
    search,
    status,
    nationality,
    sponsorship,
    documentStatus,
    vehicleType,
    appAccountStatus,
    archived,
  });

  const workbook = createWorkbook({
    exportedBy: admin.profile.full_name,
    exportDate: getBusinessDateString(),
    locale,
    organizationName: organization.name,
    rows,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = createFilename(locale, organization.name, getBusinessDateString());

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
  exportDate,
  locale,
  organizationName,
  rows,
}: {
  exportedBy: string;
  exportDate: string;
  locale: Locale;
  organizationName: string;
  rows: DriverListItem[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Faris Group";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Drivers", {
    views: [{ rightToLeft: locale === "ar", state: "frozen", ySplit: 5 }],
  });
  
  worksheet.columns = [
    { key: "fullName", width: 28 },
    { key: "mobileNumber", width: 18 },
    { key: "nationality", width: 22 },
    { key: "status", width: 18 },
    { key: "appAccountStatus", width: 22 },
    { key: "vehicleType", width: 18 },
    { key: "vehicleNumber", width: 18 },
    { key: "iqamaNumber", width: 18 },
    { key: "iqamaExpiryDate", width: 18 },
    { key: "driverCardNumber", width: 18 },
    { key: "driverCardExpiryDate", width: 18 },
    { key: "drivingLicenseExpiryDate", width: 22 },
    { key: "vehicleAuthorizationExpiryDate", width: 22 },
    { key: "operatingCardExpiryDate", width: 22 },
  ];

  worksheet.getCell("A1").value = "Al Faris Group - Drivers";
  worksheet.getCell("A2").value = organizationName;
  worksheet.getCell("A3").value = exportDate;
  worksheet.getCell("A4").value = exportedBy;

  const headerArabic = [
    "الاسم",
    "الجوال",
    "الجنسية",
    "الحالة",
    "حساب التطبيق",
    "نوع المركبة",
    "رقم المركبة",
    "رقم الإقامة",
    "انتهاء الإقامة",
    "بطاقة سائق",
    "انتهاء بطاقة سائق",
    "انتهاء الرخصة",
    "انتهاء تفويض المركبة",
    "انتهاء بطاقة التشغيل",
  ];

  const headerEnglish = [
    "Name",
    "Mobile",
    "Nationality",
    "Status",
    "App Account",
    "Vehicle Type",
    "Vehicle Number",
    "Iqama Number",
    "Iqama Expiry",
    "Driver Card",
    "Driver Card Expiry",
    "License Expiry",
    "Vehicle Auth Expiry",
    "Operating Card Expiry",
  ];

  worksheet.addRow(locale === "ar" ? headerEnglish : headerArabic);
  worksheet.spliceRows(5, 1, locale === "ar" ? headerArabic : headerEnglish);

  for (const row of rows) {
    worksheet.addRow([
      row.fullName,
      row.mobileNumber,
      row.nationality,
      row.status,
      row.appAccount.status,
      row.vehicleType,
      row.vehicleNumber,
      row.iqamaNumber,
      row.iqamaExpiryDate,
      row.driverCardNumber,
      row.driverCardExpiryDate,
      row.drivingLicenseExpiryDate || "",
      row.vehicleAuthorizationExpiryDate || "",
      row.operatingCardExpiryDate || "",
    ]);
  }

  return workbook;
}

function createFilename(locale: Locale, organizationName: string, dateString: string) {
  const prefix = locale === "ar" ? "drivers" : "drivers";
  return `${sanitizeFilenamePart(prefix)}-${sanitizeFilenamePart(
    organizationName,
  )}-${dateString}.xlsx`;
}

function createContentDisposition(filename: string) {
  return `attachment; filename="drivers.xlsx"; filename*=UTF-8''${encodeURIComponent(
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
