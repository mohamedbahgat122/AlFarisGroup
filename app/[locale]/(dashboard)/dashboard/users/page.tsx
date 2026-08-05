import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StatePanel } from "@/components/dashboard/users/users-table";
import { UserManagementClient } from "@/components/dashboard/users/user-management-client";
import { getDictionary } from "@/i18n/dictionaries";
import { requireSystemOwner } from "@/lib/auth/authorization";
import {
  getActiveOrganizationsForUserManagement,
  getManagedUsersForUserManagement,
} from "@/features/user-management/queries";
import { isLocale } from "@/types/locale";

type UsersRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({
  params,
}: UsersRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.userManagement;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function UsersRoute({ params }: UsersRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const systemOwner = await requireSystemOwner();

  if (!systemOwner.authorized) {
    redirect(`/${locale}/login`);
  }

  const dictionary = getDictionary(locale).dashboard.userManagement;
  const [organizations, usersResult] = await Promise.all([
    getActiveOrganizationsForUserManagement(),
    getManagedUsersForUserManagement(),
  ]);
  const creationDisabled =
    organizations.length === 0 || usersResult.status === "configuration_error";

  if (usersResult.status === "configuration_error") {
    return (
      <StatePage
        title={dictionary.configurationErrorTitle}
        description={dictionary.configurationErrorDescription}
      />
    );
  }

  if (usersResult.status === "load_error" || usersResult.status === "unauthorized") {
    return (
      <StatePage
        title={dictionary.loadErrorTitle}
        description={dictionary.loadErrorDescription}
      />
    );
  }

  return (
    <div className="min-h-full bg-background">
      {organizations.length === 0 ? (
        <div className="px-5 pt-6 sm:px-7">
          <StatePanel
            title={dictionary.noOrganizationsTitle}
            description={dictionary.noOrganizationsDescription}
          />
        </div>
      ) : null}
      <UserManagementClient
        locale={locale}
        dictionary={dictionary}
        organizations={organizations}
        users={usersResult.users}
        creationDisabled={creationDisabled}
      />
    </div>
  );
}

function StatePage({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <StatePanel title={title} description={description} />
    </div>
  );
}
