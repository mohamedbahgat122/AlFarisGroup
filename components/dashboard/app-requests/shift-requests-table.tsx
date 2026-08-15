"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveShiftChangeRequestAction, rejectShiftChangeRequestAction } from "@/features/shift-requests/actions";
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
 const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
 const [isPending, startTransition] = useTransition();
 const router = useRouter();

 const handleAction = async () => {
 if (!selected || !actionType) return;

 startTransition(async () => {
  const action = actionType === "approve" 
  ? approveShiftChangeRequestAction 
  : rejectShiftChangeRequestAction;

  const result = await action(selected.id, reviewNote);

  if (result.success) {
  setSelected(null);
  setReviewNote("");
  setActionType(null);
  router.refresh();
  } else {
  alert(result.error || "حدث خطأ ما");
  }
 });
 };

 return (
 <>
  <div className="overflow-x-auto border border-border bg-surface rounded-xl shadow-sm">
  <table className="w-full min-w-250 border-collapse text-start text-sm">
   <thead className="bg-background text-xs font-bold uppercase text-muted border-b border-border">
   <tr>
    <th className="p-4 text-start font-bold text-navy">المندوب</th>
    <th className="p-4 text-start font-bold text-navy">معرف المندوب</th>
    <th className="p-4 text-start font-bold text-navy">الشيفت الحالي</th>
    <th className="p-4 text-start font-bold text-navy">الشيفت المطلوب</th>
    <th className="p-4 text-start font-bold text-navy">الأسبوع المطلوب له</th>
    <th className="p-4 text-start font-bold text-navy">تاريخ تقديم الطلب</th>
    <th className="p-4 text-start font-bold text-navy">حالة الطلب</th>
    <th className="p-4 text-start font-bold text-navy">ملاحظة المندوب</th>
    {canReview && <th className="p-4 text-start font-bold text-navy">الإجراءات</th>}
   </tr>
   </thead>
   <tbody className="divide-y divide-border">
   {rows.map((row) => (
    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
    <td className="p-4 font-semibold text-navy">{row.driver_name}</td>
    <td className="p-4 text-slate-500 font-mono">{row.driver_identifier || "غير متاح"}</td>
    <td className="p-4 text-slate-700 font-medium">{row.current_shift_name}</td>
    <td className="p-4 font-bold text-primary">{row.requested_shift_name}</td>
    <td className="p-4 text-slate-600 font-semibold">{row.requested_week_start_date}</td>
    <td className="p-4 text-slate-500 font-mono">
     {new Date(row.created_at).toLocaleDateString("ar-EG")}
    </td>
    <td className="p-4">
     <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm ${
     row.status === "pending" ? "bg-amber-100 text-amber-800" :
     row.status === "approved" ? "bg-emerald-100 text-emerald-800" :
     "bg-rose-100 text-rose-800"
     }`}>
     {row.status === "pending" ? "قيد الانتظار" :
      row.status === "approved" ? "مقبول" : "مرفوض"}
     </span>
    </td>
    <td className="p-4 text-slate-600 max-w-50 truncate" title={row.driver_note || ""}>
     {row.driver_note || "-"}
    </td>
    {canReview && (
     <td className="p-4 space-x-2 rtl:space-x-reverse">
     {row.status === "pending" ? (
      <>
      <button
       onClick={() => { setSelected(row); setActionType("approve"); }}
       className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow transition-all cursor-pointer"
      >
       موافقة
      </button>
      <button
       onClick={() => { setSelected(row); setActionType("reject"); }}
       className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow transition-all cursor-pointer"
      >
       رفض
      </button>
      </>
     ) : (
      <span className="text-xs text-slate-400 font-semibold">تمت مراجعته</span>
     )}
     </td>
    )}
    </tr>
   ))}
   </tbody>
  </table>
  </div>

  {/* Confirmation Modal */}
  {selected && actionType && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
   <div className="bg-surface border border-border w-full max-w-md rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in duration-200">
   <h3 className="text-lg font-bold text-navy mb-4">
    {actionType === "approve" ? "تأكيد الموافقة على تغيير الشيفت" : "تأكيد رفض طلب التغيير"}
   </h3>
   <p className="text-sm font-semibold text-slate-600 mb-4">
    أنت على وشك {actionType === "approve" ? "الموافقة على" : "رفض"} طلب تغيير شيفت المندوب{" "}
    <span className="font-bold text-navy">{selected.driver_name}</span> إلى شيفت{" "}
    <span className="font-bold text-navy">{selected.requested_shift_name}</span>.
   </p>

   <div className="mb-4">
    <label htmlFor="review_note" className="block text-xs font-bold text-slate-500 mb-1.5">
    ملاحظات المراجعة
    </label>
    <textarea
    id="review_note"
    rows={3}
    value={reviewNote}
    onChange={(e) => setReviewNote(e.target.value)}
    placeholder="اكتب ملاحظات الإدارة هنا..."
    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
    />
   </div>

   <div className="flex justify-end gap-2">
    <button
    disabled={isPending}
    onClick={() => { setSelected(null); setActionType(null); setReviewNote(""); }}
    className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
    >
    إلغاء
    </button>
    <button
    disabled={isPending}
    onClick={handleAction}
    className={`px-4 py-2 text-sm font-bold text-white rounded-xl shadow-md transition-all cursor-pointer ${
     actionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
    } disabled:opacity-50`}
    >
    {isPending ? "جاري المعالجة..." : "تأكيد"}
    </button>
   </div>
   </div>
  </div>
  )}
 </>
 );
}
