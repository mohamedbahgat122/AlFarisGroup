import Link from "next/link";
import type { Locale } from "@/types/locale";

type AccessDeniedProps = {
  locale: Locale;
  showOrganizationsLink?: boolean;
};

export function AccessDenied({
  locale,
  showOrganizationsLink = true,
}: AccessDeniedProps) {
  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <LockIcon />
        </div>
        <h1 className="mt-4 text-xl font-bold text-navy">
          ليس لديك صلاحية للوصول
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-7 text-muted">
          تم تحديث صلاحيات حسابك، ولم يعد لديك إذن للوصول إلى هذه الصفحة أو
          المؤسسة.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary/90"
          >
            العودة إلى لوحة التحكم
          </Link>
          {showOrganizationsLink ? (
            <Link
              href={`/${locale}/dashboard/organizations`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
            >
              العودة إلى المؤسسات
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2m-9.5 0h9A1.5 1.5 0 0 1 18 11.5v7A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5v-7A1.5 1.5 0 0 1 7.5 10Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
