import type { Locale } from "@/types/locale";

export function getMaintenanceStockLabels(locale: Locale) {
  const ar = locale === "ar";

  return {
    title: ar ? "مخزون الصيانة" : "Maintenance Stock",
    description: ar
      ? "إدارة أرصدة الزيوت وقطع الغيار ومواد الصيانة حسب المؤسسة ومركز الصيانة."
      : "Manage maintenance stock balances by organization and provider.",
    realtime: ar ? "تم تحديث مخزون الصيانة" : "Maintenance stock updated",
    search: ar ? "البحث" : "Search",
    organization: ar ? "المؤسسة" : "Organization",
    provider: ar ? "مركز الصيانة" : "Maintenance provider",
    category: ar ? "التصنيف" : "Category",
    status: ar ? "الحالة" : "Status",
    all: ar ? "الكل" : "All",
    active: ar ? "نشط" : "Active",
    archived: ar ? "مؤرشف" : "Archived",
    lowStock: ar ? "تحت الحد الأدنى" : "Low stock",
    outOfStock: ar ? "نفد المخزون" : "Out of stock",
    apply: ar ? "تطبيق" : "Apply",
    reset: ar ? "مسح" : "Reset",
    item: ar ? "الصنف" : "Item",
    unit: ar ? "الوحدة" : "Unit",
    sku: ar ? "كود/SKU" : "SKU",
    currentQuantity: ar ? "الكمية الحالية" : "Current quantity",
    physicalQuantity: ar ? "المخزون الفعلي" : "Physical stock",
    allocatedQuantity: ar ? "المخصص للمؤسسات" : "Allocated",
    unallocatedQuantity: ar ? "غير المخصص" : "Unallocated",
    minimumQuantity: ar ? "الحد الأدنى" : "Minimum",
    totalAdded: ar ? "إجمالي المضاف" : "Total added",
    totalConsumed: ar ? "إجمالي المستهلك" : "Total consumed",
    totalReturned: ar ? "إجمالي المرتجع" : "Total returned",
    lastMovement: ar ? "آخر حركة" : "Last movement",
    actions: ar ? "الإجراءات" : "Actions",
    createItem: ar ? "إضافة صنف" : "Add item",
    addQuantity: ar ? "إضافة كمية" : "Add quantity",
    allocateToOrganizations: ar ? "تخصيص للمؤسسات" : "Allocate to organizations",
    releaseFromAllocation: ar ? "إرجاع من التخصيص" : "Release allocation",
    edit: ar ? "تعديل" : "Edit",
    archive: ar ? "أرشفة" : "Archive",
    history: ar ? "سجل الحركات" : "Movement history",
    close: ar ? "إغلاق" : "Close",
    cancel: ar ? "إلغاء" : "Cancel",
    save: ar ? "حفظ" : "Save",
    saving: ar ? "جاري الحفظ..." : "Saving...",
    note: ar ? "ملاحظة" : "Note",
    movementType: ar ? "نوع الحركة" : "Movement type",
    quantity: ar ? "الكمية" : "Quantity",
    before: ar ? "قبل الحركة" : "Before",
    after: ar ? "بعد الحركة" : "After",
    job: ar ? "مهمة الصيانة" : "Maintenance job",
    actor: ar ? "بواسطة" : "Actor",
    date: ar ? "التاريخ" : "Date",
    notAvailable: ar ? "غير متاح" : "Not available",
    notLinked: ar ? "غير مرتبط" : "Not linked",
    empty: ar ? "لا توجد أصناف مخزون مطابقة." : "No matching stock items.",
    noHistory: ar ? "لا توجد حركات لهذا الصنف." : "No movements for this item.",
    readOnly: ar ? "للقراءة فقط" : "Read only",
    createTitle: ar ? "إضافة صنف مخزون" : "Add stock item",
    editTitle: ar ? "تعديل صنف مخزون" : "Edit stock item",
    movementTitle: ar ? "إضافة / تعديل كمية" : "Add or adjust quantity",
    allocationTitle: ar ? "تخصيص المخزون للمؤسسات" : "Allocate stock to organizations",
    releaseTitle: ar ? "إرجاع كمية من التخصيص" : "Release allocated stock",
    currentAllocations: ar ? "التخصيصات الحالية" : "Current allocations",
    noAllocations: ar
      ? "لا توجد تخصيصات حالية لهذا الصنف"
      : "No current allocations for this item.",
    stockMovements: ar ? "حركات المخزون" : "Stock movements",
    allocationMovements: ar ? "حركات التخصيص" : "Allocation movements",
    allocationDescription: ar
      ? "اختر المؤسسة والكمية المطلوب تخصيصها من الرصيد غير المخصص."
      : "Choose the organization and quantity to allocate from unallocated stock.",
    releaseDescription: ar
      ? "إرجاع الكمية يزيد الرصيد غير المخصص ولا يغير المخزون الفعلي."
      : "Releasing quantity increases unallocated stock without changing physical stock.",
    historyTitle: ar ? "سجل حركات الصنف" : "Item movement history",
    createDescription: ar
      ? "أنشئ الصنف أولاً بدون كمية، ثم أضف الرصيد من حركة مستقلة."
      : "Create the item first without quantity, then add stock through a separate movement.",
    movementDescription: ar
      ? "الرصيد النهائي يُحسب ويحفظ من الخادم بعد قفل الصنف."
      : "The final balance is computed server-side after locking the item.",
    archiveConfirm: ar
      ? "هل تريد أرشفة هذا الصنف؟ يجب أن يكون الرصيد الحالي صفر."
      : "Archive this item? Current quantity must be zero.",
    success: ar ? "تم حفظ مخزون الصيانة." : "Maintenance stock saved.",
    error: ar
      ? "تعذر حفظ مخزون الصيانة. راجع البيانات وحاول مرة أخرى."
      : "Could not save maintenance stock. Check the data and try again.",
    errorForCode: (code?: string) => {
      if (code?.includes("MAINTENANCE_STOCK_UNALLOCATED_QUANTITY_INSUFFICIENT")) {
        return ar
          ? "الكمية غير المخصصة في المخزون لا تكفي لهذا التخصيص."
          : "Unallocated stock is not enough for this allocation.";
      }

      if (code?.includes("MAINTENANCE_STOCK_ALLOCATION_QUANTITY_INSUFFICIENT")) {
        return ar
          ? "الكمية المتاحة في هذا التخصيص لا تكفي للإرجاع."
          : "This allocation does not have enough available quantity to release.";
      }

      if (code?.includes("MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND")) {
        return ar
          ? "لم يتم العثور على تخصيص نشط لهذه المؤسسة."
          : "No active allocation was found for this organization.";
      }

      if (code?.includes("MAINTENANCE_STOCK_ALLOCATION_IDEMPOTENCY_CONFLICT")) {
        return ar
          ? "تعذر إعادة المحاولة لأن بيانات عملية التخصيص تغيرت. ألغ العملية وابدأ عملية جديدة."
          : "Retry failed because the allocation payload changed. Cancel and start a new operation.";
      }

      if (code?.includes("MAINTENANCE_STOCK_ALLOCATION_TARGET_NOT_AVAILABLE")) {
        return ar
          ? "المؤسسة غير متاحة للتخصيص من هذا المخزون."
          : "This organization is not available for allocation from this stock item.";
      }

      return ar
        ? "تعذر حفظ مخزون الصيانة. راجع البيانات وحاول مرة أخرى."
        : "Could not save maintenance stock. Check the data and try again.";
    },
    page: (current: number, total: number) =>
      ar
        ? `صفحة ${current.toLocaleString(locale)} من ${total.toLocaleString(locale)}`
        : `Page ${current.toLocaleString(locale)} of ${total.toLocaleString(locale)}`,
    resultCount: (visible: number, total: number) =>
      ar
        ? `${visible.toLocaleString(locale)} من ${total.toLocaleString(locale)} صنف`
        : `${visible.toLocaleString(locale)} of ${total.toLocaleString(locale)} items`,
    tabs: {
      all: ar ? "كل الأصناف" : "All items",
      active: ar ? "الأصناف النشطة" : "Active items",
      lowStock: ar ? "تحت الحد" : "Low stock",
      outOfStock: ar ? "نفد المخزون" : "Out of stock",
      archived: ar ? "المؤرشف" : "Archived",
      lowOrOut: ar ? "منخفض / نافد" : "Low / out",
    },
    categories: {
      oil: ar ? "زيوت" : "Oils",
      spare_part: ar ? "قطع غيار" : "Spare parts",
      material: ar ? "مواد" : "Materials",
    },
    units: {
      liter: ar ? "لتر" : "Liter",
      piece: ar ? "قطعة" : "Piece",
      set: ar ? "طقم" : "Set",
      kg: ar ? "كجم" : "Kg",
      meter: ar ? "متر" : "Meter",
      other: ar ? "أخرى" : "Other",
    },
    movementTypes: {
      opening_balance: ar ? "رصيد افتتاحي" : "Opening balance",
      stock_in: ar ? "إضافة مخزون" : "Stock in",
      consume: ar ? "استهلاك" : "Consume",
      return: ar ? "مرتجع" : "Return",
      adjustment_in: ar ? "تسوية بالزيادة" : "Adjustment in",
      adjustment_out: ar ? "تسوية بالنقص" : "Adjustment out",
    },
    allocationMovementTypes: {
      allocate: ar ? "تخصيص" : "Allocate",
      release: ar ? "إرجاع من التخصيص" : "Release allocation",
      consume: ar ? "استهلاك في الصيانة" : "Maintenance consumption",
    },
  };
}
