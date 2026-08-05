"use client";

import { useCallback, useState } from "react";
import { CreateUserDialog } from "@/components/dashboard/users/create-user-dialog";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import { UsersTable } from "@/components/dashboard/users/users-table";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ActiveOrganizationOption,
  ManagedUserListItem,
} from "@/features/user-management/types";
import type { Locale } from "@/types/locale";

type UserManagementClientProps = {
  locale: Locale;
  dictionary: Dictionary["dashboard"]["userManagement"];
  organizations: ActiveOrganizationOption[];
  users: ManagedUserListItem[];
  creationDisabled: boolean;
};

export function UserManagementClient({
  locale,
  dictionary,
  organizations,
  users,
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
        <CreateUserDialog
          locale={locale}
          dictionary={dictionary}
          organizations={organizations}
          disabled={creationDisabled}
          onToast={setToast}
        />
      </div>
      <div className="px-5 py-6 sm:px-7">
        <UsersTable
          locale={locale}
          dictionary={dictionary}
          users={users}
          organizations={organizations}
          onToast={setToast}
        />
      </div>
    </>
  );
}
