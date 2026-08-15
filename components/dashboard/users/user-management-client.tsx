"use client";

import { useCallback, useState } from "react";
import { CreateUserDialog } from "@/components/dashboard/users/create-user-dialog";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import { UsersTable } from "@/components/dashboard/users/users-table";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
  ManagedUserListItem,
  ManagedUsersQueryResult,
} from "@/features/user-management/types";
import type { Locale } from "@/types/locale";

type UserManagementClientProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  organizations: ActiveOrganizationOption[];
  users: ManagedUserListItem[];
  pagination: Extract<ManagedUsersQueryResult, { status: "success" }>["pagination"];
  creationDisabled: boolean;
};

export function UserManagementClient({
  locale,
  dictionary,
  organizations,
  users,
  pagination,
  creationDisabled,
}: UserManagementClientProps) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <>
      <UserToast locale={locale} toast={toast} onDismiss={dismissToast} />
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-normal text-navy">
            {dictionary.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.description}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form className="flex min-w-0 gap-2" action={`/${locale}/dashboard/users`}>
            <label className="sr-only" htmlFor="user-management-search">
              {dictionary.searchUsers}
            </label>
            <input
              id="user-management-search"
              name="search"
              defaultValue={pagination.search}
              placeholder={dictionary.searchPlaceholder}
              className="min-h-11 min-w-0 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            />
            <button className="rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white">
              {dictionary.searchSubmit}
            </button>
          </form>
          {pagination.search ? (
            <a
              href={`/${locale}/dashboard/users`}
              className="rounded-xl border border-border bg-white px-4 py-2 text-center text-sm font-bold text-navy transition hover:border-primary/40 hover:text-primary"
            >
              {dictionary.clearSearch}
            </a>
          ) : null}
          <CreateUserDialog
            locale={locale}
            dictionary={dictionary}
            organizations={organizations}
            disabled={creationDisabled}
            onToast={setToast}
          />
        </div>
      </div>
      <div className="px-5 py-6 sm:px-7">
        <UsersTable
          locale={locale}
          dictionary={dictionary}
          users={users}
          pagination={pagination}
          organizations={organizations}
          onToast={setToast}
        />
      </div>
    </>
  );
}
