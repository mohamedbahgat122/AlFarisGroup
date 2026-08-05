import { signOutAction } from "@/features/auth/logout-actions";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type SignOutButtonProps = {
  locale: Locale;
  label: Dictionary["dashboard"]["signOut"];
};

export function SignOutButton({ locale, label }: SignOutButtonProps) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted shadow-sm transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <SignOutIcon />
      </button>
    </form>
  );
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h6A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 18.5V17M4 12h10M7.5 8.5 4 12l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
