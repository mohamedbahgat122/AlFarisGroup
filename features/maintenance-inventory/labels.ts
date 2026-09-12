import type { Locale } from "@/types/locale";

export function getMaintenanceInventoryLabels(locale: Locale) {
  const ar = locale === "ar";

  return {
    title: ar ? "مخزون الصيانة" : "Maintenance Inventory",
    description: ar
      ? "تسجيل مباشر لبواقي ومرتجعات مواد الصيانة حسب المؤسسة ومركز الصيانة."
      : "Direct tracking for leftover and returned maintenance inventory by organization and provider.",
    realtime: ar ? "تم تحديث مخزون الصيانة" : "Maintenance inventory updated",
    tableTitle: ar ? "سجلات المخزون" : "Inventory records",
    search: ar ? "البحث" : "Search",
    organization: ar ? "المؤسسة" : "Organization",
    provider: ar ? "مركز الصيانة" : "Maintenance provider",
    item: ar ? "الصنف" : "Item",
    category: ar ? "التصنيف" : "Category",
    recordType: ar ? "نوع السجل" : "Record type",
    quantity: ar ? "الكمية" : "Quantity",
    unit: ar ? "الوحدة" : "Unit",
    job: ar ? "أمر الصيانة" : "Maintenance job",
    note: ar ? "ملاحظة" : "Note",
    createdAt: ar ? "تاريخ الإضافة" : "Created at",
    actions: ar ? "الإجراءات" : "Actions",
    all: ar ? "الكل" : "All",
    apply: ar ? "تطبيق" : "Apply",
    reset: ar ? "مسح" : "Reset",
    addRecord: ar ? "إضافة سجل" : "Add record",
    createTitle: ar ? "إضافة سجل مخزون" : "Add inventory record",
    editTitle: ar ? "تعديل سجل مخزون" : "Edit inventory record",
    dialogDescription: ar
      ? "سجل الكمية كمعرف تشغيلي فقط بدون أي بيانات مالية."
      : "Record operational quantity only, without financial data.",
    close: ar ? "إغلاق" : "Close",
    cancel: ar ? "إلغاء" : "Cancel",
    save: ar ? "حفظ" : "Save",
    saving: ar ? "جاري الحفظ..." : "Saving...",
    edit: ar ? "تعديل" : "Edit",
    archive: ar ? "أرشفة" : "Archive",
    archiveConfirm: ar
      ? "هل تريد أرشفة سجل المخزون؟"
      : "Archive this inventory record?",
    previous: ar ? "السابق" : "Previous",
    next: ar ? "التالي" : "Next",
    empty: ar ? "لا توجد سجلات مخزون مطابقة." : "No matching inventory records.",
    notAvailable: ar ? "غير متاح" : "Not available",
    notLinked: ar ? "غير مرتبط" : "Not linked",
    error: ar
      ? "تعذر حفظ سجل المخزون. راجع البيانات وحاول مرة أخرى."
      : "Could not save the inventory record. Check the data and try again.",
    resultCount: (visible: number, total: number) =>
      ar
        ? `${visible.toLocaleString(locale)} من ${total.toLocaleString(locale)} سجل`
        : `${visible.toLocaleString(locale)} of ${total.toLocaleString(locale)} records`,
    page: (current: number, total: number) =>
      ar
        ? `صفحة ${current.toLocaleString(locale)} من ${total.toLocaleString(locale)}`
        : `Page ${current.toLocaleString(locale)} of ${total.toLocaleString(locale)}`,
    tabs: {
      all: ar ? "الكل" : "All",
      oil: ar ? "الزيوت" : "Oils",
      sparePart: ar ? "قطع الغيار" : "Spare parts",
      material: ar ? "المواد" : "Materials",
      returns: ar ? "المرتجعات" : "Returns",
    },
    categories: {
      oil: ar ? "زيوت" : "Oils",
      spare_part: ar ? "قطع غيار" : "Spare parts",
      material: ar ? "مواد" : "Materials",
    },
    recordTypes: {
      leftover: ar ? "بواقي" : "Leftover",
      returned: ar ? "مرتجع" : "Returned",
    },
    units: {
      liter: ar ? "لتر" : "Liter",
      piece: ar ? "قطعة" : "Piece",
      set: ar ? "طقم" : "Set",
      kg: ar ? "كجم" : "Kg",
      meter: ar ? "متر" : "Meter",
      other: ar ? "أخرى" : "Other",
    },
  };
}
