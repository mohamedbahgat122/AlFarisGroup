import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getGlobalFleetExportData } from "@/features/fleet/queries";
import type { FleetVehicle, FleetVehicleCategory } from "@/features/fleet/types";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale, type Locale } from "@/types/locale";

function getBusinessDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export async function exportGlobalFleet(
  request: Request,
  localeValue: string,
  category: FleetVehicleCategory
) {
  const url = new URL(request.url);

  if (!isLocale(localeValue)) {
    return new NextResponse(null, { status: 404 });
  }

  const locale = localeValue;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return new NextResponse(null, { status: 401 });
  }

  const search = url.searchParams.get("search") || undefined;
  const archive = (url.searchParams.get("archive") as any) || "active";
  const technicalStatus = (url.searchParams.get("technicalStatus") as any) || "all";
  const operationalStatus = (url.searchParams.get("operationalStatus") as any) || "all";
  const assignedOrganizationId = url.searchParams.get("assignedOrganizationId") || undefined;
  const vehicleType = url.searchParams.get("vehicleType") || undefined;
  const ownershipType = (url.searchParams.get("ownershipType") as any) || "all";
  const driver = url.searchParams.get("driver") || undefined;
  const authorization = (url.searchParams.get("authorization") as any) || "all";
  const linkedDriver = (url.searchParams.get("linkedDriver") as any) || "all";

  const { status, vehicles } = await getGlobalFleetExportData({
    category,
    filters: {
      search,
      archive,
      technicalStatus,
      operationalStatus,
      assignedOrganizationId,
      vehicleType,
      ownershipType,
      driver,
      authorization,
      linkedDriver,
    },
  });

  if (status !== "success") {
    return new NextResponse(null, { status: status === "unauthorized" ? 403 : 500 });
  }

  const workbook = createWorkbook({
    exportedBy: admin.profile.full_name,
    exportDate: getBusinessDateString(),
    locale,
    category,
    rows: vehicles,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = createFilename(locale, category, getBusinessDateString());

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
  category,
  rows,
}: {
  exportedBy: string;
  exportDate: string;
  locale: Locale;
  category: FleetVehicleCategory;
  rows: FleetVehicle[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Faris Group";
  workbook.created = new Date();

  const titleArabic = category === "car" ? "السيارات" : "الدراجات النارية";
  const titleEnglish = category === "car" ? "Cars" : "Motorcycles";

  const worksheet = workbook.addWorksheet(locale === "ar" ? titleArabic : titleEnglish, {
    views: [{ rightToLeft: locale === "ar", state: "frozen", ySplit: 5 }],
  });
  
  worksheet.columns = [
    { key: "vehicleType", width: 18 },
    { key: "plateNumber", width: 18 },
    { key: "ownershipType", width: 18 },
    { key: "owner", width: 28 },
    { key: "assignedDriver", width: 28 },
    { key: "authorizedPerson", width: 28 },
    { key: "operatingCardNumber", width: 18 },
    { key: "operatingCardExpiryDate", width: 18 },
    { key: "authorizationExpiryDate", width: 18 },
    { key: "operationalStatus", width: 18 },
    { key: "technicalStatus", width: 18 },
    { key: "serialNumber", width: 18 },
    { key: "brand", width: 18 },
    { key: "ownerIdentifier", width: 18 },
    { key: "authorizationNumber", width: 18 },
    { key: "faultLocation", width: 18 },
    { key: "technicalStatusNote", width: 32 },
    { key: "createdAt", width: 18 },
    { key: "archivedAt", width: 18 },
  ];

  worksheet.getCell("A1").value = locale === "ar" ? `مجموعة الفارس - أسطول ${titleArabic}` : `Al Faris Group - Fleet ${titleEnglish}`;
  worksheet.getCell("A2").value = exportDate;
  worksheet.getCell("A3").value = exportedBy;

  const headerArabic = [
    "نوع المركبة",
    "رقم اللوحة",
    "نوع الملكية",
    "المالك",
    "السائق المعين",
    "المفوض",
    "رقم بطاقة التشغيل",
    "انتهاء بطاقة التشغيل",
    "انتهاء التفويض",
    "الحالة التشغيلية",
    "الحالة الفنية",
    "الرقم التسلسلي",
    "العلامة التجارية",
    "معرف المالك",
    "رقم التفويض",
    "موقع العطل",
    "ملاحظة الحالة الفنية",
    "تاريخ الإنشاء",
    "تاريخ الأرشفة",
  ];

  const headerEnglish = [
    "Vehicle Type",
    "Plate Number",
    "Ownership Type",
    "Owner",
    "Assigned Driver",
    "Authorized Person",
    "Operating Card Number",
    "Operating Card Expiry",
    "Authorization Expiry",
    "Operational Status",
    "Technical Status",
    "Serial Number",
    "Brand",
    "Owner Identifier",
    "Authorization Number",
    "Fault Location",
    "Tech Status Note",
    "Created At",
    "Archived At",
  ];

  worksheet.addRow(locale === "ar" ? headerEnglish : headerArabic);
  worksheet.spliceRows(5, 1, locale === "ar" ? headerArabic : headerEnglish);

  for (const row of rows) {
    let assignedDriver = "";
    if (row.assignedDriverName) {
      assignedDriver = row.assignedDriverName;
    } else if (row.linkedDrivers && row.linkedDrivers.length > 0) {
      assignedDriver = row.linkedDrivers.map((d) => d.fullName).join(" | ");
    }

    const ownershipTypeLabel = row.ownershipType === "company_owned" ? "Company Owned"
      : row.ownershipType === "rental" ? "Rental"
      : row.ownershipType === "external_office" ? "External Office"
      : row.ownershipType === "individual" ? "Individual"
      : row.ownershipType === "driver_owned" ? "Driver Owned"
      : row.ownershipType === "other" ? "Other"
      : "";

    worksheet.addRow([
      row.vehicleType,
      row.plateNumber,
      ownershipTypeLabel,
      row.currentOwnerName || "",
      assignedDriver,
      row.authorizedPersonName || "",
      row.operatingCardNumber || "",
      row.operatingCardExpiryDate || "",
      row.authorizationExpiryDate || "",
      row.operationalStatus === "active" ? "Active" : "Suspended",
      row.technicalStatus === "healthy" ? "Healthy" : row.technicalStatus === "fault" ? "Fault" : "Accident",
      row.serialNumber || "",
      row.brand || "",
      row.ownerIdentifier || "",
      row.authorizationNumber || "",
      row.faultLocation === "parked" ? "Parked" : row.faultLocation === "in_maintenance" ? "In Maintenance" : "",
      row.technicalStatusNote || "",
      (row as any).createdAt ? new Date((row as any).createdAt).toISOString().split('T')[0] : "",
      row.archivedAt ? new Date(row.archivedAt).toISOString().split('T')[0] : "",
    ]);
  }

  return workbook;
}

function createFilename(locale: Locale, category: string, dateString: string) {
  const prefix = `fleet-${category}`;
  return `${prefix}-${dateString}.xlsx`;
}

function createContentDisposition(filename: string) {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}
