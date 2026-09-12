"use client";

import { useState, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addDriverResignationAction } from "@/features/driver-resignations/actions";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SimpleDriver } from "@/features/driver-resignations/types";

function PlusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

type Props = {
  dictionary: Dictionary["dashboard"]["drivers"];
  organizationCode: string;
  organizationId: string;
  drivers: SimpleDriver[];
};

export function AddResignationDialog({
  dictionary,
  organizationId,
  drivers,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  
  const [driverId, setDriverId] = useState("");

  const selectedDriver = drivers.find((d) => d.id === driverId);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    const ratingValue = formData.get("rating") as string;
    
    if (!ratingValue) {
      setError(dictionary.rating ? `يرجى اختيار ${dictionary.rating}` : "الرجاء اختيار التقييم");
      return;
    }
    
    const data = {
      driverId: formData.get("driverId") as string,
      resignationDate: formData.get("resignationDate") as string,
      ordersCount: parseInt(formData.get("ordersCount") as string) || 0,
      rating: ratingValue as "A" | "B" | "C" | "D",
      notes: (formData.get("notes") as string) || "",
      newKeetaDriverId: (formData.get("newKeetaDriverId") as string) || null,
    };

    if (!data.driverId) {
      setError(dictionary.selectDriver || "Please select a driver");
      return;
    }

    startTransition(async () => {
      const result = await addDriverResignationAction(organizationId, data);
      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message || "Failed to save resignation");
      }
    });
  };

  return (
    <>
      <Button 
        type="button"
        onClick={() => setOpen(true)}
        className="w-full gap-2 sm:w-auto"
      >
        <PlusIcon size={18} />
        {dictionary.addResignation}
      </Button>

      {open && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4 sm:p-0"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div 
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
          >
            <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-navy">{dictionary.addResignation}</h2>
              </div>
              <button 
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              {error && (
                <div className="mb-5 rounded-lg bg-danger/10 p-3 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">
                    {dictionary.selectDriver}
                  </label>
                  <select 
                    name="driverId"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    required
                  >
                    <option value="">{dictionary.selectDriver}</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.iqamaNumber})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDriver && (
                  <div className="rounded-xl border border-border bg-gray-50 p-4 text-sm">
                    <span className="font-semibold text-navy">{dictionary.keetaIdAtResignation || "معرف كيتا عند الاستقالة"}: </span>
                    <span className="text-muted">{selectedDriver.keetaDriverId || dictionary.notAvailable || "غير متاح"}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">
                    {(dictionary as any).newKeetaId || "معرف كيتا الجديد"} <span className="text-muted font-normal text-xs">(اختياري)</span>
                  </label>
                  <input
                    type="text"
                    name="newKeetaDriverId"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="أدخل معرف كيتا الجديد إن وجد"
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-navy">
                      {dictionary.resignationDate || "تاريخ الاستقالة"}
                    </label>
                    <input
                      type="date"
                      name="resignationDate"
                      defaultValue={new Date().toLocaleDateString("en-CA")}
                      className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-navy">
                      {dictionary.ordersCount || "عدد الطلبات"}
                    </label>
                    <input
                      type="number"
                      name="ordersCount"
                      min="0"
                      defaultValue="0"
                      className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-navy">
                    {dictionary.rating || "التقييم"}
                  </label>
                  <select
                    name="rating"
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
                  <label className="block text-sm font-semibold text-navy">
                    {dictionary.notes || "ملاحظات"}
                  </label>
                  <textarea
                    name="notes"
                    className="min-h-24 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    rows={3}
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <button 
                    type="button" 
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    إلغاء
                  </button>
                  <Button type="submit" disabled={isPending} className="min-h-12">
                    {isPending ? "..." : dictionary.saveResignation || "حفظ الاستقالة"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
