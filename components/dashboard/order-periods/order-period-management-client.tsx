"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { OrderPeriodManagementDictionary, OrderPeriodActionResult, OrderPeriodDriver, OrderPeriodTemplate, OrderPeriodWeek } from "@/features/order-periods/types";
import { archiveOrderPeriodTemplateAction, approveOrderShiftChangeRequestAction, moveOrderPeriodDriverAction, rejectOrderShiftChangeRequestAction, replaceOrderPeriodWeekMembersAction, saveOrderPeriodTemplateAction, saveOrderShiftChangeDaysAction, saveOrderPeriodOperationalPolicyAction, openDriverOrderPeriodAction, orderPeriodLifecycleAction } from "@/features/order-periods/actions";
import type { OrderShiftChangeRequest } from "@/features/order-periods/types";

type Props = {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: OrderPeriodManagementDictionary;
  templates: OrderPeriodTemplate[];
  drivers: OrderPeriodDriver[];
  weeks: { current: OrderPeriodWeek; next: OrderPeriodWeek };
  permissions: { manage: boolean; assign: boolean };
  orderShiftChangeSettings: number[];
  orderShiftChangeRequests: OrderShiftChangeRequest[];
};

const idle: OrderPeriodActionResult = { status: "idle" };
const inputClass = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-navy outline-none focus:border-primary";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60";
const secondaryClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-bold text-navy transition hover:border-primary/40 hover:text-primary";

export function OrderPeriodManagementClient({ locale, organizationCode, dictionary, templates, drivers, weeks, permissions, orderShiftChangeSettings, orderShiftChangeRequests }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [templateForm, setTemplateForm] = useState<{ mode: "create" | "edit"; template?: OrderPeriodTemplate } | null>(null);
  const [membersForm, setMembersForm] = useState<{ template: OrderPeriodTemplate; week: OrderPeriodWeek } | null>(null);
  const [moveForm, setMoveForm] = useState<{ templateId: string; driver: OrderPeriodDriver; week: OrderPeriodWeek } | null>(null);
  const [policyForm, setPolicyForm] = useState<OrderPeriodTemplate | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>(orderShiftChangeSettings);
  const [isSavingSettings, startSavingSettings] = useTransition();
  const [settingsSaveState, setSettingsSaveState] = useState<OrderPeriodActionResult>(idle);
  const handledSettingsSave = useRef<OrderPeriodActionResult | null>(null);
  const [requestBusy, startRequestAction] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState(saveOrderPeriodTemplateAction, idle);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveOrderPeriodTemplateAction, idle);
  const [membersState, membersAction, membersPending] = useActionState(replaceOrderPeriodWeekMembersAction, idle);
  const [moveState, moveAction, movePending] = useActionState(moveOrderPeriodDriverAction, idle);
  const [actionBusy, startAction] = useTransition();

  useEffect(() => {
    const state = [saveState, archiveState, membersState, moveState].find((item) => item.status !== "idle");
    if (!state) return;
    if (state.status === "success") {
      setToast(state.message);
      setTemplateForm(null);
      setMembersForm(null);
      setMoveForm(null);
      setPolicyForm(null);
      router.refresh();
    }
  }, [archiveState, membersState, moveState, saveState]);

  useEffect(() => {
    if (settingsSaveState.status === "idle" || handledSettingsSave.current === settingsSaveState) return;
    handledSettingsSave.current = settingsSaveState;
    setToast(settingsSaveState.message);
    if (settingsSaveState.status === "success") {
      setSettingsOpen(false);
      router.refresh();
    }
  }, [router, settingsSaveState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-black text-navy">{dictionary.title}</h1>
            <p className="mt-1 text-sm leading-6 text-muted">{dictionary.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {permissions.manage ? <button type="button" className={secondaryClass} onClick={() => { setSelectedDays(orderShiftChangeSettings); setSettingsSaveState(idle); setSettingsOpen(true); }}>{dictionary.orderShiftChangeSettings}</button> : null}
            {permissions.manage ? <button type="button" className={buttonClass} onClick={() => setTemplateForm({ mode: "create" })}>+ {dictionary.addTemplate}</button> : null}
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-2">
          <WeekSection week={weeks.current} current templates={templates} title={dictionary.currentWeek} expanded={expanded} toggle={toggle} permissions={permissions} locale={locale} organizationCode={organizationCode} dictionary={dictionary} onEdit={(template: OrderPeriodTemplate) => setTemplateForm({ mode: "edit", template })} onMembers={(template: OrderPeriodTemplate, week: OrderPeriodWeek) => setMembersForm({ template, week })} onMove={(templateId: string, driver: OrderPeriodDriver, week: OrderPeriodWeek) => setMoveForm({ templateId, driver, week })} onPolicy={(template: OrderPeriodTemplate) => setPolicyForm(template)} onOpen={(template: OrderPeriodTemplate, driver: OrderPeriodDriver) => { if (!window.confirm(`${dictionary.openNowTitle}\n\n${dictionary.driver}: ${driver.fullName}\n${dictionary.identifier}: ${driver.keetaDriverId ?? "-"}\n${template.name} (${template.startTime} - ${template.endTime})\n\n${dictionary.openNowConfirm}`)) return; const form = new FormData(); form.set("locale", locale); form.set("organizationCode", organizationCode); form.set("templateId", template.id); form.set("driverId", driver.id); startAction(async () => { const result = await openDriverOrderPeriodAction(form); setToast(result.status === "success" || result.status === "error" ? result.message : dictionary.actionFailed); if (result.status === "success") router.refresh(); }); }} archiveAction={archiveAction} archivePending={archivePending} lifecycleBusy={actionBusy} runLifecycle={(kind: "publish" | "unpublish" | "disable" | "enable", template: OrderPeriodTemplate) => { if ((kind === "unpublish" && !window.confirm(dictionary.unpublishConfirm)) || (kind === "disable" && !window.confirm(dictionary.disableConfirm))) return; const form = new FormData(); form.set("locale", locale); form.set("organizationCode", organizationCode); form.set("templateId", template.id); startAction(async () => { const result = await orderPeriodLifecycleAction(kind, form); setToast(result.status === "success" || result.status === "error" ? result.message : dictionary.actionFailed); if (result.status === "success") router.refresh(); }); }} />
          <WeekSection week={weeks.next} templates={templates} title={dictionary.nextWeek} expanded={expanded} toggle={toggle} permissions={permissions} locale={locale} organizationCode={organizationCode} dictionary={dictionary} onEdit={(template: OrderPeriodTemplate) => setTemplateForm({ mode: "edit", template })} onMembers={(template: OrderPeriodTemplate, week: OrderPeriodWeek) => setMembersForm({ template, week })} onMove={(templateId: string, driver: OrderPeriodDriver, week: OrderPeriodWeek) => setMoveForm({ templateId, driver, week })} onPolicy={(template: OrderPeriodTemplate) => setPolicyForm(template)} onOpen={() => undefined} archiveAction={archiveAction} archivePending={archivePending} lifecycleBusy={actionBusy} runLifecycle={(kind: "publish" | "unpublish" | "disable" | "enable", template: OrderPeriodTemplate) => { if ((kind === "unpublish" && !window.confirm(dictionary.unpublishConfirm)) || (kind === "disable" && !window.confirm(dictionary.disableConfirm))) return; const form = new FormData(); form.set("locale", locale); form.set("organizationCode", organizationCode); form.set("templateId", template.id); startAction(async () => { const result = await orderPeriodLifecycleAction(kind, form); setToast(result.status === "success" || result.status === "error" ? result.message : dictionary.actionFailed); if (result.status === "success") router.refresh(); }); }} />
        </div>
        <OrderShiftChangeRequestsSection locale={locale} dictionary={dictionary} requests={orderShiftChangeRequests} canReview={permissions.assign} busy={requestBusy} onApprove={(request) => {
          const weekEnd = addDays(request.requestedWeekStartDate, 6);
          const message = `${dictionary.approveOrderShiftChangeConfirm}\n\n${dictionary.driver}: ${request.driverName}\n${dictionary.currentOrderShift}: ${request.currentTemplateName}\n${dictionary.requestedOrderShift}: ${request.requestedTemplateName}\n${dictionary.requestedWeek}: ${formatDateRange(request.requestedWeekStartDate, weekEnd, locale)}`;
          if (!window.confirm(message)) return;
          startRequestAction(async () => { const result = await approveOrderShiftChangeRequestAction(request.id, null, locale, organizationCode); setToast(result.status === "success" || result.status === "error" ? result.message : dictionary.actionFailed); if (result.status === "success") router.refresh(); });
        }} onReject={(request) => {
          if (!window.confirm(dictionary.rejectOrderShiftChangeConfirm)) return;
          const note = window.prompt(dictionary.reviewNote) ?? null;
          startRequestAction(async () => { const result = await rejectOrderShiftChangeRequestAction(request.id, note, locale, organizationCode); setToast(result.status === "success" || result.status === "error" ? result.message : dictionary.actionFailed); if (result.status === "success") router.refresh(); });
        }} />
      </div>

      {settingsOpen ? <OrderShiftChangeSettingsDialog locale={locale} dictionary={dictionary} selectedDays={selectedDays} pending={isSavingSettings} onClose={() => setSettingsOpen(false)} onSave={(days) => {
        const formData = new FormData(); formData.set("locale", locale); formData.set("organizationCode", organizationCode); days.forEach((day) => formData.append("allowedWeekdays", String(day)));
        startSavingSettings(async () => { const result = await saveOrderShiftChangeDaysAction(formData); setSettingsSaveState(result.status === "success" || result.status === "error" ? result : { status: "error", code: "action_failed", message: dictionary.actionFailed }); });
      }} /> : null}
      {templateForm ? <TemplateDialog locale={locale} organizationCode={organizationCode} dictionary={dictionary} form={templateForm} action={saveAction} pending={savePending} state={saveState} onClose={() => setTemplateForm(null)} /> : null}
      {membersForm ? <MembersDialog locale={locale} organizationCode={organizationCode} dictionary={dictionary} form={membersForm} drivers={drivers} action={membersAction} pending={membersPending} state={membersState} onClose={() => setMembersForm(null)} /> : null}
      {moveForm ? <MoveDialog locale={locale} organizationCode={organizationCode} dictionary={dictionary} form={moveForm} templates={templates} action={moveAction} pending={movePending} state={moveState} onClose={() => setMoveForm(null)} /> : null}
      {policyForm ? <OperationalPolicyDialog locale={locale} organizationCode={organizationCode} dictionary={dictionary} template={policyForm} onClose={() => setPolicyForm(null)} onNotify={setToast} onUpdated={router.refresh} /> : null}
      {toast ? <div className="fixed bottom-5 inset-e-5 z-80 rounded-xl border border-primary/20 bg-surface px-4 py-3 text-sm font-bold text-navy shadow-xl">{toast}</div> : null}
    </div>
  );
}

function OrderShiftChangeSettingsDialog({ locale, dictionary, selectedDays, pending, onClose, onSave }: { locale: "ar" | "en"; dictionary: OrderPeriodManagementDictionary; selectedDays: number[]; pending: boolean; onClose: () => void; onSave: (days: number[]) => void }) {
  const [days, setDays] = useState(selectedDays);
  return <Dialog title={dictionary.orderShiftChangeSettings} onClose={onClose}><div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-4"><p className="text-sm leading-6 text-muted">{dictionary.orderShiftChangeSettingsDescription}</p><div className="grid gap-3 sm:grid-cols-2">{dictionary.orderShiftChangeWeekdays.map((label, day) => <label key={day} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-navy"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...current, day].sort((a, b) => a - b) : current.filter((value) => value !== day))} className="h-4 w-4 accent-primary" />{label}</label>)}</div>{days.length === 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{dictionary.orderShiftChangeSettingsClosed}</p> : null}<div className="flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={onClose} disabled={pending}>{dictionary.orderShiftChangeCancel}</button><button type="button" className={buttonClass} onClick={() => onSave(days)} disabled={pending}>{pending ? dictionary.saving : dictionary.orderShiftChangeSave}</button></div></div></Dialog>;
}

function OrderShiftChangeRequestsSection({ locale, dictionary, requests, canReview, busy, onApprove, onReject }: { locale: "ar" | "en"; dictionary: OrderPeriodManagementDictionary; requests: OrderShiftChangeRequest[]; canReview: boolean; busy: boolean; onApprove: (request: OrderShiftChangeRequest) => void; onReject: (request: OrderShiftChangeRequest) => void }) {
  return <section className="space-y-3"><div><h2 className="text-lg font-black text-navy">{dictionary.orderShiftChangeRequests}</h2><p className="text-sm text-muted">{requests.length === 0 ? dictionary.orderShiftChangeRequestsEmpty : `${requests.length}`}</p></div>{requests.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm font-semibold text-muted">{dictionary.orderShiftChangeRequestsEmpty}</div> : <div className="grid gap-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-navy">{request.driverName || dictionary.driver}</h3><p className="text-xs text-muted" dir="ltr">{request.driverIdentifier ?? "-"}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{dictionary[request.status]}</span></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="font-bold text-muted">{dictionary.currentOrderShift}: </span>{request.currentTemplateName}</p><p><span className="font-bold text-muted">{dictionary.requestedOrderShift}: </span>{request.requestedTemplateName}</p><p><span className="font-bold text-muted">{dictionary.requestedWeek}: </span><span dir="ltr">{formatDateRange(request.requestedWeekStartDate, addDays(request.requestedWeekStartDate, 6), locale)}</span></p>{request.reason ? <p><span className="font-bold text-muted">{dictionary.reason}: </span>{request.reason}</p> : null}{request.reviewedAt ? <p><span className="font-bold text-muted">{request.status === "approved" ? dictionary.approvedBy : dictionary.rejectedBy}: </span>{request.reviewerName ?? dictionary.unavailable}<span className="mx-1">·</span><span dir="ltr">{formatDateTime(request.reviewedAt, locale)}</span></p> : null}{request.reviewNote ? <p><span className="font-bold text-muted">{dictionary.reviewNote}: </span>{request.reviewNote}</p> : null}</div>{request.status === "pending" && canReview ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => onApprove(request)}>{dictionary.approve}</button><button type="button" className={secondaryClass} disabled={busy} onClick={() => onReject(request)}>{dictionary.reject}</button></div> : null}</article>)}</div>}</section>;
}

function OperationalPolicyDialog({ locale, organizationCode, dictionary, template, onClose, onNotify, onUpdated }: any) {
  const [state, action, pending] = useActionState(saveOrderPeriodOperationalPolicyAction, idle);
  const handledSuccessState = useRef<OrderPeriodActionResult | null>(null);
  const [openBefore, setOpenBefore] = useState(template.openBeforeMinutes?.toString() ?? "");
  const [closeAfter, setCloseAfter] = useState(template.closeAfterMinutes?.toString() ?? "");
  const [minimumWork, setMinimumWork] = useState(template.minimumWorkMinutes?.toString() ?? "");

  useEffect(() => {
    if (state.status === "success" && handledSuccessState.current !== state) {
      handledSuccessState.current = state;
      onClose();
      onNotify(state.message);
      onUpdated();
    }
  }, [onClose, onNotify, onUpdated, state]);

  const preview = (time: string, delta: number) => {
    if (!time || !Number.isInteger(Number(delta))) return "-";
    const [hour, minute] = time.split(":").map(Number);
    const total = hour * 60 + minute + delta;
    return `${String(Math.floor((total + 1440) % 1440 / 60)).padStart(2, "0")}:${String((total + 1440) % 60).padStart(2, "0")}`;
  };
  return <Dialog title={dictionary.operationalSettings} onClose={onClose}><form action={action} className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}><HiddenContext locale={locale} organizationCode={organizationCode} /><input type="hidden" name="templateId" value={template.id} /><div className="rounded-lg bg-surface-raised p-3 text-sm font-bold text-navy"><p>{template.name}</p><p dir="ltr">{template.startTime} - {template.endTime}</p></div><label className="block text-sm font-bold text-navy">{dictionary.openBefore}<input className={inputClass} type="number" min="0" max="1440" name="openBeforeMinutes" value={openBefore} onChange={(event) => setOpenBefore(event.target.value)} placeholder={dictionary.unconfigured} /> <span className="text-xs text-muted">{dictionary.minutes}</span></label><label className="block text-sm font-bold text-navy">{dictionary.closeAfter}<input className={inputClass} type="number" min="0" max="1440" name="closeAfterMinutes" value={closeAfter} onChange={(event) => setCloseAfter(event.target.value)} placeholder={dictionary.unconfigured} /> <span className="text-xs text-muted">{dictionary.minutes}</span></label><label className="block text-sm font-bold text-navy">{dictionary.minimumWork}<input className={inputClass} type="number" min="1" max="1440" name="minimumWorkMinutes" value={minimumWork} onChange={(event) => setMinimumWork(event.target.value)} placeholder={dictionary.unconfigured} /> <span className="text-xs text-muted">{dictionary.minutes}</span></label><div className="rounded-lg border border-border px-3 py-2 text-sm text-muted"><p>{dictionary.operationalPreview}</p><p>{dictionary.opensAt}: <span dir="ltr">{openBefore ? preview(template.startTime, -Number(openBefore)) : "-"}</span></p><p>{dictionary.closesAt}: <span dir="ltr">{closeAfter ? preview(template.endTime, Number(closeAfter)) : "-"}</span></p></div><p className="text-sm leading-6 text-muted">{dictionary.operationalSettingsDescription}</p><ActionMessage state={state} /><div className="flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={onClose} disabled={pending}>{dictionary.cancel}</button><button type="submit" className={buttonClass} disabled={pending}>{pending ? dictionary.saving : dictionary.save}</button></div></form></Dialog>;
}

function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function formatDateRange(start: string, end: string, locale: "ar" | "en") { const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { day: "numeric", month: "long" }); return `${formatter.format(new Date(`${start}T00:00:00Z`))} - ${formatter.format(new Date(`${end}T00:00:00Z`))}`; }
function formatDateTime(value: string, locale: "ar" | "en") { return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function WeekSection({ week, current = false, title, templates, expanded, toggle, permissions, locale, organizationCode, dictionary, onEdit, onMembers, onMove, onPolicy, onOpen, archiveAction, archivePending, lifecycleBusy, runLifecycle }: any) {
  return <section className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-lg font-black text-navy">{title}</h2><p className="text-xs font-semibold text-muted" dir="ltr">{week.label}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{week.rows.length} / {templates.length}</span></div>
    {week.rows.map((row: any) => <TemplateRow key={`${week.key}-${row.template.id}`} row={row} week={week} current={current} expanded={expanded.has(`${week.key}-${row.template.id}`)} onToggle={() => toggle(`${week.key}-${row.template.id}`)} permissions={permissions} locale={locale} organizationCode={organizationCode} dictionary={dictionary} onEdit={onEdit} onMembers={onMembers} onMove={onMove} onPolicy={onPolicy} onOpen={onOpen} archiveAction={archiveAction} archivePending={archivePending} lifecycleBusy={lifecycleBusy} runLifecycle={runLifecycle} />)}
    <VirtualUnassignedRow week={week} expanded={expanded.has(`${week.key}-unassigned`)} onToggle={() => toggle(`${week.key}-unassigned`)} dictionary={dictionary} />
  </section>;
}

function TemplateRow({ row, week, current, expanded, onToggle, permissions, locale, organizationCode, dictionary, onEdit, onMembers, onMove, onPolicy, onOpen, archiveAction, archivePending, lifecycleBusy, runLifecycle }: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ids = row.drivers.map((driver: any) => driver.keetaDriverId).filter(Boolean);
  const stateLabel = row.template.archivedAt ? dictionary.archived : !row.template.isActive ? dictionary.disabled : !row.template.isPublished ? dictionary.unpublished : dictionary.published;
  return (
    <article className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={onToggle} className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-lg font-black text-navy" aria-label={expanded ? "Collapse" : "Expand"}>{expanded ? "−" : "+"}</button>
        <div className="min-w-[180px] flex-1">
          <h3 className="font-black text-navy">{row.template.name}</h3>
          <p className="mt-1 text-sm font-semibold text-muted" dir="ltr">{row.template.startTime} - {row.template.endTime} {row.template.crossesMidnight ? `• ${dictionary.overnight}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{stateLabel}</span>
            <span className="rounded bg-surface-raised px-2 py-1 text-muted">{dictionary.openBefore}: {row.template.openBeforeMinutes ?? dictionary.unconfigured} {row.template.openBeforeMinutes === null ? "" : dictionary.minutes}</span>
            <span className="rounded bg-surface-raised px-2 py-1 text-muted">{dictionary.closeAfter}: {row.template.closeAfterMinutes ?? dictionary.unconfigured} {row.template.closeAfterMinutes === null ? "" : dictionary.minutes}</span>
            <span className="rounded bg-surface-raised px-2 py-1 text-muted">{dictionary.minimumWork}: {row.template.minimumWorkMinutes ?? dictionary.unconfigured} {row.template.minimumWorkMinutes === null ? "" : dictionary.minutes}</span>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{dictionary.assignedCount.replace("{count}", String(row.drivers.length))}</span>
        {permissions.assign ? <button type="button" className={secondaryClass} onClick={() => onMembers(row.template, week)}>{dictionary.manageDrivers}</button> : null}
        {permissions.manage ? <>
          <button type="button" className={secondaryClass} onClick={() => onPolicy(row.template)}>{dictionary.operationalSettings}</button>
          <div className="relative">
            <button type="button" className={secondaryClass} onClick={() => setMenuOpen((open) => !open)} aria-label={dictionary.moreActions} aria-expanded={menuOpen} title={dictionary.moreActions}>...</button>
            {menuOpen ? <div className="absolute end-0 top-full z-20 mt-2 grid min-w-44 gap-1 rounded-lg border border-border bg-surface p-2 shadow-xl">
              <button type="button" className="rounded-md px-3 py-2 text-start text-sm font-bold text-navy hover:bg-surface-raised" onClick={() => { setMenuOpen(false); onEdit(row.template); }}>{dictionary.edit}</button>
              {row.template.isPublished && row.template.isActive ? <button type="button" className="rounded-md px-3 py-2 text-start text-sm font-bold text-navy hover:bg-surface-raised" disabled={lifecycleBusy} onClick={() => { setMenuOpen(false); runLifecycle("unpublish", row.template); }}>{dictionary.unpublish}</button> : null}
              {!row.template.isPublished && row.template.isActive ? <button type="button" className="rounded-md px-3 py-2 text-start text-sm font-bold text-navy hover:bg-surface-raised" disabled={lifecycleBusy} onClick={() => { setMenuOpen(false); runLifecycle("publish", row.template); }}>{dictionary.publish}</button> : null}
              {row.template.isActive ? <button type="button" className="rounded-md px-3 py-2 text-start text-sm font-bold text-navy hover:bg-surface-raised" disabled={lifecycleBusy} onClick={() => { setMenuOpen(false); runLifecycle("disable", row.template); }}>{dictionary.disable}</button> : !row.template.archivedAt ? <button type="button" className="rounded-md px-3 py-2 text-start text-sm font-bold text-navy hover:bg-surface-raised" disabled={lifecycleBusy} onClick={() => { setMenuOpen(false); runLifecycle("enable", row.template); }}>{dictionary.enable}</button> : null}
              <form action={archiveAction} onSubmit={(event) => { if (!window.confirm(`${dictionary.archiveConfirm}\n\n${dictionary.archiveImpact}`)) event.preventDefault(); }}>
                <input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} /><input type="hidden" name="templateId" value={row.template.id} />
                <button type="submit" className="w-full rounded-md px-3 py-2 text-start text-sm font-bold text-danger hover:bg-danger/10" disabled={archivePending || Boolean(row.template.archivedAt)}>{dictionary.archive}</button>
              </form>
            </div> : null}
          </div>
        </> : null}
      </div>
      {expanded ? <div className="border-t border-border/70 px-4 pb-4">{row.drivers.length === 0 ? <p className="py-4 text-sm text-muted">{dictionary.noDrivers}</p> : <div className="divide-y divide-border/70">{row.drivers.map((driver: any) => <DriverLine key={driver.id} driver={driver} ids={ids} dictionary={dictionary} onMove={() => onMove(row.template.id, driver, week)} onOpen={() => onOpen(row.template, driver)} canOpen={current && row.template.isActive && row.template.isPublished && !row.template.archivedAt} canMove={permissions.assign} />)}</div>}</div> : null}
    </article>
  );
}

function DriverLine({ driver, ids, dictionary, onMove, onOpen, canMove, canOpen }: any) {
  return <div className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-[190px] flex-1"><p className="font-bold text-navy">{driver.fullName}</p><p className="text-xs text-muted">{driver.vehicleLabel ?? driver.mobileNumber ?? ""}</p></div><code className="text-xs font-bold text-muted" dir="ltr">{driver.keetaDriverId ?? "-"}</code>{canOpen ? <button type="button" className={secondaryClass} onClick={onOpen} title={dictionary.openNow} aria-label={dictionary.openNow}>▶</button> : null}{canMove ? <button type="button" className={secondaryClass} onClick={onMove}>{dictionary.moveDriver}</button> : null}{driver.keetaDriverId ? <CopyIdsButton ids={[driver.keetaDriverId]} dictionary={dictionary} /> : ids.length > 0 ? <CopyIdsButton ids={ids} dictionary={dictionary} /> : null}</div>;
}

function CopyIdsButton({ ids, dictionary }: { ids: string[]; dictionary: OrderPeriodManagementDictionary }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={secondaryClass} onClick={async () => { await navigator.clipboard.writeText(ids.join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? dictionary.copiedIds.replace("{count}", String(ids.length)) : dictionary.copyIds}</button>;
}

function VirtualUnassignedRow({ week, expanded, onToggle, dictionary }: any) {
  const ids = week.unassignedDrivers.map((driver: any) => driver.keetaDriverId).filter(Boolean);
  return <article className="rounded-xl border border-dashed border-primary/35 bg-primary/[0.04]"><div className="flex flex-wrap items-center gap-3 p-4"><button type="button" onClick={onToggle} className="grid size-9 place-items-center rounded-lg border border-primary/30 text-lg font-black text-primary">{expanded ? "−" : "+"}</button><div className="flex-1"><h3 className="font-black text-navy">{dictionary.unassigned}</h3><p className="text-sm font-semibold text-muted">{dictionary.assignedCount.replace("{count}", String(week.unassignedDrivers.length))}</p></div>{ids.length ? <CopyIdsButton ids={ids} dictionary={dictionary} /> : null}</div>{expanded ? <div className="border-t border-primary/15 px-4 pb-3">{week.unassignedDrivers.length === 0 ? <p className="py-3 text-sm text-muted">{dictionary.noDrivers}</p> : week.unassignedDrivers.map((driver: any) => <DriverLine key={driver.id} driver={driver} ids={[]} dictionary={dictionary} canMove={false} onMove={() => undefined} />)}</div> : null}</article>;
}

function TemplateDialog({ locale, organizationCode, dictionary, form, action, pending, state, onClose }: any) {
  return <Dialog title={form.mode === "create" ? dictionary.addTemplate : dictionary.editTemplate} onClose={onClose}><form action={action} className="space-y-4"><HiddenContext locale={locale} organizationCode={organizationCode} /><input type="hidden" name="templateId" value={form.template?.id ?? ""} /><label className="block text-sm font-bold text-navy">{dictionary.name}<input className={inputClass} name="name" required defaultValue={form.template?.name ?? ""} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-navy">{dictionary.startTime}<input className={inputClass} type="time" name="startTime" required defaultValue={form.template?.startTime ?? ""} /></label><label className="block text-sm font-bold text-navy">{dictionary.endTime}<input className={inputClass} type="time" name="endTime" required defaultValue={form.template?.endTime ?? ""} /></label></div><label className="flex items-center gap-2 text-sm font-bold text-navy"><input type="checkbox" name="crossesMidnight" defaultChecked={form.template?.crossesMidnight ?? false} />{dictionary.crossesMidnight}</label><ActionMessage state={state} /><div className="flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={onClose}>{dictionary.cancel}</button><button type="submit" className={buttonClass} disabled={pending}>{pending ? dictionary.saving : dictionary.save}</button></div></form></Dialog>;
}

function MembersDialog({ locale, organizationCode, dictionary, form, drivers, action, pending, state, onClose }: any) {
  const assigned = new Set(form.week.rows.find((row: any) => row.template.id === form.template.id)?.drivers.map((driver: any) => driver.id) ?? []);
  const assignedElsewhere = new Set(form.week.rows.filter((row: any) => row.template.id !== form.template.id).flatMap((row: any) => row.drivers.map((driver: any) => driver.id)));
  const selectable = drivers.filter((driver: any) => assigned.has(driver.id) || !assignedElsewhere.has(driver.id));
  return <Dialog title={dictionary.manageDrivers} onClose={onClose}><form action={action} className="space-y-4"><HiddenContext locale={locale} organizationCode={organizationCode} /><input type="hidden" name="templateId" value={form.template.id} /><input type="hidden" name="weekStartDate" value={form.week.startDate} /><input type="hidden" name="weekEndDate" value={form.week.endDate} /><div className="max-h-[50vh] space-y-2 overflow-y-auto">{selectable.length === 0 ? <p className="text-sm text-muted">{dictionary.noDrivers}</p> : selectable.map((driver: any) => <label key={driver.id} className="flex items-center gap-3 rounded-lg border border-border p-3"><input type="checkbox" name="driverIds" value={driver.id} defaultChecked={assigned.has(driver.id)} /><span className="flex-1 font-bold text-navy">{driver.fullName}</span><code className="text-xs text-muted" dir="ltr">{driver.keetaDriverId ?? "-"}</code></label>)}</div><ActionMessage state={state} /><div className="flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={onClose}>{dictionary.cancel}</button><button type="submit" className={buttonClass} disabled={pending}>{pending ? dictionary.saving : dictionary.saveAssignments}</button></div></form></Dialog>;
}

function MoveDialog({ locale, organizationCode, dictionary, form, templates, action, pending, state, onClose }: any) {
  return <Dialog title={dictionary.moveDriver} onClose={onClose}><form action={action} className="space-y-4"><HiddenContext locale={locale} organizationCode={organizationCode} /><input type="hidden" name="sourceTemplateId" value={form.templateId} /><input type="hidden" name="driverId" value={form.driver.id} /><input type="hidden" name="weekStartDate" value={form.week.startDate} /><input type="hidden" name="weekEndDate" value={form.week.endDate} /><p className="font-bold text-navy">{form.driver.fullName}</p><label className="block text-sm font-bold text-navy">{dictionary.chooseTemplate}<select className={inputClass} name="targetTemplateId" required defaultValue=""><option value="" disabled>{dictionary.chooseTemplate}</option>{templates.filter((template: any) => template.id !== form.templateId).map((template: any) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><ActionMessage state={state} /><div className="flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={onClose}>{dictionary.cancel}</button><button type="submit" className={buttonClass} disabled={pending}>{pending ? dictionary.saving : dictionary.moveDriver}</button></div></form></Dialog>;
}

function HiddenContext({ locale, organizationCode }: { locale: string; organizationCode: string }) { return <><input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} /></>; }
function ActionMessage({ state }: { state: OrderPeriodActionResult }) { return state.status === "error" ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-bold text-danger">{state.message}</p> : null; }
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-70 grid place-items-center bg-navy/35 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-black text-navy">{title}</h2><button type="button" className={secondaryClass} onClick={onClose}>×</button></div>{children}</div></div>; }
