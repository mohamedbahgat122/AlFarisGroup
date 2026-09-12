"use client";

import { useState, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { 
  updateDriverResignationAction, 
  settleDriverResignationAction, 
  unsettleDriverResignationAction, 
  deleteDriverResignationAction 
} from "@/features/driver-resignations/actions";
import type { DriverResignation } from "@/features/driver-resignations/types";
import type { Dictionary } from "@/i18n/dictionaries";

function ActionButton({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-lg border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        destructive
          ? "border-danger/20 text-danger hover:bg-danger-soft"
          : "border-border text-muted hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function ResignationRowActions({
  resignation,
  organizationId,
  dictionary,
}: {
  resignation: DriverResignation;
  organizationId: string;
  dictionary: Dictionary["dashboard"]["drivers"];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeModal, setActiveModal] = useState<"edit" | "settle" | "unsettle" | "delete" | null>(null);
  const [error, setError] = useState("");

  const handleEdit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    const ratingValue = formData.get("rating") as string;
    
    if (!ratingValue) {
      setError(dictionary.rating ? `يرجى اختيار ${dictionary.rating}` : "الرجاء اختيار التقييم");
      return;
    }

    startTransition(async () => {
      const result = await updateDriverResignationAction(organizationId, resignation.id, {
        resignationDate: formData.get("resignationDate") as string,
        ordersCount: parseInt(formData.get("ordersCount") as string) || 0,
        rating: ratingValue,
        notes: (formData.get("notes") as string) || "",
        newKeetaDriverId: (formData.get("newKeetaDriverId") as string) || null,
      });
      if (result.success) {
        setActiveModal(null);
      } else {
        setError(result.message || "Failed to update");
      }
    });
  };

  const handleAction = (action: () => Promise<any>) => {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setActiveModal(null);
      } else {
        setError(result.message || "Action failed");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <ActionButton label="تعديل" onClick={() => setActiveModal("edit")}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </ActionButton>

        {!resignation.isSettled ? (
          <ActionButton label="تأكيد التسوية" onClick={() => setActiveModal("settle")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </ActionButton>
        ) : (
          <ActionButton label="إلغاء التسوية" onClick={() => setActiveModal("unsettle")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
              <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </ActionButton>
        )}

        <ActionButton label="حذف" destructive onClick={() => setActiveModal("delete")}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </ActionButton>
      </div>

      {activeModal === "edit" && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4 sm:p-0"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveModal(null)}
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]">
            <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
              <h2 className="text-xl font-bold text-navy">تعديل الاستقالة</h2>
              <button 
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              {error && <div className="mb-5 rounded-lg bg-danger/10 p-3 text-sm font-medium text-danger">{error}</div>}
              <form onSubmit={handleEdit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">{dictionary.tableDriver}</label>
                  <div className="min-h-11 w-full rounded-xl border border-border bg-gray-50 px-4 py-2 text-sm text-muted">
                    {resignation.driver.fullName} ({resignation.driver.iqamaNumber})
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">{dictionary.keetaIdAtResignation || "معرف كيتا عند الاستقالة"}</label>
                  <div className="min-h-11 w-full rounded-xl border border-border bg-gray-50 px-4 py-2 text-sm text-muted">
                    {resignation.keetaDriverId || dictionary.notAvailable || "غير متاح"}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">{(dictionary as any).newKeetaId || "معرف كيتا الجديد"} <span className="text-muted font-normal text-xs">(اختياري)</span></label>
                  <input
                    type="text"
                    name="newKeetaDriverId"
                    defaultValue={resignation.newKeetaDriverId || ""}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="أدخل معرف كيتا الجديد إن وجد"
                  />
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-navy">{dictionary.resignationDate || "تاريخ الاستقالة"}</label>
                    <input
                      type="date"
                      name="resignationDate"
                      defaultValue={resignation.resignationDate}
                      className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-navy">{dictionary.ordersCount || "عدد الطلبات"}</label>
                    <input
                      type="number"
                      name="ordersCount"
                      min="0"
                      defaultValue={resignation.ordersCount}
                      className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">{dictionary.rating || "التقييم"}</label>
                  <select
                    name="rating"
                    defaultValue={resignation.rating}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    required
                  >
                    <option value="">اختيار التقييم</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">{dictionary.notes || "ملاحظات"}</label>
                  <textarea
                    name="notes"
                    defaultValue={resignation.notes || ""}
                    className="min-h-24 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    rows={3}
                  />
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <button 
                    type="button" 
                    onClick={() => setActiveModal(null)}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:bg-primary-soft hover:text-primary"
                  >
                    إلغاء
                  </button>
                  <Button type="submit" disabled={isPending} className="min-h-12">
                    {isPending ? "..." : dictionary.save || "حفظ"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {(activeModal === "settle" || activeModal === "unsettle") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4 sm:p-0">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-navy">
              {activeModal === "settle" ? "تأكيد التسوية" : "إلغاء التسوية"}
            </h3>
            <p className="mb-6 text-sm text-muted">
              {activeModal === "settle" 
                ? "هل أنت متأكد من تأكيد التسوية والمحاسبة لهذا المندوب؟" 
                : "هل أنت متأكد من إلغاء حالة التسوية؟"}
            </p>
            {error && <div className="mb-4 text-sm text-danger">{error}</div>}
            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                disabled={isPending}
                onClick={() => setActiveModal(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-navy hover:bg-gray-100"
              >
                إلغاء
              </button>
              <Button 
                disabled={isPending}
                onClick={() => handleAction(() => activeModal === "settle" 
                  ? settleDriverResignationAction(organizationId, resignation.id) 
                  : unsettleDriverResignationAction(organizationId, resignation.id)
                )}
                className="h-11"
              >
                {isPending ? "..." : "تأكيد"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeModal === "delete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4 sm:p-0">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-danger">حذف الاستقالة</h3>
            <p className="mb-6 text-sm text-muted">
              هل أنت متأكد من حذف هذه الاستقالة بشكل نهائي؟ هذا الإجراء لن يؤثر على بيانات المندوب الأساسية.
            </p>
            {error && <div className="mb-4 text-sm text-danger">{error}</div>}
            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                disabled={isPending}
                onClick={() => setActiveModal(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-navy hover:bg-gray-100"
              >
                إلغاء
              </button>
              <button 
                type="button"
                disabled={isPending}
                onClick={() => handleAction(() => deleteDriverResignationAction(organizationId, resignation.id))}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-danger/90"
              >
                {isPending ? "..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
