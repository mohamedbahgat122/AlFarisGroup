import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { Locale } from "@/types/locale";
import { AvatarUpload } from "@/components/dashboard/profile/avatar-upload";
import { ProfileNameEdit } from "@/components/dashboard/profile/profile-name-edit";

type ProfilePageProps = {
  params: Promise<{ locale: Locale }>;
};

function AlertCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 shrink-0 text-blue-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export default async function ProfilePage(props: ProfilePageProps) {
  const params = await props.params;
  const dictionary = getDictionary(params.locale);
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    if (admin.status === "unauthenticated") {
      redirect(`/${params.locale}/login`);
    }
    notFound();
  }

  const { profile, user, avatarUrl } = admin;
  // @ts-ignore
  const roleLabel = dictionary.dashboard?.roleLabels?.[profile.role] ?? profile.role;
  // @ts-ignore
  const pDict = dictionary.profile || dictionary.dashboard?.profile || {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">{pDict.title || "Profile"}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <AvatarUpload
              dictionary={dictionary}
              user={{
                id: profile.id,
                fullName: profile.full_name,
                avatarUrl,
              }}
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-navy">
              {pDict.personalInfo || "Personal Information"}
            </h2>

            <div className="space-y-4">
              <ProfileNameEdit 
                initialName={profile.full_name} 
                isSystemOwner={profile.role === 'system_owner'} 
                label={pDict.fullName || "Full Name"} 
                noticeText={pDict.nameEditNotice || "Notice"} 
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-navy">
                  {pDict.email || "Email"}
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email ?? ""}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-navy">
                    {pDict.role || "Role"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={roleLabel}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-navy">
                    {pDict.jobTitle || "Job Title"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile.job_title}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
