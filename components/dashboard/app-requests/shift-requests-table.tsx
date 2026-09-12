"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveShiftChangeRequestAction,
  rejectShiftChangeRequestAction,
} from "@/features/shift-requests/actions";
import type { ShiftChangeRequest } from "@/features/shift-requests/queries";

export function ShiftRequestsTable({
  rows,
  canReview,
}: {
  rows: ShiftChangeRequest[];
  canReview: boolean;
}) {
  const [selected, setSelected] = useState<ShiftChangeRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAction = async () => {
    if (!selected || !actionType) return;

    setErrorMessage("");
    startTransition(async () => {
      const action =
        actionType === "approve"
          ? approveShiftChangeRequestAction
          : rejectShiftChangeRequestAction;

      const result = await action(selected.id, reviewNote);

      if (result.success) {
        setSelected(null);
        setReviewNote("");
        setActionType(null);
        router.refresh();
      } else {
        setErrorMessage(
          result.error ||
            "تعذر معالجة طلب تغيير الشيفت. حاول مرة أخرى.",
        );
      }
    });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[1200px] border-collapse text-start text-sm">
          <thead className="border-b border-border bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <th className="p-4 text-start font-bold text-navy">المندوب</th>
              <th className="p-4 text-start font-bold text-navy">معرف المندوب</th>
              <th className="p-4 text-start font-bold text-navy">الشيفت الحالي</th>
              <th className="p-4 text-start font-bold text-navy">الشيفت المطلوب</th>
              <th className="p-4 text-start font-bold text-navy">تاريخ التنفيذ</th>
              <th className="p-4 text-start font-bold text-navy">تاريخ الطلب</th>
              <th className="p-4 text-start font-bold text-navy">تاريخ المراجعة</th>
              <th className="p-4 text-start font-bold text-navy">الحالة</th>
              <th className="p-4 text-start font-bold text-navy">ملاحظة المندوب</th>
              <th className="p-4 text-start font-bold text-navy">ملاحظة المراجعة</th>
              {canReview ? (
                <th className="p-4 text-start font-bold text-navy">الإجراءات</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="p-4 font-semibold text-navy">{row.driver_name}</td>
                <td className="p-4 font-mono text-slate-500">
                  {row.driver_identifier || "غير متاح"}
                </td>
                <td className="p-4 font-medium text-slate-700">
                  {row.current_shift_name}
                </td>
                <td className="p-4 font-bold text-primary">
                  {row.requested_shift_name}
                </td>
                <td className="p-4 font-semibold text-slate-600">
                  {formatBusinessDate(row.requested_week_start_date)}
                </td>
                <td className="p-4 font-mono text-slate-500">
                  {new Date(row.created_at).toLocaleDateString("ar-EG")}
                </td>
                <td className="p-4 font-mono text-slate-500">
                  {row.reviewed_at
                    ? new Date(row.reviewed_at).toLocaleDateString("ar-EG")
                    : "-"}
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${getStatusTone(
                      row.derived_status,
                    )}`}
                  >
                    {row.derived_status_label}
                  </span>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {row.derived_status_message}
                  </p>
                </td>
                <td
                  className="max-w-50 truncate p-4 text-slate-600"
                  title={row.driver_note || ""}
                >
                  {row.driver_note || "-"}
                </td>
                <td
                  className="max-w-50 truncate p-4 text-slate-600"
                  title={row.review_note || ""}
                >
                  {row.review_note || "-"}
                </td>
                {canReview ? (
                  <td className="space-x-2 p-4 rtl:space-x-reverse">
                    {row.status === "pending" ? (
                      <>
                        <button
                          onClick={() => {
                            setSelected(row);
                            setActionType("approve");
                            setErrorMessage("");
                          }}
                          className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-emerald-700"
                        >
                          موافقة
                        </button>
                        <button
                          onClick={() => {
                            setSelected(row);
                            setActionType("reject");
                            setErrorMessage("");
                          }}
                          className="cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-rose-700"
                        >
                          رفض
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">
                        تمت مراجعته
                      </span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && actionType ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-navy">
              {actionType === "approve"
                ? "تأكيد الموافقة على تغيير الشيفت"
                : "تأكيد رفض طلب التغيير"}
            </h3>
            <p className="mb-4 text-sm font-semibold text-slate-600">
              أنت على وشك {actionType === "approve" ? "الموافقة على" : "رفض"} طلب تغيير شيفت المندوب{" "}
              <span className="font-bold text-navy">{selected.driver_name}</span> إلى شيفت{" "}
              <span className="font-bold text-navy">{selected.requested_shift_name}</span>.
            </p>

            <div className="mb-4">
              <label
                htmlFor="review_note"
                className="mb-1.5 block text-xs font-bold text-slate-500"
              >
                ملاحظات المراجعة
              </label>
              <textarea
                id="review_note"
                rows={3}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="اكتب ملاحظات الإدارة هنا..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {errorMessage ? (
              <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                disabled={isPending}
                onClick={() => {
                  setSelected(null);
                  setActionType(null);
                  setReviewNote("");
                  setErrorMessage("");
                }}
                className="cursor-pointer rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition-all hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                disabled={isPending}
                onClick={handleAction}
                className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50 ${
                  actionType === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isPending ? "جاري المعالجة..." : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getStatusTone(status: ShiftChangeRequest["derived_status"]) {
  if (status === "scheduled") return "bg-sky-100 text-sky-800";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "review_needed") return "bg-orange-100 text-orange-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function formatBusinessDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
