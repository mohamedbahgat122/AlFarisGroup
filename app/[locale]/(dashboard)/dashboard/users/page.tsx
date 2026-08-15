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
  searchParams?: Promise<{
    page?: string;
    search?: string;
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

export default async function UsersRoute({ params, searchParams }: UsersRouteProps) {
  const { locale } = await params;
  const query = (await searchParams) ?? {};

  if (!isLocale(locale)) {
    notFound();
  }

  const systemOwner = await requireSystemOwner();

  if (!systemOwner.authorized) {
    redirect(`/${locale}/login`);
  }

  const dictionary = getDictionary(locale).dashboard.userManagement;
  const page = Number(query.page);
  const [organizations, usersResult] = await Promise.all([
    getActiveOrganizationsForUserManagement(),
    getManagedUsersForUserManagement({
      page: Number.isFinite(page) ? page : 1,
      search: query.search ?? "",
    }),
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

  if (usersResult.status !== "success") {
    return (
      <StatePage
        title={dictionary.loadErrorTitle}
        description={dictionary.loadErrorDescription}
      />
    );
  }

  const successfulUsersResult = usersResult;

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
        users={successfulUsersResult.users}
        pagination={successfulUsersResult.pagination}
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
