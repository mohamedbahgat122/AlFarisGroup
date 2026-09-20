import "server-only";
import ExcelJS from "exceljs";
import type { OrderReportRow } from "@/features/driver-order-reports/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 200;
const H = {
  date: "التاريخ", driverId: "معرّف السائق", driverName: "اسم السائق", supervisor: "المشرف", vehicleType: "نوع المركبة", courierType: "courier_type_name",
  attendance: "فترة الوردية_schedule_valid_online_attendance_summary", onShift: "فترة الوردية_هل أنت في الوردية؟", partner: "فترة الوردية_شريك التوصيل الصالح؟", connection: "فترة الوردية_وقت اتصال السائقين عبر تطبيق السائق.", validOnline: "فترة الوردية_courier_valid_online_duration", peak: "فترة الوردية_ساعات الاتصال في وقت الذروة",
  accepted: " أحجام المهام_المهام المقبولة", restaurant: " أحجام المهام_المهام ذات الطلبات اللازم وصولها إلى المطاعم", delivered: " أحجام المهام_المهام التي تم تسليمها", largeCompleted: " أحجام المهام_مهام الطلبات الكبيرة المكتملة", rejected: " أحجام المهام_ المهام المرفوضة", driverRejected: " أحجام المهام_المهام المرفوضة (السائق)", automaticRejected: " أحجام المهام_المهام المرفوضة تلقائيًا (تلقائياً)", cancellationRate: " أحجام المهام_معدل الإلغاء بسبب مشاكل التوصيل", completionRate: " أحجام المهام_معدل اكتمال الطلبات (غير متعلق بالتوصيل)",
  onTime: "تجربة التوصيل_نسبة الطلبات التي تم تسليمها في الوقت المحدد (D)", largeOnTime: "تجربة التوصيل_معدل توصيل الطلبات الكبيرة في الوقت المُحدَّد", averageDuration: "تجربة التوصيل_متوسط مدة التوصيل لكل طلب مكتمل", over55: "تجربة التوصيل_نسبة الطلبات المُسلمة (أكثر من 55 دقيقة).", late: "تجربة التوصيل_مهام الطلبات المتأخرة", veryLate: "تجربة التوصيل_مهام الطلبات المتأخرة جدًا",
} as const;
type ActiveDriver = { id: string; full_name: string; keeta_driver_id: string | null };
type Parsed = { rows: Omit<OrderReportRow, "id" | "driverExpiries" | "dailyFuelQuantityLitres" | "dailyFuelAmountSar" | "dailyDistanceKm" | "monthlyDeliveredOrders" | "monthlyFuelAmountSar" | "monthlyDistanceKm">[]; reportDate: string; unmatchedDriverIds: string[]; invalidRowCount: number };
type ParseFailure = {
  success: false;
  code: string;
  details?: string[];
  reportDate?: string;
  diagnostics?: { parsedRowCount: number; invalidRowCount: number; unmatchedDriverIds: string[] };
};

export async function parseOrderReportFile(file: File, drivers: ActiveDriver[]): Promise<{ success: true; data: Parsed } | ParseFailure> {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size <= 0 || file.size > MAX_FILE_BYTES) return { success: false, code: "invalid_excel" };
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); } catch { return { success: false, code: "invalid_excel" }; }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS) return { success: false, code: "worksheet_not_found" };
  const headerValues = (sheet.getRow(1).values as unknown[]).slice(1).map(readCellText);
  const index = new Map<string, number>();
  headerValues.forEach((value, offset) => { const key = normalizeHeader(value); if (key && !index.has(key)) index.set(key, offset + 1); });
  const required = [H.date, H.driverId, H.driverName, H.validOnline, H.accepted, H.delivered];
  const missing = required.filter((header) => !index.has(normalizeHeader(header)));
  if (missing.length) return { success: false, code: "missing_headers", details: missing };
  const byKeeta = new Map(drivers.filter((driver) => driver.keeta_driver_id).map((driver) => [driver.keeta_driver_id!, driver]));
  const rows: Parsed["rows"] = []; const unmatched = new Set<string>(); const seen = new Set<string>(); const issues: string[] = []; let reportDate = ""; let invalidRowCount = 0;
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber); const values = (row.values as unknown[]).slice(1);
    if (values.every((value) => value == null || String(value).trim() === "")) continue;
    const raw = (header: string) => row.getCell(index.get(normalizeHeader(header)) ?? 0).value;
    const dateValue = raw(H.date); const date = parseDate(dateValue);
    if (!date) { invalidRowCount++; issues.push(rowIssue(rowNumber, H.date, dateValue, "invalid_date")); continue; }
    if (reportDate && date !== reportDate) { invalidRowCount++; issues.push(rowIssue(rowNumber, H.date, dateValue, "mixed_report_date")); continue; }
    reportDate ||= date;
    const externalId = String(raw(H.driverId) ?? "").trim();
    if (!externalId) { invalidRowCount++; issues.push(rowIssue(rowNumber, H.driverId, null, "missing_driver_id")); continue; }
    const driver = byKeeta.get(externalId);
    if (!driver) { unmatched.add(externalId); invalidRowCount++; issues.push(rowIssue(rowNumber, H.driverId, externalId, "unmatched_driver_id")); continue; }
    if (seen.has(externalId)) { invalidRowCount++; issues.push(rowIssue(rowNumber, H.driverId, externalId, "duplicate_driver_id")); continue; } seen.add(externalId);
    const text = (header: string) => { const value = raw(header); return value == null ? null : String(value).trim(); };
    const num = (header: string) => parseNumber(raw(header));
    rows.push({ driverId: driver.id, driverFullName: driver.full_name, keetaDriverId: externalId, supervisor: text(H.supervisor), vehicleType: text(H.vehicleType), courierType: text(H.courierType), attendanceSummary: text(H.attendance), onShift: text(H.onShift), eligiblePartner: text(H.partner), driverConnectionDuration: text(H.connection), validOnlineDuration: text(H.validOnline), peakOnlineDuration: text(H.peak), acceptedTasks: num(H.accepted), restaurantTasks: num(H.restaurant), deliveredTasks: num(H.delivered), largeCompletedTasks: num(H.largeCompleted), rejectedTasks: num(H.rejected), driverRejectedTasks: num(H.driverRejected), automaticRejectedTasks: num(H.automaticRejected), deliveryCancellationRate: nullableNumber(raw(H.cancellationRate)), nonDeliveryCompletionRate: nullableNumber(raw(H.completionRate)), onTimeDeliveryRate: nullableNumber(raw(H.onTime)), largeOrderOnTimeRate: nullableNumber(raw(H.largeOnTime)), averageDeliveryDuration: nullableNumber(raw(H.averageDuration)), over55MinutesRate: nullableNumber(raw(H.over55)), lateTasks: num(H.late), veryLateTasks: num(H.veryLate), sourceData: sourceData(headerValues, row) });
  }
  const diagnostics = { parsedRowCount: rows.length, invalidRowCount, unmatchedDriverIds: [...unmatched] };
  if (!reportDate) return { success: false, code: "invalid_row", details: issues, diagnostics };
  if (rows.length === 0 && unmatched.size > 0) return { success: false, code: "unmatched_driver_id", reportDate, details: issues, diagnostics };
  if (rows.length === 0) return { success: false, code: "invalid_row", reportDate, details: issues, diagnostics };
  return { success: true, data: { rows, reportDate, unmatchedDriverIds: [...unmatched], invalidRowCount } };
}
function rowIssue(rowNumber: number, field: string, value: unknown, reason: string): string { const displayValue = value == null || String(value).trim() === "" ? "(empty)" : String(value).trim().slice(0, 120); return `Row ${rowNumber} | ${field} | ${displayValue} | ${reason}`; }
function parseNumber(value: unknown): number { if (value == null || String(value).trim() === "" || String(value).trim() === "-") return 0; const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace("%", "").trim()); return Number.isFinite(n) ? n : 0; }
function nullableNumber(value: unknown): number | null { if (value == null || String(value).trim() === "" || String(value).trim() === "-") return null; const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace("%", "").trim()); return Number.isFinite(n) ? n : null; }
function sourceData(headers: string[], row: ExcelJS.Row): Record<string, unknown> { const counts = new Map<string, number>(); return Object.fromEntries(headers.map((header, offset) => { const count = (counts.get(header) ?? 0) + 1; counts.set(header, count); return [`${header || `column_${offset + 1}`}${count > 1 ? ` #${count}` : ""}`, row.getCell(offset + 1).value ?? null]; })); }
function parseDate(value: unknown): string | null { const text = String(value ?? "").trim(); const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/); if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`; const serial = typeof value === "number" ? value : Number(value); if (Number.isFinite(serial) && serial > 30000 && serial < 100000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10); const separated = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/); return separated ? `${separated[1]}-${separated[2]}-${separated[3]}` : null; }
function readCellText(value: unknown): string { if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part && typeof part === "object" && "text" in part ? String(part.text) : "").join(""); return String(value ?? ""); }
function normalizeHeader(value: string): string { return value.normalize("NFKC").replace(/[\u0640\u064B-\u065F\u0670]/g, "").replace(/[\u00A0\u2007\u202F]/g, " ").replace(/\s+/g, " ").trim(); }
