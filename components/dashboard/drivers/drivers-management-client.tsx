"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import {
  archiveDriverAction,
  createDriverAppAccountAction,
  createDriverAction,
  getDriverActivityLogsAction,
  getEligibleDriverAppAccountsAction,
  linkExistingDriverAppAccountAction,
  resetDriverAppPasswordAction,
  setDriverStatusAction,
  updateDriverAppLoginIdentifierAction,
  updateDriverAction,
} from "@/features/drivers/actions";
import {
  initialDriverAccountActionState,
  initialDriverActionState,
  initialDriverLifecycleActionState,
} from "@/features/drivers/action-state";
import { getExpiryStatus, type ExpiryStatus } from "@/features/drivers/expiry";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  DriverActivityLog,
  DriverAppAccountOption,
  DriverDocumentMetadata,
  DriverFormFieldName,
  DriverFormValues,
  DriverListItem,
  DriverMutationErrorCode,
  DriverSettlementType,
  DriverStatus,
  DriverVehicleType,
} from "@/features/drivers/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Locale } from "@/types/locale";

type DriversDictionary = Dictionary["dashboard"]["drivers"];

type DriversManagementClientProps = {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  drivers: DriverListItem[];
  today: string;
  initialDriverId: string | null;
};

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; driver: DriverListItem }
  | { mode: "view"; driver: DriverListItem }
  | { mode: "suspend"; driver: DriverListItem }
  | { mode: "reactivate"; driver: DriverListItem }
  | { mode: "archive"; driver: DriverListItem }
  | { mode: "activity"; driver: DriverListItem }
  | { mode: "create-app-account"; driver: DriverListItem }
  | { mode: "link-app-account"; driver: DriverListItem }
  | { mode: "reset-app-password"; driver: DriverListItem }
  | { mode: "update-app-login-identifier"; driver: DriverListItem }
  | null;

type DriverFormDialogState = Extract<
  DialogState,
  { mode: "create" | "edit" | "view" }
>;

const vehicleTypes: DriverVehicleType[] = ["motorcycle", "car"];
const settlementTypes: DriverSettlementType[] = ["tiers", "per_order"];

export function DriversManagementClient({
  locale,
  dictionary,
  organization,
  drivers,
  today,
  initialDriverId,
}: DriversManagementClientProps) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState | null>(null);
  const permissions = new Set(organization.permissionKeys);
  const driverPermissions = {
    create: permissions.has("drivers.create"),
    update: permissions.has("drivers.update"),
    status: permissions.has("drivers.status"),
    archive: permissions.has("drivers.archive"),
    activity: permissions.has("drivers.activity.view"),
    accountManage: permissions.has("drivers.account.manage"),
  };
  const canMutate =
    driverPermissions.create ||
    driverPermissions.update ||
    driverPermissions.status ||
    driverPermissions.archive;
  const [dialog, setDialog] = useState<DialogState>(() => {
    const driver = drivers.find((item) => item.id === initialDriverId);

    if (!driver) {
      return null;
    }

    return { mode: driverPermissions.update ? "edit" : "view", driver };
  });

  function handleSuccess(message: string) {
    setDialog(null);
    setToast({ tone: "success", message });
    router.refresh();
  }

  return (
    <>
      <UserToast locale={locale} toast={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {canMutate ? null : (
              <AccessBadge>{dictionary.viewOnly}</AccessBadge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-normal text-navy">
            {dictionary.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.description}
          </p>
        </div>
        {driverPermissions.create ? (
          <Button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="w-full gap-2 sm:w-auto"
          >
            <PlusIcon />
            {dictionary.addDriver}
          </Button>
        ) : null}
      </div>

      <div className="px-5 py-6 sm:px-7">
        {drivers.length === 0 ? (
          <EmptyState
            dictionary={dictionary}
            canManage={driverPermissions.create}
            onCreate={() => setDialog({ mode: "create" })}
          />
        ) : (
          <DriversTable
            locale={locale}
            dictionary={dictionary}
            drivers={drivers}
            permissions={driverPermissions}
            today={today}
            onSelect={(driver) =>
              setDialog({ mode: driverPermissions.update ? "edit" : "view", driver })
            }
            onAction={setDialog}
          />
        )}
      </div>

      {dialog && isDriverFormDialogState(dialog) ? (
        <DriverDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          state={dialog}
          onClose={() => setDialog(null)}
          onSuccess={handleSuccess}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "suspend" || dialog?.mode === "reactivate" ? (
        <DriverLifecycleDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          driver={dialog.driver}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSuccess={() =>
            handleSuccess(
              dialog.mode === "suspend"
                ? dictionary.suspendSuccess
                : dictionary.reactivateSuccess,
            )
          }
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "archive" ? (
        <DriverArchiveDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          driver={dialog.driver}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.archiveSuccess)}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "activity" ? (
        <DriverActivityDialog
          dictionary={dictionary}
          locale={locale}
          organization={organization}
          driver={dialog.driver}
          onClose={() => setDialog(null)}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "create-app-account" ||
      dialog?.mode === "reset-app-password" ? (
        <DriverAppAccountDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          driver={dialog.driver}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.appAccount.success)}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "link-app-account" ? (
        <DriverLinkAppAccountDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          driver={dialog.driver}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.appAccount.linkSuccess)}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.mode === "update-app-login-identifier" ? (
        <DriverLoginIdentifierDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          driver={dialog.driver}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.appAccount.loginIdentifierSuccess)}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
    </>
  );
}

function isDriverFormDialogState(
  state: DialogState,
): state is DriverFormDialogState {
  return Boolean(
    state &&
      (state.mode === "create" ||
        state.mode === "edit" ||
        state.mode === "view"),
  );
}

function DriversTable({
  locale,
  dictionary,
  drivers,
  permissions,
  today,
  onSelect,
  onAction,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  drivers: DriverListItem[];
  permissions: {
    update: boolean;
    status: boolean;
    archive: boolean;
    activity: boolean;
    accountManage: boolean;
  };
  today: string;
  onSelect: (driver: DriverListItem) => void;
  onAction: (state: Exclude<DialogState, null>) => void;
}) {
  return (
    <div className="overflow-hidden border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[2020px] border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <TableHeader className="min-w-48">{dictionary.tableDriver}</TableHeader>
              <TableHeader>{dictionary.tableNationality}</TableHeader>
              <TableHeader className="whitespace-nowrap">
                {dictionary.tableMobile}
              </TableHeader>
              <TableHeader className="whitespace-nowrap">
                {dictionary.tableVehicleType}
              </TableHeader>
              <TableHeader className="whitespace-nowrap">
                {dictionary.tableVehiclePlateNumber}
              </TableHeader>
              <TableHeader className="min-w-48">
                {dictionary.tableOrganization}
              </TableHeader>
              <TableHeader className="whitespace-nowrap text-center">
                {dictionary.tableSponsorship}
              </TableHeader>
              <TableHeader className="min-w-36 whitespace-nowrap text-center">
                {dictionary.tableDriverStatus}
              </TableHeader>
              <TableHeader className="min-w-44 whitespace-nowrap text-center">
                {dictionary.tableAppAccount}
              </TableHeader>
              <TableHeader className="min-w-36 whitespace-nowrap text-center">
                {dictionary.tableIqamaExpiry}
              </TableHeader>
              <TableHeader className="min-w-40 whitespace-nowrap text-center">
                {dictionary.tableDrivingLicenseExpiry}
              </TableHeader>
              <TableHeader className="min-w-36 whitespace-nowrap text-center">
                {dictionary.tableDriverCardExpiry}
              </TableHeader>
              <TableHeader className="min-w-40 whitespace-nowrap text-center">
                {dictionary.tableAuthorizationExpiry}
              </TableHeader>
              <TableHeader className="min-w-44 whitespace-nowrap">
                {dictionary.tableCreatedBy}
              </TableHeader>
              <TableHeader className="min-w-44 whitespace-nowrap">
                {dictionary.tableUpdatedBy}
              </TableHeader>
              <TableHeader className="min-w-48 whitespace-nowrap text-center">
                {dictionary.tableActions}
              </TableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {drivers.map((driver) => (
              <tr
                key={driver.id}
                className="cursor-pointer align-middle transition hover:bg-primary-soft/35"
                onClick={() => onSelect(driver)}
              >
                <td className="max-w-[260px] px-4 py-4">
                  {driver.profilePhotoUrl ? (
                    <img
                      src={driver.profilePhotoUrl}
                      alt=""
                      className="me-3 inline-flex size-10 rounded-full border border-border object-cover align-middle"
                    />
                  ) : (
                    <span className="me-3 inline-flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary-soft align-middle text-xs font-bold text-primary">
                      {getDriverInitials(driver.fullName)}
                    </span>
                  )}
                  <p className="truncate text-sm font-bold text-navy">
                    {driver.fullName}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {driver.keetaDriverId
                      ? `${driver.keetaUsername} · ${driver.keetaDriverId}`
                      : driver.keetaUsername}
                  </p>
                </td>
                <td className="px-4 py-4 text-sm font-medium text-muted">
                  {driver.nationality}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted">
                  {driver.mobileNumber}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted">
                  <p>{dictionary.vehicleTypes[driver.vehicleType]}</p>
                  <p className="text-xs text-muted">
                    {driver.vehicleBrand ?? dictionary.incomplete}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted">
                  <p className="font-semibold text-navy">{driver.vehicleNumber}</p>
                  <p className="text-xs text-muted">
                    {driver.keetaVehiclePlateNumber ?? dictionary.incomplete}
                  </p>
                </td>
                <td className="max-w-[220px] px-4 py-4">
                  <p className="truncate text-sm font-semibold text-navy">
                    {driver.organizationName}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-center text-sm font-medium text-muted">
                  {driver.isCompanySponsored ? dictionary.yes : dictionary.no}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-center">
                  <StatusBadge status={driver.status} dictionary={dictionary} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-center">
                  <AppAccountCell
                    dictionary={dictionary}
                    driver={driver}
                    canManage={permissions.accountManage}
                    onAction={onAction}
                  />
                </td>
                <DateCell
                  value={driver.iqamaExpiryDate}
                  locale={locale}
                  dictionary={dictionary}
                  today={today}
                />
                <DateCell
                  value={driver.drivingLicenseExpiryDate}
                  locale={locale}
                  dictionary={dictionary}
                  today={today}
                  fallback={dictionary.incomplete}
                />
                <DateCell
                  value={driver.driverCardExpiryDate}
                  locale={locale}
                  dictionary={dictionary}
                  today={today}
                />
                <DateCell
                  value={driver.vehicleAuthorizationExpiryDate}
                  locale={locale}
                  dictionary={dictionary}
                  today={today}
                />
                <ActorCell actorName={driver.createdBy?.fullName} dictionary={dictionary} />
                <ActorCell actorName={driver.updatedBy?.fullName} dictionary={dictionary} />
                <td className="whitespace-nowrap px-4 py-4 text-center">
                  <div className="inline-flex items-center justify-center gap-1">
                    {permissions.update || permissions.status || permissions.archive ? (
                      <>
                        {permissions.update ? (
                          <ActionButton
                          label={dictionary.editDriver}
                          onClick={(event) => {
                            event.stopPropagation();
                            onAction({ mode: "edit", driver });
                          }}
                          >
                          <EditIcon />
                          </ActionButton>
                        ) : null}
                        {permissions.status ? (
                          <ActionButton
                          label={
                            driver.status === "active"
                              ? dictionary.suspend
                              : dictionary.reactivate
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onAction({
                              mode:
                                driver.status === "active"
                                  ? "suspend"
                                  : "reactivate",
                              driver,
                            });
                          }}
                          >
                          {driver.status === "active" ? (
                            <SuspendIcon />
                          ) : (
                            <ReactivateIcon />
                          )}
                          </ActionButton>
                        ) : null}
                        {permissions.archive ? (
                          <ActionButton
                          label={dictionary.archive}
                          destructive
                          onClick={(event) => {
                            event.stopPropagation();
                            onAction({ mode: "archive", driver });
                          }}
                          >
                          <ArchiveIcon />
                          </ActionButton>
                        ) : null}
                      </>
                    ) : null}
                    {permissions.activity ? (
                      <ActionButton
                      label={dictionary.activityHistory}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction({ mode: "activity", driver });
                      }}
                      >
                      <ActivityIcon />
                      </ActionButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!permissions.update && !permissions.status && !permissions.archive ? (
        <p className="border-t border-border bg-background px-4 py-3 text-sm text-muted">
          {dictionary.readOnlyNotice}
        </p>
      ) : null}
    </div>
  );
}

function AppAccountCell({
  dictionary,
  driver,
  canManage,
  onAction,
}: {
  dictionary: DriversDictionary;
  driver: DriverListItem;
  canManage: boolean;
  onAction: (state: Exclude<DialogState, null>) => void;
}) {
  const status = driver.appAccount.status;

  return (
    <div className="flex flex-col items-center gap-2">
      <AppAccountBadge status={status} dictionary={dictionary} />
      {canManage ? (
        status === "not_linked" ? (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction({ mode: "create-app-account", driver });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              {dictionary.appAccount.createAction}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction({ mode: "link-app-account", driver });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              {dictionary.appAccount.linkAction}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction({ mode: "update-app-login-identifier", driver });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              {dictionary.appAccount.updateLoginAction}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction({ mode: "reset-app-password", driver });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              {dictionary.appAccount.resetAction}
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function AppAccountBadge({
  status,
  dictionary,
}: {
  status: DriverListItem["appAccount"]["status"];
  dictionary: DriversDictionary;
}) {
  const className =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "password_change_required"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "suspended"
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-border bg-background text-muted";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}>
      {dictionary.appAccount.statuses[status]}
    </span>
  );
}

function DriverAppAccountDialog({
  locale,
  dictionary,
  organization,
  driver,
  mode,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  mode: "create-app-account" | "reset-app-password";
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    mode === "create-app-account"
      ? createDriverAppAccountAction
      : resetDriverAppPasswordAction,
    initialDriverAccountActionState,
  );
  const title =
    mode === "create-app-account"
      ? dictionary.appAccount.createTitle
      : dictionary.appAccount.resetTitle;
  const formRef = useRef<HTMLFormElement>(null);

  useDriverAccountFeedback(state, dictionary, onSuccess, onError);

  useEffect(() => {
    if (state.status === "error" || state.status === "validation_error") {
      formRef.current
        ?.querySelectorAll<HTMLInputElement>(
          'input[name="temporaryPassword"], input[name="confirmTemporaryPassword"]',
        )
        .forEach((input) => {
          input.value = "";
        });
    }
  }, [state.status, state.code]);

  return (
    <ConfirmationFrame
      title={title}
      description={dictionary.appAccount.title}
      driverName={driver.fullName}
      warning={null}
      onClose={onClose}
    >
      <form ref={formRef} action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <input type="hidden" name="driverId" value={driver.id} />
        <ReadOnlyField
          label={dictionary.appAccount.currentLoginIdentifier}
          value={maskDriverLoginIdentifier(driver.iqamaNumber) ?? dictionary.notAvailable}
        />
        <FormField
          id="driverAppIqamaNumber"
          name="iqamaNumber"
          label={dictionary.appAccount.iqamaNumber}
          type="text"
          inputMode="numeric"
          error={state.fieldErrors?.iqamaNumber}
          placeholder={dictionary.appAccount.iqamaPlaceholder}
          autoComplete="off"
        />
        <p className="-mt-3 text-xs font-medium text-muted">
          {dictionary.appAccount.iqamaHelp}
        </p>
        <ReadOnlyField
          label={dictionary.appAccount.keetaDriverId}
          value={driver.keetaDriverId ?? dictionary.notAvailable}
        />
        <FormField
          id="driverAppTemporaryPassword"
          name="temporaryPassword"
          label={dictionary.appAccount.temporaryPassword}
          type="password"
          error={state.fieldErrors?.password}
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        <FormField
          id="driverAppConfirmTemporaryPassword"
          name="confirmTemporaryPassword"
          label={dictionary.appAccount.confirmTemporaryPassword}
          type="password"
          error={state.fieldErrors?.confirmPassword}
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        <label className="flex items-start gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            name="requirePasswordChange"
            value="true"
            defaultChecked
            className="mt-1 size-4 accent-primary"
          />
          <span>
            {mode === "create-app-account"
              ? dictionary.appAccount.requirePasswordChange
              : dictionary.appAccount.requirePasswordChangeNext}
          </span>
        </label>
        <DialogActions
          cancel={dictionary.cancel}
          submit={
            mode === "create-app-account"
              ? dictionary.appAccount.createSubmit
              : dictionary.appAccount.resetSubmit
          }
          onCancel={onClose}
        />
      </form>
    </ConfirmationFrame>
  );
}

function DriverLinkAppAccountDialog({
  locale,
  dictionary,
  organization,
  driver,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    linkExistingDriverAppAccountAction,
    initialDriverAccountActionState,
  );
  const [accounts, setAccounts] = useState<DriverAppAccountOption[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const onErrorRef = useRef(onError);
  const dictionaryRef = useRef(dictionary);
  const lastRequestKeyRef = useRef("");
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    onErrorRef.current = onError;
    dictionaryRef.current = dictionary;
  }, [dictionary, onError]);

  useEffect(() => {
    const normalizedSearch = debouncedSearch.trim();
    const requestKey = `${organization.code}:${normalizedSearch}`;

    if (lastRequestKeyRef.current === requestKey) {
      return;
    }

    lastRequestKeyRef.current = requestKey;
    let isCurrent = true;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    setIsLoadingAccounts(true);

    void (async () => {
      const result = await getEligibleDriverAppAccountsAction({
        organizationCode: organization.code,
        search: normalizedSearch,
      });

      if (!isCurrent || requestSequenceRef.current !== requestSequence) {
        return;
      }

      setIsLoadingAccounts(false);

      if (result.status === "success") {
        setAccounts(result.accounts);
        setSelectedAccountId((current) =>
          result.accounts.some((account) => account.id === current)
            ? current
            : "",
        );
        return;
      }

      setAccounts([]);
      onErrorRef.current(
        getDriverAccountMessage(dictionaryRef.current, result.code),
      );
    })();

    return () => {
      isCurrent = false;
    };
  }, [debouncedSearch, organization.code]);

  useDriverAccountFeedback(state, dictionary, onSuccess, onError);

  return (
    <ConfirmationFrame
      title={dictionary.appAccount.linkTitle}
      description={dictionary.appAccount.linkDescription}
      driverName={driver.fullName}
      warning={null}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <input type="hidden" name="driverId" value={driver.id} />
        <input type="hidden" name="authUserId" value={selectedAccountId} />
        <ReadOnlyField
          label={dictionary.appAccount.currentLoginIdentifier}
          value={maskDriverLoginIdentifier(driver.iqamaNumber) ?? dictionary.notAvailable}
        />
        <FormField
          id="driverAppLinkIqamaNumber"
          name="iqamaNumber"
          label={dictionary.appAccount.iqamaNumber}
          type="text"
          inputMode="numeric"
          error={state.fieldErrors?.iqamaNumber}
          placeholder={dictionary.appAccount.iqamaPlaceholder}
          autoComplete="off"
        />
        <p className="-mt-3 text-xs font-medium text-muted">
          {dictionary.appAccount.iqamaHelp}
        </p>
        <ReadOnlyField
          label={dictionary.appAccount.keetaDriverId}
          value={driver.keetaDriverId ?? dictionary.notAvailable}
        />
        <FormField
          id="driverAppAccountSearch"
          name="accountSearch"
          label={dictionary.appAccount.searchExistingAccount}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          autoComplete="off"
        />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">
            {dictionary.appAccount.existingAccount}
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-2">
            {isLoadingAccounts ? (
              <p className="px-3 py-4 text-sm font-medium text-muted">
                {dictionary.loading}
              </p>
            ) : accounts.length === 0 ? (
              <p className="px-3 py-4 text-sm font-medium text-muted">
                {dictionary.appAccount.noEligibleAccounts}
              </p>
            ) : (
              accounts.map((account) => (
                <label
                  key={account.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${
                    selectedAccountId === account.id
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface hover:border-primary/35"
                  }`}
                >
                  <input
                    type="radio"
                    name="selectedExistingAccount"
                    checked={selectedAccountId === account.id}
                    onChange={() => setSelectedAccountId(account.id)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-navy">
                      {account.fullName}
                    </span>
                    <span className="block truncate text-xs font-medium text-muted" dir="ltr">
                      {account.email}
                    </span>
                    {account.mustChangePassword ? (
                      <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                        {dictionary.appAccount.statuses.password_change_required}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>
          {state.fieldErrors?.authUserId ? (
            <p className="text-sm font-medium text-danger">
              {state.fieldErrors.authUserId}
            </p>
          ) : null}
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            name="confirmLink"
            value="true"
            className="mt-1 size-4 accent-primary"
          />
          <span>{dictionary.appAccount.confirmLink}</span>
        </label>
        {state.fieldErrors?.confirmation ? (
          <p className="text-sm font-medium text-danger">
            {state.fieldErrors.confirmation}
          </p>
        ) : null}
        <DialogActions
          cancel={dictionary.cancel}
          submit={dictionary.appAccount.linkSubmit}
          onCancel={onClose}
        />
      </form>
    </ConfirmationFrame>
  );
}

function DriverLoginIdentifierDialog({
  locale,
  dictionary,
  organization,
  driver,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    updateDriverAppLoginIdentifierAction,
    initialDriverAccountActionState,
  );

  useDriverAccountFeedback(state, dictionary, onSuccess, onError);

  return (
    <ConfirmationFrame
      title={dictionary.appAccount.updateLoginTitle}
      description={dictionary.appAccount.updateLoginDescription}
      driverName={driver.fullName}
      warning={null}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <input type="hidden" name="driverId" value={driver.id} />
        <ReadOnlyField
          label={dictionary.appAccount.currentLoginIdentifier}
          value={maskDriverLoginIdentifier(driver.iqamaNumber) ?? dictionary.notAvailable}
        />
        <FormField
          id="driverAppUpdateIqamaNumber"
          name="iqamaNumber"
          label={dictionary.appAccount.iqamaNumber}
          type="text"
          inputMode="numeric"
          error={state.fieldErrors?.iqamaNumber}
          placeholder={dictionary.appAccount.iqamaPlaceholder}
          autoComplete="off"
          required
        />
        <p className="-mt-3 text-xs font-medium text-muted">
          {dictionary.appAccount.updateLoginHelp}
        </p>
        <DialogActions
          cancel={dictionary.cancel}
          submit={dictionary.appAccount.updateLoginSubmit}
          onCancel={onClose}
        />
      </form>
    </ConfirmationFrame>
  );
}

function DriverDialog({
  locale,
  dictionary,
  organization,
  state,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  state: Exclude<DialogState, null>;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const title =
    state.mode === "create"
      ? dictionary.addDriver
      : state.mode === "edit"
        ? dictionary.editDriver
        : dictionary.driverDetails;

  useEffect(() => {
    const firstControl = dialogRef.current?.querySelector<HTMLElement>(
      "input, select, button, a",
    );
    firstControl?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-dialog-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="driver-dialog-title" className="text-xl font-bold text-navy">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {organization.name}
            </p>
          </div>
          <button
            type="button"
            aria-label={dictionary.closeDialog}
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        </div>
        {state.mode === "view" ? (
          <DriverDetails
            locale={locale}
            dictionary={dictionary}
            driver={state.driver}
          />
        ) : (
          <DriverForm
            locale={locale}
            dictionary={dictionary}
            organization={organization}
            driver={state.mode === "edit" ? state.driver : null}
            onCancel={onClose}
            onSuccess={() =>
              onSuccess(
                state.mode === "create"
                  ? dictionary.successCreate
                  : dictionary.successUpdate,
              )
            }
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

function DriverLifecycleDialog({
  locale,
  dictionary,
  organization,
  driver,
  mode,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  mode: "suspend" | "reactivate";
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    setDriverStatusAction,
    initialDriverLifecycleActionState,
  );
  const targetStatus: DriverStatus = mode === "suspend" ? "suspended" : "active";

  useDriverMutationFeedback(state, dictionary, onSuccess, onError);

  return (
    <ConfirmationFrame
      title={
        mode === "suspend"
          ? dictionary.suspendDialogTitle
          : dictionary.reactivateDialogTitle
      }
      description={
        mode === "suspend"
          ? dictionary.suspendDialogDescription
          : dictionary.reactivateDialogDescription
      }
      driverName={driver.fullName}
      warning={null}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <input type="hidden" name="driverId" value={driver.id} />
        <input type="hidden" name="status" value={targetStatus} />
        <DialogActions
          cancel={dictionary.cancel}
          submit={
            mode === "suspend"
              ? dictionary.suspendConfirm
              : dictionary.reactivateConfirm
          }
          onCancel={onClose}
        />
      </form>
    </ConfirmationFrame>
  );
}

function DriverArchiveDialog({
  locale,
  dictionary,
  organization,
  driver,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    archiveDriverAction,
    initialDriverLifecycleActionState,
  );

  useDriverMutationFeedback(state, dictionary, onSuccess, onError);

  return (
    <ConfirmationFrame
      title={dictionary.archiveDialogTitle}
      description={dictionary.archiveDialogDescription}
      driverName={driver.fullName}
      warning={dictionary.archiveDialogWarning}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <input type="hidden" name="driverId" value={driver.id} />
        <DialogActions
          cancel={dictionary.cancel}
          submit={dictionary.archiveConfirm}
          onCancel={onClose}
        />
      </form>
    </ConfirmationFrame>
  );
}

function DriverActivityDialog({
  dictionary,
  locale,
  organization,
  driver,
  onClose,
  onError,
}: {
  dictionary: DriversDictionary;
  locale: Locale;
  organization: AccessibleOrganization;
  driver: DriverListItem;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [logs, setLogs] = useState<DriverActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadLogs() {
      setLoading(true);
      const result = await getDriverActivityLogsAction({
        organizationCode: organization.code,
        driverId: driver.id,
      });

      if (!active) {
        return;
      }

      if (result.status === "success") {
        setLogs(result.logs);
      } else {
        onError(getActionMessage(dictionary, result.code));
      }

      setLoading(false);
    }

    void loadLogs();

    return () => {
      active = false;
    };
  }, [dictionary, driver.id, onError, organization.code]);

  return (
    <ConfirmationFrame
      title={dictionary.activityHistory}
      description={driver.fullName}
      driverName={organization.name}
      warning={null}
      onClose={onClose}
    >
      {loading ? (
        <p className="text-sm font-semibold text-muted">{dictionary.loading}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm font-semibold text-muted">
          {dictionary.emptyActivity}
        </p>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {logs.map((log) => (
            <article
              key={log.id}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">
                    {getActivityLabel(dictionary, log.action)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {log.actor?.fullName ?? dictionary.notAvailable}
                  </p>
                </div>
                <time className="whitespace-nowrap text-xs font-semibold text-muted">
                  {formatDateTime(log.createdAt, locale)}
                </time>
              </div>
              <ActivitySummary dictionary={dictionary} log={log} />
            </article>
          ))}
        </div>
      )}
      <div className="flex justify-end border-t border-border pt-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {dictionary.cancel}
        </button>
      </div>
    </ConfirmationFrame>
  );
}

function DriverForm({
  locale,
  dictionary,
  organization,
  driver,
  onCancel,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  driver: DriverListItem | null;
  onCancel: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    driver ? updateDriverAction : createDriverAction,
    initialDriverActionState,
  );
  const [iqamaFileName, setIqamaFileName] = useState("");
  const [drivingLicenseFileName, setDrivingLicenseFileName] = useState("");
  const [driverCardFileName, setDriverCardFileName] = useState("");
  const [profilePhotoFileName, setProfilePhotoFileName] = useState("");
  const [operatingCardFileName, setOperatingCardFileName] = useState("");
  const hasDrivingLicenseDocument = Boolean(
    driver?.documents.some(
      (document) => document.documentType === "driving_license",
    ),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  useDriverMutationFeedback(state, dictionary, onSuccess, onError);

  useEffect(() => {
    if (state.status !== "validation_error" || !state.fieldErrors) {
      return;
    }

    const [firstField] = Object.keys(
      state.fieldErrors,
    ) as DriverFormFieldName[];
    const firstInvalidField = firstField
      ? formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)
      : null;

    firstInvalidField?.focus();
    firstInvalidField?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state.fieldErrors, state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6 px-5 py-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="organizationCode" value={organization.code} />
      {driver ? <input type="hidden" name="driverId" value={driver.id} /> : null}
      {driver ? (
        <input
          type="hidden"
          name="hasDrivingLicenseDocument"
          value={String(hasDrivingLicenseDocument)}
        />
      ) : null}

      {driver ? (
        <DetailsSection title={dictionary.auditSection}>
          <Detail
            label={dictionary.driverStatus}
            value={dictionary.driverStatuses[driver.status]}
          />
          <Detail
            label={dictionary.createdBy}
            value={driver.createdBy?.fullName ?? dictionary.notAvailable}
          />
          <Detail
            label={dictionary.createdAt}
            value={formatDateTime(driver.createdAt, locale)}
          />
          <Detail
            label={dictionary.updatedBy}
            value={driver.updatedBy?.fullName ?? dictionary.notAvailable}
          />
          <Detail
            label={dictionary.updatedAt}
            value={formatDateTime(driver.updatedAt, locale)}
          />
        </DetailsSection>
      ) : null}

      <FormSection title={dictionary.basicInformation}>
        <div className="sm:col-span-2">
          <FileField
            id="driverProfilePhoto"
            name="profilePhoto"
            label={driver ? dictionary.replacePhoto : dictionary.choosePersonalPhoto}
            required={false}
            help={dictionary.photoFileHelp}
            fileName={profilePhotoFileName}
            error={fieldErrors.profilePhoto}
            currentUrl={driver?.profilePhotoUrl ?? null}
            currentLabel={dictionary.personalPhoto}
            currentPreview={driver?.profilePhotoPreview ?? null}
            accept="image/jpeg,image/png,image/webp"
            dictionary={dictionary}
            onChange={setProfilePhotoFileName}
          />
          {driver?.profilePhotoUrl ? (
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted">
              <input
                type="checkbox"
                name="removeProfilePhoto"
                value="true"
                className="size-4 rounded border-border"
              />
              {dictionary.removePhoto}
            </label>
          ) : null}
        </div>
        <FormField
          id="driverFullName"
          name="fullName"
          label={dictionary.fullName}
          defaultValue={getFieldValue(values, "fullName", driver?.fullName)}
          error={fieldErrors.fullName}
          maxLength={160}
          required
          autoComplete="off"
        />
        <div className="space-y-2">
          <FormField
            id="driverNationality"
            name="nationality"
            label={dictionary.nationality}
            defaultValue={getFieldValue(
              values,
              "nationality",
              driver?.nationality,
            )}
            error={fieldErrors.nationality}
            list="nationality-suggestions"
            maxLength={80}
            required
            autoComplete="off"
          />
          <datalist id="nationality-suggestions">
            {dictionary.nationalitySuggestions.map((nationality) => (
              <option key={nationality} value={nationality} />
            ))}
          </datalist>
        </div>
        <FormField
          id="driverMobileNumber"
          name="mobileNumber"
          label={dictionary.mobileNumber}
          defaultValue={getFieldValue(
            values,
            "mobileNumber",
            driver?.mobileNumber,
          )}
          error={fieldErrors.mobileNumber}
          maxLength={40}
          required
          autoComplete="off"
        />
        <ReadOnlyField
          label={dictionary.currentOrganization}
          value={organization.name}
        />
        <FormField
          id="driverKeetaUsername"
          name="keetaUsername"
          label={dictionary.keetaUsername}
          defaultValue={getFieldValue(
            values,
            "keetaUsername",
            driver?.keetaUsername,
          )}
          error={fieldErrors.keetaUsername}
          maxLength={120}
          required
          autoComplete="off"
        />
        <FormField
          id="driverKeetaDriverId"
          name="keetaDriverId"
          label={dictionary.keetaDriverId}
          defaultValue={getFieldValue(
            values,
            "keetaDriverId",
            driver?.keetaDriverId ?? "",
          )}
          error={fieldErrors.keetaDriverId}
          maxLength={120}
          autoComplete="off"
        />
        <SelectField
          id="driverSponsorship"
          name="isCompanySponsored"
          label={dictionary.isCompanySponsored}
          defaultValue={getFieldValue(
            values,
            "isCompanySponsored",
            String(driver?.isCompanySponsored ?? true),
          )}
          error={fieldErrors.isCompanySponsored}
        >
          <option value="true">{dictionary.yes}</option>
          <option value="false">{dictionary.no}</option>
        </SelectField>
        <SelectField
          id="driverVehicleOwnership"
          name="isVehicleOwner"
          label={dictionary.isVehicleOwner}
          defaultValue={getFieldValue(
            values,
            "isVehicleOwner",
            driver?.isVehicleOwner === null || driver?.isVehicleOwner === undefined
              ? ""
              : String(driver.isVehicleOwner),
          )}
          error={fieldErrors.isVehicleOwner}
        >
          <option value="" disabled>
            {dictionary.selectPlaceholder}
          </option>
          <option value="true">{dictionary.yes}</option>
          <option value="false">{dictionary.no}</option>
        </SelectField>
        <SelectField
          id="driverSettlementType"
          name="settlementType"
          label={dictionary.settlementType}
          defaultValue={getFieldValue(
            values,
            "settlementType",
            driver?.settlementType ?? "",
          )}
          error={fieldErrors.settlementType}
        >
          <option value="" disabled>
            {dictionary.selectPlaceholder}
          </option>
          {settlementTypes.map((settlementType) => (
            <option key={settlementType} value={settlementType}>
              {dictionary.settlementTypes[settlementType]}
            </option>
          ))}
        </SelectField>
      </FormSection>

      <FormSection title={dictionary.vehicle}>
        <SelectField
          id="driverVehicleType"
          name="vehicleType"
          label={dictionary.vehicleType}
          defaultValue={getFieldValue(
            values,
            "vehicleType",
            driver?.vehicleType ?? "motorcycle",
          )}
          error={fieldErrors.vehicleType}
        >
          {vehicleTypes.map((vehicleType) => (
            <option key={vehicleType} value={vehicleType}>
              {dictionary.vehicleTypes[vehicleType]}
            </option>
          ))}
        </SelectField>
        <FormField
          id="driverVehicleNumber"
          name="vehicleNumber"
          label={dictionary.vehiclePlateNumber}
          defaultValue={getFieldValue(
            values,
            "vehicleNumber",
            driver?.vehicleNumber,
          )}
          error={fieldErrors.vehicleNumber}
          maxLength={80}
          required
          autoComplete="off"
        />
        <FormField
          id="driverKeetaVehiclePlateNumber"
          name="keetaVehiclePlateNumber"
          label={dictionary.keetaVehiclePlateNumber}
          defaultValue={getFieldValue(
            values,
            "keetaVehiclePlateNumber",
            driver?.keetaVehiclePlateNumber ?? "",
          )}
          error={fieldErrors.keetaVehiclePlateNumber}
          maxLength={80}
          autoComplete="off"
        />
        <FormField
          id="driverVehicleBrand"
          name="vehicleBrand"
          label={dictionary.vehicleBrand}
          defaultValue={getFieldValue(
            values,
            "vehicleBrand",
            driver?.vehicleBrand ?? "",
          )}
          error={fieldErrors.vehicleBrand}
          maxLength={120}
          required
          autoComplete="off"
        />
      </FormSection>

      <FormSection title={dictionary.banking} description={dictionary.bankingOptional}>
        <FormField
          id="driverIban"
          name="iban"
          label={dictionary.iban}
          defaultValue={getFieldValue(values, "iban", driver?.iban ?? "")}
          error={fieldErrors.iban}
          maxLength={34}
          autoComplete="off"
        />
        <FormField
          id="driverBankName"
          name="bankName"
          label={dictionary.bankName}
          defaultValue={getFieldValue(values, "bankName", driver?.bankName ?? "")}
          error={fieldErrors.bankName}
          maxLength={120}
          autoComplete="off"
        />
        <FormField
          id="driverAccountNumber"
          name="accountNumber"
          label={dictionary.accountNumber}
          defaultValue={getFieldValue(
            values,
            "accountNumber",
            driver?.accountNumber ?? "",
          )}
          error={fieldErrors.accountNumber}
          maxLength={60}
          autoComplete="off"
        />
      </FormSection>

      <FormSection title={dictionary.documents}>
        <DocumentGroup title={dictionary.iqama}>
          <FormField
            id="driverIqamaNumber"
            name="iqamaNumber"
            label={dictionary.iqamaNumber}
            defaultValue={getFieldValue(
              values,
              "iqamaNumber",
              driver?.iqamaNumber,
            )}
            error={fieldErrors.iqamaNumber}
            maxLength={40}
            required
            autoComplete="off"
          />
          <FormField
            id="driverIqamaExpiryDate"
            name="iqamaExpiryDate"
            type="date"
            label={dictionary.iqamaExpiryDate}
            defaultValue={getFieldValue(
              values,
              "iqamaExpiryDate",
              driver?.iqamaExpiryDate,
            )}
            error={fieldErrors.iqamaExpiryDate}
            required
          />
          <FileField
            id="driverIqamaDocument"
            name="iqamaDocument"
            label={driver ? dictionary.replaceDocument : dictionary.iqamaDocument}
            required={!driver}
            help={dictionary.fileHelp}
            fileName={iqamaFileName}
            error={fieldErrors.iqamaDocument}
            currentDocument={driver?.documents.find(
              (document) => document.documentType === "iqama",
            )}
            dictionary={dictionary}
            onChange={setIqamaFileName}
          />
        </DocumentGroup>

        <DocumentGroup title={dictionary.drivingLicense}>
          <FormField
            id="driverDrivingLicenseNumber"
            name="drivingLicenseNumber"
            label={dictionary.drivingLicenseNumber}
            defaultValue={getFieldValue(
              values,
              "drivingLicenseNumber",
              driver?.drivingLicenseNumber ?? "",
            )}
            error={fieldErrors.drivingLicenseNumber}
            maxLength={60}
            required
            autoComplete="off"
          />
          <FormField
            id="driverDrivingLicenseExpiryDate"
            name="drivingLicenseExpiryDate"
            type="date"
            label={dictionary.drivingLicenseExpiryDate}
            defaultValue={getFieldValue(
              values,
              "drivingLicenseExpiryDate",
              driver?.drivingLicenseExpiryDate ?? "",
            )}
            error={fieldErrors.drivingLicenseExpiryDate}
            required
          />
          <FileField
            id="driverDrivingLicenseDocument"
            name="drivingLicenseDocument"
            label={
              driver
                ? dictionary.replaceDocument
                : dictionary.drivingLicenseDocument
            }
            required={!driver || !hasDrivingLicenseDocument}
            help={dictionary.fileHelp}
            fileName={drivingLicenseFileName}
            error={fieldErrors.drivingLicenseDocument}
            currentDocument={driver?.documents.find(
              (document) => document.documentType === "driving_license",
            )}
            dictionary={dictionary}
            onChange={setDrivingLicenseFileName}
          />
        </DocumentGroup>

        <DocumentGroup title={dictionary.driverCard}>
          <FormField
            id="driverDriverCardNumber"
            name="driverCardNumber"
            label={dictionary.driverCardNumber}
            defaultValue={getFieldValue(
              values,
              "driverCardNumber",
              driver?.driverCardNumber,
            )}
            error={fieldErrors.driverCardNumber}
            maxLength={60}
            required
            autoComplete="off"
          />
          <FormField
            id="driverDriverCardExpiryDate"
            name="driverCardExpiryDate"
            type="date"
            label={dictionary.driverCardExpiryDate}
            defaultValue={getFieldValue(
              values,
              "driverCardExpiryDate",
              driver?.driverCardExpiryDate,
            )}
            error={fieldErrors.driverCardExpiryDate}
            required
          />
          <FileField
            id="driverDriverCardDocument"
            name="driverCardDocument"
            label={
              driver ? dictionary.replaceDocument : dictionary.driverCardDocument
            }
            required={!driver}
            help={dictionary.fileHelp}
            fileName={driverCardFileName}
            error={fieldErrors.driverCardDocument}
            currentDocument={driver?.documents.find(
              (document) => document.documentType === "driver_card",
            )}
            dictionary={dictionary}
            onChange={setDriverCardFileName}
          />
        </DocumentGroup>

        <DocumentGroup title={dictionary.vehicleRegistration}>
          <ReadOnlyField
            label={dictionary.vehiclePlateNumber}
            value={getFieldValue(
              values,
              "vehicleNumber",
              driver?.vehicleNumber,
            )}
          />
          <FormField
            id="driverVehicleSerialNumber"
            name="vehicleSerialNumber"
            label={dictionary.vehicleSerialNumber}
            defaultValue={getFieldValue(
              values,
              "vehicleSerialNumber",
              driver?.vehicleSerialNumber ?? "",
            )}
            error={fieldErrors.vehicleSerialNumber}
            maxLength={80}
            required
            autoComplete="off"
          />
          <FormField
            id="driverVehicleOwnerIdentifier"
            name="vehicleOwnerIdentifier"
            label={dictionary.vehicleOwnerIdentifier}
            defaultValue={getFieldValue(
              values,
              "vehicleOwnerIdentifier",
              driver?.vehicleOwnerIdentifier ?? "",
            )}
            error={fieldErrors.vehicleOwnerIdentifier}
            maxLength={80}
            required
            autoComplete="off"
          />
          <ReadOnlyField
            label={dictionary.vehicleBrand}
            value={getFieldValue(
              values,
              "vehicleBrand",
              driver?.vehicleBrand ?? dictionary.incomplete,
            )}
          />
        </DocumentGroup>

        <DocumentGroup title={dictionary.vehicleAuthorization}>
          <FormField
            id="driverVehicleAuthorizationNumber"
            name="vehicleAuthorizationNumber"
            label={dictionary.vehicleAuthorizationNumber}
            defaultValue={getFieldValue(
              values,
              "vehicleAuthorizationNumber",
              driver?.vehicleAuthorizationNumber,
            )}
            error={fieldErrors.vehicleAuthorizationNumber}
            maxLength={80}
            required
            autoComplete="off"
          />
          <FormField
            id="driverVehicleAuthorizationExpiryDate"
            name="vehicleAuthorizationExpiryDate"
            type="date"
            label={dictionary.vehicleAuthorizationExpiryDate}
            defaultValue={getFieldValue(
              values,
              "vehicleAuthorizationExpiryDate",
              driver?.vehicleAuthorizationExpiryDate,
            )}
            error={fieldErrors.vehicleAuthorizationExpiryDate}
            required
          />
        </DocumentGroup>

        <DocumentGroup title={dictionary.operatingCard}>
          <FormField
            id="driverOperatingCardNumber"
            name="operatingCardNumber"
            label={dictionary.operatingCardNumber}
            defaultValue={getFieldValue(
              values,
              "operatingCardNumber",
              driver?.operatingCardNumber ?? "",
            )}
            error={fieldErrors.operatingCardNumber}
            maxLength={80}
            autoComplete="off"
          />
          <FormField
            id="driverOperatingCardExpiryDate"
            name="operatingCardExpiryDate"
            type="date"
            label={dictionary.operatingCardExpiryDate}
            defaultValue={getFieldValue(
              values,
              "operatingCardExpiryDate",
              driver?.operatingCardExpiryDate ?? "",
            )}
            error={fieldErrors.operatingCardExpiryDate}
          />
          <FileField
            id="driverOperatingCardFile"
            name="operatingCardFile"
            label={dictionary.operatingCardFile}
            required={false}
            help={dictionary.fileHelp}
            fileName={operatingCardFileName}
            error={fieldErrors.operatingCardFile}
            currentUrl={driver?.operatingCardFileUrl ?? null}
            currentLabel={dictionary.operatingCardFile}
            currentPreview={driver?.operatingCardFilePreview ?? null}
            dictionary={dictionary}
            onChange={setOperatingCardFileName}
          />
          {driver?.operatingCardFileUrl ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-muted">
              <input
                type="checkbox"
                name="removeOperatingCardFile"
                value="true"
                className="size-4 rounded border-border"
              />
              {dictionary.removePhoto}
            </label>
          ) : null}
        </DocumentGroup>
      </FormSection>

      <DialogActions
        cancel={dictionary.cancel}
        submit={driver ? dictionary.save : dictionary.create}
        onCancel={onCancel}
      />
    </form>
  );
}

function DriverDetails({
  locale,
  dictionary,
  driver,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  driver: DriverListItem;
}) {
  return (
    <div className="space-y-6 px-5 py-5">
      <DetailsSection title={dictionary.auditSection}>
        <Detail
          label={dictionary.driverStatus}
          value={dictionary.driverStatuses[driver.status]}
        />
        <Detail
          label={dictionary.createdBy}
          value={driver.createdBy?.fullName ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.createdAt}
          value={formatDateTime(driver.createdAt, locale)}
        />
        <Detail
          label={dictionary.updatedBy}
          value={driver.updatedBy?.fullName ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.updatedAt}
          value={formatDateTime(driver.updatedAt, locale)}
        />
      </DetailsSection>
      <DetailsSection title={dictionary.basicInformation}>
        {driver.profilePhotoUrl ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-navy">
              {dictionary.personalPhoto}
            </p>
            <img
              src={driver.profilePhotoUrl}
              alt=""
              className="size-24 rounded-xl border border-border object-cover"
            />
          </div>
        ) : (
          <Detail label={dictionary.personalPhoto} value={dictionary.notAvailable} />
        )}
        <Detail label={dictionary.fullName} value={driver.fullName} />
        <Detail label={dictionary.nationality} value={driver.nationality} />
        <Detail label={dictionary.mobileNumber} value={driver.mobileNumber} />
        <Detail
          label={dictionary.currentOrganization}
          value={driver.organizationName}
        />
        <Detail label={dictionary.keetaUsername} value={driver.keetaUsername} />
        <Detail
          label={dictionary.keetaDriverId}
          value={driver.keetaDriverId ?? dictionary.incomplete}
        />
        <Detail
          label={dictionary.isCompanySponsored}
          value={driver.isCompanySponsored ? dictionary.yes : dictionary.no}
        />
      </DetailsSection>
      <DetailsSection title={dictionary.vehicleRegistration}>
        <Detail
          label={dictionary.vehicleType}
          value={dictionary.vehicleTypes[driver.vehicleType]}
        />
        <Detail
          label={dictionary.vehiclePlateNumber}
          value={driver.vehicleNumber}
        />
        <Detail
          label={dictionary.keetaVehiclePlateNumber}
          value={driver.keetaVehiclePlateNumber ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.vehicleSerialNumber}
          value={driver.vehicleSerialNumber ?? dictionary.incomplete}
        />
        <Detail
          label={dictionary.vehicleOwnerIdentifier}
          value={driver.vehicleOwnerIdentifier ?? dictionary.incomplete}
        />
        <Detail
          label={dictionary.vehicleBrand}
          value={driver.vehicleBrand ?? dictionary.incomplete}
        />
        <Detail
          label={dictionary.isVehicleOwner}
          value={
            driver.isVehicleOwner === null
              ? dictionary.incomplete
              : driver.isVehicleOwner
                ? dictionary.yes
                : dictionary.no
          }
        />
        <Detail
          label={dictionary.settlementType}
          value={
            driver.settlementType
              ? dictionary.settlementTypes[driver.settlementType]
              : dictionary.incomplete
          }
        />
      </DetailsSection>
      <DetailsSection title={dictionary.banking}>
        <Detail label={dictionary.iban} value={driver.iban ?? dictionary.notAvailable} />
        <Detail label={dictionary.bankName} value={driver.bankName ?? dictionary.notAvailable} />
        <Detail
          label={dictionary.accountNumber}
          value={driver.accountNumber ?? dictionary.notAvailable}
        />
      </DetailsSection>
      <DetailsSection title={dictionary.documents}>
        <Detail label={dictionary.iqamaNumber} value={driver.iqamaNumber} />
        <Detail
          label={dictionary.iqamaExpiryDate}
          value={formatDate(driver.iqamaExpiryDate, locale)}
        />
        <DocumentLink
          document={driver.documents.find(
            (item) => item.documentType === "iqama",
          )}
          dictionary={dictionary}
        />
        <Detail
          label={dictionary.drivingLicenseNumber}
          value={driver.drivingLicenseNumber ?? dictionary.incomplete}
        />
        <Detail
          label={dictionary.drivingLicenseExpiryDate}
          value={formatOptionalDate(
            driver.drivingLicenseExpiryDate,
            locale,
            dictionary.incomplete,
          )}
        />
        <DocumentLink
          document={driver.documents.find(
            (item) => item.documentType === "driving_license",
          )}
          dictionary={dictionary}
        />
        <Detail
          label={dictionary.driverCardNumber}
          value={driver.driverCardNumber}
        />
        <Detail
          label={dictionary.driverCardExpiryDate}
          value={formatDate(driver.driverCardExpiryDate, locale)}
        />
        <DocumentLink
          document={driver.documents.find(
            (item) => item.documentType === "driver_card",
          )}
          dictionary={dictionary}
        />
        <Detail
          label={dictionary.vehicleAuthorizationNumber}
          value={driver.vehicleAuthorizationNumber}
        />
        <Detail
          label={dictionary.vehicleAuthorizationExpiryDate}
          value={formatDate(driver.vehicleAuthorizationExpiryDate, locale)}
        />
        <Detail
          label={dictionary.operatingCardNumber}
          value={driver.operatingCardNumber ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.operatingCardExpiryDate}
          value={formatOptionalDate(
            driver.operatingCardExpiryDate,
            locale,
            dictionary.notAvailable,
          )}
        />
        <DocumentLink
          documentUrl={driver.operatingCardFileUrl}
          documentLabel={dictionary.operatingCardFile}
          dictionary={dictionary}
        />
      </DetailsSection>
    </div>
  );
}

function EmptyState({
  dictionary,
  canManage,
  onCreate,
}: {
  dictionary: DriversDictionary;
  canManage: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <h2 className="text-lg font-bold text-navy">{dictionary.emptyTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {dictionary.emptyDescription}
      </p>
      {canManage ? (
        <Button type="button" onClick={onCreate} className="mt-5 gap-2">
          <PlusIcon />
          {dictionary.addDriver}
        </Button>
      ) : null}
    </div>
  );
}

function ConfirmationFrame({
  title,
  description,
  driverName,
  warning,
  onClose,
  children,
}: {
  title: string;
  description: string;
  driverName: string;
  warning: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-confirmation-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2
              id="driver-confirmation-title"
              className="text-xl font-bold text-navy"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{driverName}</p>
          </div>
          <button
            type="button"
            aria-label={title}
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-6 text-muted">{description}</p>
          {warning ? (
            <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
              {warning}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function ActivitySummary({
  dictionary,
  log,
}: {
  dictionary: DriversDictionary;
  log: DriverActivityLog;
}) {
  const parts: string[] = [];

  if (log.summary.newStatus) {
    parts.push(
      dictionary.activityStatusChanged
        .replace(
          "{from}",
          log.summary.previousStatus
            ? dictionary.driverStatuses[log.summary.previousStatus]
            : dictionary.notAvailable,
        )
        .replace("{to}", dictionary.driverStatuses[log.summary.newStatus]),
    );
  }

  if (log.summary.replacedDocumentCount) {
    parts.push(
      dictionary.activityDocumentsReplaced.replace(
        "{count}",
        String(log.summary.replacedDocumentCount),
      ),
    );
  }

  if (log.summary.vehicleOwnerIdentifierChanged) {
    parts.push(dictionary.activityOwnerIdentifierChanged);
  }

  if (parts.length === 0) {
    parts.push(dictionary.activitySafeSummary);
  }

  return (
    <ul className="mt-3 space-y-1 text-xs font-semibold text-muted">
      {parts.map((part) => (
        <li key={part}>{part}</li>
      ))}
    </ul>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div>
        <h3 className="text-base font-bold text-navy">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm font-medium text-muted">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function DocumentGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4 md:col-span-2">
      <h4 className="text-sm font-bold text-navy">{title}</h4>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function DetailsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-base font-bold text-navy">{title}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-navy">{value}</p>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 md:col-span-2">
      <p className="block text-sm font-semibold text-navy">{label}</p>
      <div className="flex min-h-12 items-center rounded-xl border border-border bg-background px-4 text-base font-semibold text-muted">
        {value}
      </div>
    </div>
  );
}

function FileField({
  id,
  name,
  label,
  required,
  help,
  fileName,
  currentDocument,
  currentUrl,
  currentLabel,
  currentPreview,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  dictionary,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  required: boolean;
  help: string;
  fileName: string;
  currentDocument?: DriverDocumentMetadata;
  currentUrl?: string | null;
  currentLabel?: string;
  currentPreview?: {
    fileName: string;
    downloadUrl: string;
  } | null;
  accept?: string;
  dictionary: DriversDictionary;
  error?: string;
  onChange: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = error ? `${id}-error` : undefined;
  const activeFile = getCurrentFileRow({
    document: currentDocument,
    currentPreview,
    currentUrl,
    currentLabel,
    fallbackLabel: label,
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    onChange(file?.name ?? "");
  }

  function clearSelectedFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    onChange("");
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      {activeFile ? (
        <CurrentDriverFileRow
          label={dictionary.currentDocument}
          fileName={activeFile.fileName}
          downloadUrl={activeFile.downloadUrl}
          dictionary={dictionary}
        />
      ) : null}
      {fileName ? (
        <SelectedDriverFileRow
          fileName={fileName}
          dictionary={dictionary}
          onRemove={clearSelectedFile}
        />
      ) : null}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        required={required}
        accept={accept}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={handleFileChange}
        className={`block w-full rounded-xl border bg-white px-4 py-3 text-sm text-navy file:me-4 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary focus:outline-none focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted">
        {fileName || dictionary.noFileSelected} · {help}
      </p>
    </div>
  );
}

function CurrentDriverFileRow({
  label,
  fileName,
  downloadUrl,
  dictionary,
}: {
  label: string;
  fileName: string;
  downloadUrl: string;
  dictionary: DriversDictionary;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold text-navy"
          dir="auto"
          title={fileName}
        >
          {fileName}
        </p>
        <a
          href={downloadUrl}
          download={fileName}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <DownloadIcon />
          {dictionary.download}
        </a>
      </div>
    </div>
  );
}

function SelectedDriverFileRow({
  fileName,
  dictionary,
  onRemove,
}: {
  fileName: string;
  dictionary: DriversDictionary;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted">
        {dictionary.newSelectedFile}
      </p>
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold text-navy"
          dir="auto"
          title={fileName}
        >
          {fileName}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-danger/35 hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {dictionary.removeSelectedFile}
        </button>
      </div>
    </div>
  );
}

function getCurrentFileRow({
  document,
  currentPreview,
  currentUrl,
  currentLabel,
  fallbackLabel,
}: {
  document?: DriverDocumentMetadata;
  currentPreview?: {
    fileName: string;
    downloadUrl: string;
  } | null;
  currentUrl?: string | null;
  currentLabel?: string;
  fallbackLabel: string;
}) {
  const downloadUrl =
    document?.preview?.downloadUrl ??
    currentPreview?.downloadUrl ??
    document?.signedUrl ??
    currentUrl ??
    null;

  if (!downloadUrl) {
    return null;
  }

  return {
    fileName:
      document?.originalFilename ??
      currentPreview?.fileName ??
      currentLabel ??
      fallbackLabel,
    downloadUrl,
  };
}
function DocumentLink({
  document,
  documentUrl,
  documentLabel,
  dictionary,
}: {
  document?: DriverDocumentMetadata;
  documentUrl?: string | null;
  documentLabel?: string;
  dictionary: DriversDictionary;
}) {
  const href = document?.signedUrl ?? documentUrl;
  const label = document?.originalFilename ?? documentLabel;

  if (!href) {
    return <Detail label={dictionary.currentDocument} value="-" />;
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted">
        {dictionary.currentDocument}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex break-all text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {dictionary.openDocument}: {label}
      </a>
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  defaultValue,
  children,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  children: React.ReactNode;
  error?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-12 w-full rounded-xl border bg-white px-4 text-base text-navy outline-none transition focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DialogActions({
  cancel,
  submit,
  onCancel,
}: {
  cancel: string;
  submit: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {cancel}
      </button>
      <Button type="submit" disabled={pending}>
        {pending ? `${submit}...` : submit}
      </Button>
    </div>
  );
}

function TableHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-start ${className}`}>{children}</th>;
}

function DateCell({
  value,
  locale,
  dictionary,
  today,
  fallback = "-",
}: {
  value: string | null;
  locale: Locale;
  dictionary: DriversDictionary;
  today: string;
  fallback?: string;
}) {
  if (!value) {
    return (
      <td className="min-w-40 whitespace-nowrap px-4 py-4 text-center text-sm font-medium text-muted">
        {fallback}
      </td>
    );
  }

  const status = getExpiryStatus(value, today);

  return (
    <td className="min-w-44 whitespace-nowrap px-4 py-4 text-center">
      <p className="whitespace-nowrap text-sm font-semibold text-navy">
        {formatDate(value, locale)}
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-xs font-semibold ${getExpiryClassName(
          status,
        )}`}
      >
        {formatExpiryStatus(status, dictionary)}
      </p>
    </td>
  );
}

function ActorCell({
  actorName,
  dictionary,
}: {
  actorName?: string;
  dictionary: DriversDictionary;
}) {
  return (
    <td className="max-w-[220px] px-4 py-4">
      <p className="truncate text-sm font-semibold text-navy">
        {actorName ?? dictionary.notAvailable}
      </p>
    </td>
  );
}

function StatusBadge({
  status,
  dictionary,
}: {
  status: DriverStatus;
  dictionary: DriversDictionary;
}) {
  const isActive = status === "active";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {dictionary.driverStatuses[status]}
    </span>
  );
}

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
          ? "border-danger/20 text-danger hover:bg-danger/10"
          : "border-border text-muted hover:bg-primary-soft hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function AccessBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted">
      {children}
    </span>
  );
}

function useDriverMutationFeedback(
  state: {
    status: "idle" | "validation_error" | "success" | "error";
    code?: string;
    message?: string;
  },
  dictionary: DriversDictionary,
  onSuccess: () => void,
  onError: (message: string) => void,
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

    const key = `${state.status}:${state.code ?? ""}`;

    if (handledKeyRef.current === key) {
      return;
    }

    handledKeyRef.current = key;

    if (state.status === "success") {
      callbacksRef.current.onSuccess();
      return;
    }

    callbacksRef.current.onError(
      state.message ??
        getActionMessage(callbacksRef.current.dictionary, state.code),
    );
  }, [state.code, state.message, state.status]);
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function maskDriverLoginIdentifier(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 4 ? `******${digits.slice(-4)}` : null;
}

function useDriverAccountFeedback(
  state: {
    status: "idle" | "validation_error" | "success" | "error";
    code?: string;
    diagnosticCode?: string;
    failedStage?: string;
  },
  dictionary: DriversDictionary,
  onSuccess: () => void,
  onError: (message: string) => void,
) {
  const callbacksRef = useRef({ dictionary, onSuccess, onError });
  const handledKeyRef = useRef("");

  useEffect(() => {
    callbacksRef.current = { dictionary, onSuccess, onError };
  }, [dictionary, onError, onSuccess]);

  useEffect(() => {
    if (state.status === "idle" || state.status === "validation_error") {
      if (state.status === "idle") handledKeyRef.current = "";
      return;
    }

    const key = `${state.status}:${state.code ?? ""}`;

    if (handledKeyRef.current === key) {
      return;
    }

    handledKeyRef.current = key;

    if (state.status === "success") {
      callbacksRef.current.onSuccess();
      return;
    }

    callbacksRef.current.onError(
      getDriverAccountMessage(
        callbacksRef.current.dictionary,
        state.code,
        state.diagnosticCode,
        state.failedStage,
      ),
    );
  }, [state.code, state.diagnosticCode, state.failedStage, state.status]);
}

function getDriverAccountMessage(
  dictionary: DriversDictionary,
  code: string | undefined,
  diagnosticCode?: string,
  failedStage?: string,
) {
  const errors = dictionary.appAccount.errors;

  if (!code || code === "success") {
    return dictionary.appAccount.success;
  }

  const message = errors[code as keyof typeof errors] ?? errors.create_failed;

  if (process.env.NODE_ENV === "production" || !diagnosticCode) {
    return message;
  }

  return failedStage
    ? `${message} (${diagnosticCode}: ${failedStage})`
    : `${message} (${diagnosticCode})`;
}

function getActionMessage(
  dictionary: DriversDictionary,
  code: string | undefined,
) {
  switch (code as DriverMutationErrorCode | undefined) {
    case "validation_error":
      return dictionary.validationSummary;
    case "unauthorized":
      return dictionary.unauthorized;
    case "organization_unavailable":
      return dictionary.organizationUnavailable;
    case "invalid_driver":
      return dictionary.invalidDriver;
    case "driver_wrong_organization":
      return dictionary.driverWrongOrganization;
    case "already_archived":
      return dictionary.alreadyArchived;
    case "duplicate_iqama":
      return dictionary.duplicateIqama;
    case "duplicate_keeta_driver_id":
      return dictionary.duplicateKeetaDriverId;
    case "upload_failed":
      return dictionary.uploadFailed;
    case "document_invalid":
      return dictionary.documentInvalid;
    case "configuration_error":
      return dictionary.configurationError;
    case "update_failed":
      return dictionary.updateFailed;
    default:
      return dictionary.createFailed;
  }
}

function formatExpiryStatus(status: ExpiryStatus, dictionary: DriversDictionary) {
  switch (status.state) {
    case "valid":
      return dictionary.daysRemaining.replace("{days}", String(status.days));
    case "today":
      return dictionary.expiresToday;
    case "expired":
      return dictionary.daysExpired.replace("{days}", String(status.days));
  }
}

function getExpiryClassName(status: ExpiryStatus) {
  if (status.state === "expired") {
    return "text-danger";
  }

  if (status.state === "today" || status.days <= 30) {
    return "text-amber-700";
  }

  return "text-emerald-700";
}

function getFieldValue(
  values: DriverFormValues,
  field: DriverFormFieldName,
  fallback = "",
) {
  return values[field] ?? fallback;
}

function getDriverInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";

  return `${first}${last}`.toUpperCase();
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatOptionalDate(value: string | null, locale: Locale, fallback: string) {
  return value ? formatDate(value, locale) : fallback;
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getActivityLabel(dictionary: DriversDictionary, action: string) {
  return (
    dictionary.activityActions[
      action as keyof typeof dictionary.activityActions
    ] ?? action
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="m4 16.8-.7 3.9 3.9-.7L18.6 8.6 15.4 5.4 4 16.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="m14.6 6.2 3.2 3.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function SuspendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M8 6v12M16 6v12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ReactivateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M8 5v14l11-7L8 5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M4 7h16M6 7v12h12V7M9 11h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="m8 7 .8-3h6.4l.8 3"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d="M5 12h3l2-5 4 10 2-5h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
