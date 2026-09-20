"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveShiftChangeRequestAction, rejectShiftChangeRequestAction } from "@/features/shift-requests/actions";
import type { ShiftChangeRequest } from "@/features/shift-requests/queries";
import type { Dictionary } from "@/i18n/dictionaries";

type DictionaryPart = Dictionary["dashboard"]["appRequests"]["shiftRequests"];

export function ShiftRequestsTable({ rows, canReview, dictionary }: { rows: ShiftChangeRequest[]; canReview: boolean; dictionary: DictionaryPart }) {
  const [selected, setSelected] = useState<ShiftChangeRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const statusLabel = (row: ShiftChangeRequest) => dictionary.statusLabels[row.derived_status];
  const statusMessage = (row: ShiftChangeRequest) => dictionary.statusMessages[row.derived_status].replace("{date}", formatBusinessDate(row.requested_week_start_date));
  const handleAction = () => {
    if (!selected || !actionType) return;
    setErrorMessage("");
    startTransition(async () => {
      const result = await (actionType === "approve" ? approveShiftChangeRequestAction : rejectShiftChangeRequestAction)(selected.id, reviewNote);
      if (result.success) { setSelected(null); setActionType(null); setReviewNote(""); router.refresh(); }
      else setErrorMessage(dictionary.processFailed);
    });
  };
  return <>
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[1200px] border-collapse text-start text-sm">
        <thead className="border-b border-border bg-background text-xs font-bold uppercase text-muted"><tr>
          {[dictionary.driver, dictionary.driverId, dictionary.currentShift, dictionary.requestedShift, dictionary.executionDate, dictionary.requestDate, dictionary.reviewDate, dictionary.status, dictionary.driverNote, dictionary.reviewNote, ...(canReview ? [dictionary.actions] : [])].map((label) => <th key={label} className="p-4 text-start font-bold text-navy">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? <tr><td colSpan={canReview ? 11 : 10} className="p-8 text-center text-muted">{dictionary.unavailable}</td></tr> : rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-slate-50">
            <td className="p-4 font-semibold text-navy">{row.driver_name}</td>
            <td className="p-4 font-mono text-slate-500">{row.driver_identifier || dictionary.unavailable}</td>
            <td className="p-4 font-medium text-slate-700">{row.current_shift_name}</td>
            <td className="p-4 font-bold text-primary">{row.requested_shift_name}</td>
            <td className="p-4 font-semibold text-slate-600">{formatBusinessDate(row.requested_week_start_date)}</td>
            <td className="p-4 font-mono text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
            <td className="p-4 font-mono text-slate-500">{row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString() : "-"}</td>
            <td className="p-4"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${getStatusTone(row.derived_status)}`}>{statusLabel(row)}</span><p className="mt-1 text-xs font-semibold text-slate-500">{statusMessage(row)}</p></td>
            <td className="max-w-50 truncate p-4 text-slate-600" title={row.driver_note || ""}>{row.driver_note || "-"}</td>
            <td className="max-w-50 truncate p-4 text-slate-600" title={row.review_note || ""}>{row.review_note || "-"}</td>
            {canReview ? <td className="space-x-2 p-4 rtl:space-x-reverse">{row.status === "pending" ? <><button onClick={() => { setSelected(row); setActionType("approve"); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">{dictionary.approve}</button><button onClick={() => { setSelected(row); setActionType("reject"); }} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">{dictionary.reject}</button></> : <span className="text-xs font-semibold text-slate-400">{dictionary.reviewed}</span>}</td> : null}
          </tr>)}
        </tbody>
      </table>
    </div>
    {selected && actionType ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"><div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
      <h3 className="mb-4 text-lg font-bold text-navy">{actionType === "approve" ? dictionary.confirmApprove : dictionary.confirmReject}</h3>
      <p className="mb-4 text-sm font-semibold text-slate-600">{dictionary.aboutTo.replace("{action}", actionType === "approve" ? dictionary.approveAction : dictionary.rejectAction)} <span className="font-bold text-navy">{selected.driver_name}</span> {dictionary.toShift} <span className="font-bold text-navy">{selected.requested_shift_name}</span>.</p>
      <label htmlFor="review_note" className="mb-1.5 block text-xs font-bold text-slate-500">{dictionary.notes}</label>
      <textarea id="review_note" rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={dictionary.notesPlaceholder} className="mb-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-navy" />
      {errorMessage ? <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{errorMessage}</p> : null}
      <div className="flex justify-end gap-2"><button disabled={isPending} onClick={() => { setSelected(null); setActionType(null); }} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500">{dictionary.cancel}</button><button disabled={isPending} onClick={handleAction} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">{isPending ? dictionary.processing : dictionary.confirm}</button></div>
    </div></div> : null}
  </>;
}

function getStatusTone(status: ShiftChangeRequest["derived_status"]) { if (status === "scheduled") return "bg-sky-100 text-sky-800"; if (status === "completed") return "bg-emerald-100 text-emerald-800"; if (status === "review_needed") return "bg-orange-100 text-orange-800"; if (status === "rejected") return "bg-rose-100 text-rose-800"; return "bg-amber-100 text-amber-800"; }
function formatBusinessDate(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
