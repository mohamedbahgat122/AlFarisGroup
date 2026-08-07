"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OrganizationAccessFields } from "@/components/dashboard/users/organization-access-fields";
import { createManagedUserAction } from "@/features/user-management/actions";
import { initialCreateManagedUserActionState } from "@/features/user-management/action-state";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
  ManagedUserRole,
} from "@/features/user-management/types";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { Locale } from "@/types/locale";

type CreateUserFormProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  organizations: ActiveOrganizationOption[];
  onCancel: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

const roleOptions: ManagedUserRole[] = ["manager", "supervisor", "driver"];

export function CreateUserForm({
  locale,
  dictionary,
  organizations,
  onCancel,
  onSuccess,
  onError,
}: CreateUserFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createManagedUserAction,
    initialCreateManagedUserActionState,
  );
  const [role, setRole] = useState<ManagedUserRole>("manager");
  const [homeOrganizationId, setHomeOrganizationId] = useState("");
  const [accessValues, setAccessValues] = useState<
    Record<string, OrganizationPermissionKey[]>
  >({});
  const [showPassword, setShowPassword] = useState(false);
  const callbacksRef = useRef({ dictionary, onSuccess, onError });
  const handledKeyRef = useRef("");

  useEffect(() => {
    callbacksRef.current = { dictionary, onSuccess, onError };
  }, [dictionary, onError, onSuccess]);

  const activeOrganizationIds = useMemo(
    () => new Set(organizations.map((organization) => organization.id)),
    [organizations],
  );

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
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRole("manager");
      setHomeOrganizationId("");
      setAccessValues({});
      callbacksRef.current.onSuccess();
    }

    if (state.status === "error") {
      callbacksRef.current.onError(
        getActionMessage(callbacksRef.current.dictionary, state.code),
      );
    }
  }, [state.code, state.status]);

  const additionalAccess = useMemo(
    () =>
      role === "driver"
        ? []
        : Object.entries(accessValues)
            .filter(
              ([organizationId, permissionKeys]) =>
                activeOrganizationIds.has(organizationId) &&
                permissionKeys.length > 0,
            )
            .map(([organizationId, permissionKeys]) => ({
              organizationId,
              permissionKeys,
            })),
    [accessValues, activeOrganizationIds, role],
  );

  const message = getActionMessage(dictionary, state.code);
  const messageTone =
    state.status === "success" ? "text-emerald-700" : "text-danger";

  return (
    <form ref={formRef} action={formAction} className="space-y-5 px-5 py-5">
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="additionalAccess"
        value={JSON.stringify(additionalAccess)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="fullName"
          name="fullName"
          label={dictionary.fullName}
          placeholder={dictionary.placeholders.fullName}
          maxLength={160}
          required
          autoComplete="off"
        />
        <FormField
          id="email"
          name="email"
          type="email"
          label={dictionary.email}
          placeholder={dictionary.placeholders.email}
          required
          autoComplete="off"
        />
        <FormField
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          label={dictionary.initialPassword}
          minLength={8}
          required
          autoComplete="new-password"
          trailingControl={
            <button
              type="button"
              aria-label={
                showPassword ? dictionary.hidePassword : dictionary.showPassword
              }
              onClick={() => setShowPassword((current) => !current)}
              className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <PasswordIcon visible={showPassword} />
            </button>
          }
        />
        <div className="space-y-2">
          <label htmlFor="role" className="block text-sm font-semibold text-navy">
            {dictionary.globalRole}
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as ManagedUserRole;
              setRole(nextRole);

              if (nextRole === "driver") {
                setAccessValues({});
              }
            }}
            className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-base text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            required
          >
            {roleOptions.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {dictionary.roleLabels[roleOption]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FormField
            id="jobTitle"
            name="jobTitle"
            label={dictionary.jobTitle}
            placeholder={dictionary.placeholders.jobTitle}
            maxLength={160}
            required
            autoComplete="off"
          />
          <p className="text-xs leading-5 text-muted">{dictionary.jobTitleHelp}</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="homeOrganizationId"
            className="block text-sm font-semibold text-navy"
          >
            {dictionary.homeOrganization}
          </label>
          <select
            id="homeOrganizationId"
            name="homeOrganizationId"
            value={homeOrganizationId}
            onChange={(event) => {
              const nextHomeOrganizationId = event.target.value;
              setHomeOrganizationId(nextHomeOrganizationId);

              setAccessValues((current) => {
                const next = { ...current };
                delete next[nextHomeOrganizationId];
                return next;
              });
            }}
            className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-base text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            required
          >
            <option value="">{dictionary.selectOrganization}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {role === "driver" ? (
        <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted">
          {dictionary.driverAccessNote}
        </div>
      ) : (
        <OrganizationAccessFields
          dictionary={dictionary}
          organizations={organizations}
          homeOrganizationId={homeOrganizationId}
          includeHomeOrganization={true}
          values={accessValues}
          onChange={(organizationId, permissionKeys) =>
            setAccessValues((current) => {
              const next = { ...current };

              if (permissionKeys.length === 0) {
                delete next[organizationId];
              } else {
                next[organizationId] = permissionKeys;
              }

              return next;
            })
          }
        />
      )}

      <div role="alert" aria-live="polite" className={`min-h-5 text-sm ${messageTone}`}>
        {message}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {dictionary.cancel}
        </button>
        <SubmitButton dictionary={dictionary} />
      </div>
    </form>
  );
}

function SubmitButton({
  dictionary,
}: {
  dictionary: Dictionary["dashboard"]["userManagement"];
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? dictionary.creating : dictionary.create}
    </Button>
  );
}

function getActionMessage(
  dictionary: Dictionary["dashboard"]["userManagement"],
  code: string | undefined,
) {
  switch (code) {
    case "success":
      return dictionary.success;
    case "validation_error":
      return dictionary.validationError;
    case "email_already_exists":
      return dictionary.emailAlreadyExists;
    case "organization_not_found":
      return dictionary.organizationNotFound;
    case "organization_inactive":
      return dictionary.organizationInactive;
    case "additional_organization_invalid":
      return dictionary.additionalOrganizationInvalid;
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
    case "creation_failed":
    case "update_failed":
      return dictionary.creationFailed;
    default:
      return "";
  }
}

function PasswordIcon({ visible }: { visible: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {visible ? (
        <path
          d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      ) : (
        <path
          d="M5 5l14 14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
