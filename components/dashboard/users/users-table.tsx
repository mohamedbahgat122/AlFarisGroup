"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/dashboard/users/user-avatar";
import { UserBadge } from "@/components/dashboard/users/user-badges";
import {
  ActivityDialog,
  ConfirmationDialog,
  EditUserDialog,
  PermissionsDialog,
} from "@/components/dashboard/users/user-action-dialogs";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
  ManagedUserListItem,
  ManagedUsersQueryResult,
} from "@/features/user-management/types";
import type { Locale } from "@/types/locale";
import type { ReactNode } from "react";
import type { ToastState } from "@/components/dashboard/users/user-toast";

type UsersTableProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  users: ManagedUserListItem[];
  pagination: Extract<ManagedUsersQueryResult, { status: "success" }>["pagination"];
  organizations: ActiveOrganizationOption[];
  onToast: (toast: ToastState) => void;
};

type DialogState =
  | { type: "edit"; user: ManagedUserListItem }
  | { type: "permissions"; user: ManagedUserListItem }
  | { type: "status"; user: ManagedUserListItem }
  | { type: "archive"; user: ManagedUserListItem }
  | { type: "activity"; user: ManagedUserListItem }
  | null;

export function UsersTable({
  locale,
  dictionary,
  users,
  pagination,
  organizations,
  onToast,
}: UsersTableProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  function handleSuccess(message: string) {
    setDialog(null);
    onToast({ tone: "success", message });
    router.refresh();
  }

  if (users.length === 0) {
    return (
      <StatePanel
        title={dictionary.emptyTitle}
        description={dictionary.emptyDescription}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-start">
            <thead className="bg-background text-xs font-bold uppercase text-muted">
              <tr>
                <TableHeader>{dictionary.tableUser}</TableHeader>
                <TableHeader>{dictionary.tableRole}</TableHeader>
                <TableHeader>{dictionary.tableJobTitle}</TableHeader>
                <TableHeader>{dictionary.tableHomeOrganization}</TableHeader>
                <TableHeader>{dictionary.tableAdditionalAccess}</TableHeader>
                <TableHeader>{dictionary.tableStatus}</TableHeader>
                <TableHeader className="min-w-36 text-center whitespace-nowrap">
                  {dictionary.tableCreated}
                </TableHeader>
                <TableHeader>{dictionary.tableActions}</TableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const protectedUser = user.isSystemOwner;
                const rowClickable = !protectedUser;

                return (
                  <tr
                    key={user.id}
                    className={`align-middle transition ${
                      rowClickable ? "hover:bg-primary-soft/35" : ""
                    }`}
                    onClick={() => {
                      if (rowClickable) {
                        setDialog({ type: "edit", user });
                      }
                    }}
                  >
                    <td className="max-w-[260px] px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar fullName={user.fullName} avatarUrl={user.avatarUrl} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-navy">
                              {user.fullName}
                            </p>
                            {protectedUser ? (
                              <UserBadge tone="warning">
                                {dictionary.protectedUser}
                              </UserBadge>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted">
                            {user.email || dictionary.noEmail}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <UserBadge tone={protectedUser ? "warning" : "primary"}>
                        {dictionary.roleLabels[user.role]}
                      </UserBadge>
                    </td>
                    <td className="max-w-[180px] px-4 py-4">
                      <p className="truncate text-sm font-medium text-navy">
                        {user.jobTitle}
                      </p>
                    </td>
                    <td className="max-w-[210px] px-4 py-4">
                      <p className="truncate text-sm font-semibold text-navy">
                        {user.homeOrganization?.name ??
                          dictionary.noHomeOrganization}
                      </p>
                      {user.homeOrganization ? (
                        <p className="text-xs text-muted">
                          {user.homeOrganization.code}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-4 py-4">
                      <AdditionalAccessSummary
                        dictionary={dictionary}
                        user={user}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <UserBadge tone={user.status === "active" ? "success" : "muted"}>
                        {dictionary.statusLabels[user.status]}
                      </UserBadge>
                    </td>
                    <td className="min-w-36 whitespace-nowrap px-4 py-4 text-center text-sm font-medium text-muted">
                      {formatDate(user.createdAt, locale)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <ActionButton
                          label={
                            user.status === "active"
                              ? dictionary.suspendUser
                              : dictionary.reactivateUser
                          }
                          disabled={protectedUser}
                          onClick={() => setDialog({ type: "status", user })}
                          icon={user.status === "active" ? <SuspendIcon /> : <ReactivateIcon />}
                        />
                        <ActionButton
                          label={dictionary.managePermissions}
                          disabled={protectedUser}
                          onClick={() => setDialog({ type: "permissions", user })}
                          icon={<PermissionsIcon />}
                        />
                        <ActionButton
                          label={dictionary.activityLogs}
                          onClick={() => setDialog({ type: "activity", user })}
                          icon={<ActivityIcon />}
                        />
                        <ActionButton
                          label={dictionary.archiveUser}
                          disabled={protectedUser}
                          onClick={() => setDialog({ type: "archive", user })}
                          icon={<ArchiveIcon />}
                          destructive
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <PaginationControls
        locale={locale}
        dictionary={dictionary}
        pagination={pagination}
      />

      {dialog?.type === "edit" ? (
        <EditUserDialog
          locale={locale}
          dictionary={dictionary}
          user={dialog.user}
          organizations={organizations}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.updateSuccess)}
          onError={(message) => onToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.type === "permissions" ? (
        <PermissionsDialog
          locale={locale}
          dictionary={dictionary}
          user={dialog.user}
          organizations={organizations}
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.permissionsSuccess)}
          onError={(message) => onToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.type === "status" ? (
        <ConfirmationDialog
          locale={locale}
          dictionary={dictionary}
          user={dialog.user}
          mode={dialog.user.status === "active" ? "suspend" : "reactivate"}
          onClose={() => setDialog(null)}
          onSuccess={() =>
            handleSuccess(
              dialog.user.status === "active"
                ? dictionary.suspendSuccess
                : dictionary.reactivateSuccess,
            )
          }
          onError={(message) => onToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.type === "archive" ? (
        <ConfirmationDialog
          locale={locale}
          dictionary={dictionary}
          user={dialog.user}
          mode="archive"
          onClose={() => setDialog(null)}
          onSuccess={() => handleSuccess(dictionary.archiveSuccess)}
          onError={(message) => onToast({ tone: "error", message })}
        />
      ) : null}
      {dialog?.type === "activity" ? (
        <ActivityDialog
          locale={locale}
          dictionary={dictionary}
          user={dialog.user}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function PaginationControls({
  locale,
  dictionary,
  pagination,
}: {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  pagination: Extract<ManagedUsersQueryResult, { status: "success" }>["pagination"];
}) {
  const from = pagination.totalRows === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.totalRows);
  const previousHref = buildUsersPageHref(locale, pagination.page - 1, pagination.search);
  const nextHref = buildUsersPageHref(locale, pagination.page + 1, pagination.search);

  return (
    <div className="mt-4 flex flex-col gap-3 text-sm font-semibold text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        {dictionary.paginationSummary
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{total}", String(pagination.totalRows))}
      </p>
      <div className="flex items-center gap-2">
        {pagination.page > 1 ? (
          <a
            href={previousHref}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary"
          >
            {dictionary.previousPage}
          </a>
        ) : (
          <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
            {dictionary.previousPage}
          </span>
        )}
        <span className="rounded-lg border border-border bg-surface px-3 py-2">
          {pagination.page} / {pagination.totalPages}
        </span>
        {pagination.page < pagination.totalPages ? (
          <a
            href={nextHref}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary"
          >
            {dictionary.nextPage}
          </a>
        ) : (
          <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
            {dictionary.nextPage}
          </span>
        )}
      </div>
    </div>
  );
}

function buildUsersPageHref(locale: Locale, page: number, search: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search) params.set("search", search);
  const query = params.toString();
  return `/${locale}/dashboard/users${query ? `?${query}` : ""}`;
}

export function StatePanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function TableHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-start ${className}`}>{children}</th>;
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  destructive = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 ${
        destructive ? "hover:border-danger/40 hover:text-danger" : "hover:border-primary/35 hover:text-primary"
      }`}
    >
      {icon}
    </button>
  );
}

function AdditionalAccessSummary({
  dictionary,
  user,
}: {
  dictionary: Dictionary["dashboard"]["userManagement"];
  user: ManagedUserListItem;
}) {
  if (user.additionalAccess.length === 0) {
    return (
      <span className="text-sm text-muted">{dictionary.noAdditionalAccess}</span>
    );
  }

  if (user.additionalAccess.length === 1) {
    const [access] = user.additionalAccess;

    return (
      <UserBadge
        title={`${access.organizationName} - ${
          dictionary.accessLabels[access.accessLevel]
        }`}
      >
        {access.organizationName} - {dictionary.accessLabels[access.accessLevel]}
      </UserBadge>
    );
  }

  return (
    <UserBadge
      title={user.additionalAccess
        .map(
          (access) =>
            `${access.organizationName} - ${
              dictionary.accessLabels[access.accessLevel]
            }`,
        )
        .join(", ")}
    >
      {dictionary.additionalOrganizations.replace(
        "{count}",
        String(user.additionalAccess.length),
      )}
    </UserBadge>
  );
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function IconPath({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuspendIcon() {
  return <IconPath d="M15 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3.5 20a7.5 7.5 0 0 1 11.5-6.3M17 17h4" />;
}

function ReactivateIcon() {
  return <IconPath d="M15 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3.5 20a7.5 7.5 0 0 1 11.5-6.3m1.5 3.3 2 2 4-4" />;
}

function PermissionsIcon() {
  return <IconPath d="M12 3 5 6v5c0 4.2 2.8 7.8 7 10 4.2-2.2 7-5.8 7-10V6l-7-3Zm-2 9 1.5 1.5L15 10" />;
}

function ActivityIcon() {
  return <IconPath d="M12 8v5l3 2M4 4v5h5M4.5 14a8 8 0 1 0 2-8" />;
}

function ArchiveIcon() {
  return <IconPath d="M4 7h16M9 7V5h6v2m-8 3 1 10h8l1-10" />;
}
