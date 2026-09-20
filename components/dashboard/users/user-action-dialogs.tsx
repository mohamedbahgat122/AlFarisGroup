"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OrganizationAccessFields } from "@/components/dashboard/users/organization-access-fields";
import { GlobalAccessFields } from "@/components/dashboard/users/global-access-fields";
import {
  archiveManagedUserAction,
  getUserActivityLogsAction,
  setManagedUserStatusAction,
  updateManagedUserAction,
  updateManagedUserPermissionsAction,
} from "@/features/user-management/actions";
import { initialCreateManagedUserActionState } from "@/features/user-management/action-state";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
  ManagedUserActivityLog,
  ManagedUserListItem,
  ManagedUserRole,
} from "@/features/user-management/types";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import { stripLegacyPermissionKeys } from "@/features/permissions/registry";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import type { Locale } from "@/types/locale";

type UserManagementDictionary = Dictionary["dashboard"]["userManagement"];
type MutationMessageResolver = (
  dictionary: UserManagementDictionary,
  code: string | undefined,
) => string;

type CommonDialogProps = {
  locale: Locale;
  dictionary: UserManagementDictionary;
  user: ManagedUserListItem;
  onClose: () => void;
};

type MutationDialogProps = CommonDialogProps & {
  onSuccess: () => void;
  onError: (message: string) => void;
};

const roleOptions: ManagedUserRole[] = ["manager", "supervisor", "driver"];

export function EditUserDialog({
  locale,
  dictionary,
  user,
  organizations,
  onClose,
  onSuccess,
  onError,
}: MutationDialogProps & { organizations: ActiveOrganizationOption[] }) {
  const [state, formAction] = useActionState(
    updateManagedUserAction,
    initialCreateManagedUserActionState,
  );

  useMutationFeedback(
    state,
    dictionary,
    onSuccess,
    onError,
  );

  return (
    <DialogFrame
      title={dictionary.editUser}
      description={dictionary.editUserDescription}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5 px-5 py-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="targetUserId" value={user.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="editFullName"
            name="fullName"
            label={dictionary.fullName}
            defaultValue={user.fullName ?? ""}
            maxLength={160}
            required
            autoComplete="off"
          />
          <FormField
            id="editEmail"
            name="email"
            type="email"
            label={dictionary.email}
            defaultValue={user.email}
            required
            autoComplete="off"
          />
          <SelectField
            id="editRole"
            name="role"
            label={dictionary.globalRole}
            defaultValue={user.role as ManagedUserRole}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {dictionary.roleLabels[role]}
              </option>
            ))}
          </SelectField>
          <FormField
            id="editJobTitle"
            name="jobTitle"
            label={dictionary.jobTitle}
            defaultValue={user.jobTitle ?? ""}
            maxLength={160}
            required
            autoComplete="off"
          />
          <SelectField
            id="editHomeOrganizationId"
            name="homeOrganizationId"
            label={dictionary.homeOrganization}
            defaultValue={user.homeOrganization?.id ?? ""}
            className="sm:col-span-2"
          >
            <option value="">{dictionary.selectOrganization}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </SelectField>
        </div>
        <DialogActions
          cancel={dictionary.cancel}
          submit={dictionary.save}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function PermissionsDialog({
  locale,
  dictionary,
  user,
  organizations,
  onClose,
  onSuccess,
  onError,
}: MutationDialogProps & { organizations: ActiveOrganizationOption[] }) {
  const [state, formAction] = useActionState(
    updateManagedUserPermissionsAction,
    initialCreateManagedUserActionState,
  );
  const [accessValues, setAccessValues] = useState<
    Record<string, OrganizationPermissionKey[]>
  >(() =>
    Object.fromEntries(
      user.additionalAccess.map((access) => [
        access.organizationId,
        stripLegacyPermissionKeys(access.permissionKeys),
      ]),
    ),
  );
  const [globalPermissions, setGlobalPermissions] = useState<GlobalPermissionKey[]>(
    user.globalPermissions || [],
  );
  const additionalAccess = useMemo(
    () =>
      user.role === "driver"
        ? []
        : Object.entries(accessValues)
            .filter(([, permissionKeys]) => permissionKeys.length > 0)
            .map(([organizationId, permissionKeys]) => ({
              organizationId,
              permissionKeys,
            })),
    [accessValues, user.role],
  );

  useMutationFeedback(
    state,
    dictionary,
    onSuccess,
    onError,
    getPermissionActionMessage,
  );

  return (
    <DialogFrame
      title={dictionary.managePermissions}
      description={dictionary.permissionsDescription}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5 px-5 py-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="targetUserId" value={user.id} />
        <input
          type="hidden"
          name="additionalAccess"
          value={JSON.stringify(additionalAccess)}
        />
        <input
          type="hidden"
          name="globalPermissions"
          value={JSON.stringify(globalPermissions)}
        />
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-bold text-navy">{user.fullName}</p>
          <p className="mt-1 text-sm text-muted">
            {dictionary.roleLabels[user.role]} ·{" "}
            {user.homeOrganization?.name ?? dictionary.noHomeOrganization}
          </p>
        </div>
        {user.isSystemOwner ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">
            {dictionary.systemOwnerPermissionsNotice}
          </div>
        ) : user.role === "driver" ? (
          <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted">
            {dictionary.driverAccessNote}
          </div>
        ) : (
          <OrganizationAccessFields
            dictionary={dictionary}
            organizations={organizations}
            homeOrganizationId={user.homeOrganization?.id ?? ""}
            includeHomeOrganization={true}
            values={accessValues}
            onChange={(organizationId, permissionKeys) =>
              setAccessValues((current) => ({
                ...current,
                [organizationId]: permissionKeys,
              }))
            }
          />
        )}
        {!user.isSystemOwner && user.role !== "driver" && (
          <GlobalAccessFields
            dictionary={dictionary}
            values={globalPermissions}
            onChange={setGlobalPermissions}
          />
        )}
        {user.isSystemOwner ? (
          <div className="flex justify-end border-t border-border pt-5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              {dictionary.cancel}
            </button>
          </div>
        ) : (
          <DialogActions
            cancel={dictionary.cancel}
            submit={dictionary.save}
            onCancel={onClose}
          />
        )}
      </form>
    </DialogFrame>
  );
}

export function ConfirmationDialog({
  locale,
  dictionary,
  user,
  mode,
  onClose,
  onSuccess,
  onError,
}: MutationDialogProps & { mode: "suspend" | "reactivate" | "archive" }) {
  const action =
    mode === "archive" ? archiveManagedUserAction : setManagedUserStatusAction;
  const [state, formAction] = useActionState(
    action,
    initialCreateManagedUserActionState,
  );
  const title =
    mode === "archive"
      ? dictionary.archiveUser
      : mode === "suspend"
        ? dictionary.suspendUser
        : dictionary.reactivateUser;
  const description =
    mode === "archive"
      ? dictionary.archiveDescription
      : mode === "suspend"
        ? dictionary.suspendDescription
        : dictionary.reactivateDescription;
  const submit =
    mode === "archive"
      ? dictionary.archiveConfirm
      : mode === "suspend"
        ? dictionary.suspendConfirm
        : dictionary.reactivateConfirm;

  useMutationFeedback(state, dictionary, onSuccess, onError);

  return (
    <DialogFrame title={title} description={description} onClose={onClose}>
      <form action={formAction} className="space-y-5 px-5 py-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="targetUserId" value={user.id} />
        {mode !== "archive" ? (
          <input
            type="hidden"
            name="status"
            value={mode === "suspend" ? "suspended" : "active"}
          />
        ) : null}
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-bold text-navy">{user.fullName}</p>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
        <DialogActions
          cancel={dictionary.cancel}
          submit={submit}
          onCancel={onClose}
          destructive={mode === "archive"}
        />
      </form>
    </DialogFrame>
  );
}

export function ActivityDialog({
  locale,
  dictionary,
  user,
  onClose,
}: CommonDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"user" | "account">("account");
  const [logs, setLogs] = useState<{
    userActivity: ManagedUserActivityLog[];
    accountHistory: ManagedUserActivityLog[];
  }>({ userActivity: [], accountHistory: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const result = await getUserActivityLogsAction(user.id);
      if (result.status === "success") {
        setLogs({
          userActivity: result.userActivity,
          accountHistory: result.accountHistory,
        });
      }
      setLoaded(true);
    });
  }, [user.id]);

  const visibleLogs = activeTab === "account" ? logs.accountHistory : logs.userActivity;

  return (
    <DialogFrame
      title={dictionary.activityLogs}
      description={user.fullName ?? dictionary.userFallback}
      onClose={onClose}
    >
      <div className="space-y-4 px-5 py-5">
        <div className="inline-flex rounded-xl border border-border bg-background p-1">
          <TabButton
            active={activeTab === "account"}
            onClick={() => setActiveTab("account")}
          >
            {dictionary.accountHistory}
          </TabButton>
          <TabButton
            active={activeTab === "user"}
            onClick={() => setActiveTab("user")}
          >
            {dictionary.userActivity}
          </TabButton>
        </div>
        {isPending || !loaded ? (
          <p className="text-sm text-muted">{dictionary.loading}</p>
        ) : visibleLogs.length === 0 ? (
          <p className="rounded-xl border border-border bg-background p-4 text-sm text-muted">
            {dictionary.emptyActivity}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-border p-4">
                <p className="text-sm font-bold text-navy">
                  {getActivityLabel(dictionary, log.action)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(log.createdAt, locale)}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {dictionary.actor}: {log.actorName ?? dictionary.notAvailable}
                  {" · "}
                  {dictionary.target}: {log.targetName ?? dictionary.notAvailable}
                </p>
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer font-semibold text-primary">
                    {dictionary.details}
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <SafeJson label={dictionary.before} value={log.beforeData} targetName={log.targetName} />
                    <SafeJson label={dictionary.after} value={log.afterData} targetName={log.targetName} />
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-navy">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  defaultValue,
  children,
  className = "",
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required
        className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-base text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        {children}
      </select>
    </div>
  );
}

function DialogActions({
  cancel,
  submit,
  onCancel,
  destructive = false,
}: {
  cancel: string;
  submit: string;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {cancel}
      </button>
      <Button
        type="submit"
        disabled={pending}
        className={destructive ? "bg-danger hover:bg-danger" : ""}
      >
        {pending ? `${submit}...` : submit}
      </Button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${
        active ? "bg-surface text-primary shadow-sm" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

const UI_FIELD_MAP: Record<string, string> = {
  status: "الحالة",
  category: "التصنيف",
  severity: "درجة التحذير",
  driver_id: "المندوب",
  incident_at: "وقت الواقعة",
  driver_seen_at: "وقت مشاهدة المندوب",
  previous_status: "الحالة السابقة",
  new_status: "الحالة الجديدة",
};

const UI_VALUE_MAP: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  compliance: "الالتزام",
  medium: "متوسط",
  low: "منخفض",
  high: "مرتفع",
  critical: "حرج",
};

function formatValue(key: string, value: unknown, targetName?: string | null): React.ReactNode {
  if (value === null || value === undefined) {
    if (key === "driver_seen_at") return "لم تتم المشاهدة";
    return "غير محدد";
  }

  if (key === "driver_id" && targetName) {
    return targetName;
  }

  if (typeof value === "boolean") return value ? "نعم" : "لا";
  
  if (typeof value === "string") {
    if (UI_VALUE_MAP[value]) return UI_VALUE_MAP[value];

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      try {
        return new Intl.DateTimeFormat("ar-SA", {
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(value));
      } catch (e) {
        return value;
      }
    }
    return value;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return "لا توجد بيانات";
    return value.map(v => (typeof v === "string" && UI_VALUE_MAP[v]) ? UI_VALUE_MAP[v] : v).join(", ");
  }
  
  if (typeof value === "object") {
    if (Object.keys(value).length === 0) return "لا توجد بيانات";
    return JSON.stringify(value);
  }
  
  return String(value);
}

function SafeJson({ label, value, targetName }: { label: string; value: unknown; targetName?: string | null }) {
  if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
    return (
      <div className="rounded-lg bg-background p-3">
        <p className="font-semibold text-navy">{label}</p>
        <p className="mt-1 text-sm text-muted">لا توجد بيانات</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-background p-3">
      <p className="mb-2 font-semibold text-navy">{label}</p>
      <dl className="space-y-2">
        {typeof value === "object" ? (
          Object.entries(value).map(([key, val]) => (
            <div
              key={key}
              className="flex flex-col text-sm sm:flex-row sm:justify-between sm:gap-4"
            >
              <dt className="text-muted">{UI_FIELD_MAP[key] ?? key}:</dt>
              <dd className="font-medium text-navy sm:text-end" dir="auto">
                {formatValue(key, val, targetName)}
              </dd>
            </div>
          ))
        ) : (
          <div className="text-sm font-medium text-navy">{formatValue("", value, targetName)}</div>
        )}
      </dl>
    </div>
  );
}

function useMutationFeedback(
  state: { status: "idle" | "success" | "error"; code?: string },
  dictionary: UserManagementDictionary,
  onSuccess: () => void,
  onError: (message: string) => void,
  getMessage: MutationMessageResolver = getActionMessage,
) {
  const callbacksRef = useRef({ dictionary, onSuccess, onError });
  const handledKeyRef = useRef("");

  useEffect(() => {
    callbacksRef.current = { dictionary, onSuccess, onError };
  }, [dictionary, onError, onSuccess]);

  useEffect(() => {
    if (state.status === "idle") {
      handledKeyRef.current = "";
      return;
    }

    const resultKey = `${state.status}:${state.code ?? ""}`;

    if (handledKeyRef.current === resultKey) {
      return;
    }

    handledKeyRef.current = resultKey;

    if (state.status === "success") {
      callbacksRef.current.onSuccess();
    }

    if (state.status === "error") {
      callbacksRef.current.onError(
        getMessage(callbacksRef.current.dictionary, state.code),
      );
    }
  }, [getMessage, state.code, state.status]);
}

function getActionMessage(
  dictionary: UserManagementDictionary,
  code: string | undefined,
): string {
  switch (code) {
    case "validation_error":
      return dictionary.validationError;
    case "email_already_exists":
      return dictionary.emailAlreadyExists;
    case "organization_not_found":
      return dictionary.organizationNotFound;
    case "organization_inactive":
      return dictionary.organizationInactive;
    case "unauthorized":
      return dictionary.unauthorized;
    case "configuration_error":
      return dictionary.configurationError;
    case "protected_user":
      return dictionary.protectedUserError;
    case "self_operation":
      return dictionary.selfOperationError;
    case "not_found":
      return dictionary.notFoundError;
    default:
      return dictionary.creationFailed;
  }
}

function getPermissionActionMessage(
  dictionary: UserManagementDictionary,
  code: string | undefined,
): string {
  switch (code) {
    case "unknown_permission":
      return dictionary.permissionsUnknownPermission;
    case "unauthorized":
      return dictionary.permissionsUnauthorized;
    case "validation_error":
    case "organization_not_found":
    case "organization_inactive":
    case "update_failed":
    default:
      return dictionary.permissionsUpdateFailed;
  }
}

function getActivityLabel(
  dictionary: UserManagementDictionary,
  action: string,
) {
  if (action in dictionary.actionLabels) {
    return dictionary.actionLabels[
      action as keyof UserManagementDictionary["actionLabels"]
    ];
  }

  return action;
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
