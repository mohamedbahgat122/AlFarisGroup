import { BrandIdentity } from "@/components/brand/brand-identity";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type LoginPageProps = {
  locale: Locale;
  dictionary: Dictionary;
};

export function LoginPage({ locale, dictionary }: LoginPageProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[0_26px_90px_rgba(16,35,63,0.12)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.04fr_0.96fr]">
        <section className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-navy px-6 py-10 sm:px-10 lg:min-h-full lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(215,170,75,0.28),transparent_32%),linear-gradient(135deg,rgba(11,108,251,0.24),transparent_46%)]" />
          <div className="absolute inset-x-10 top-10 h-px bg-gold/40" />
          <BrandIdentity locale={locale} />
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-10 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-10 flex justify-end">
              <LanguageSwitcher
                locale={locale}
                label={dictionary.alternateLocaleName}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">
                {dictionary.login.title}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-navy sm:text-4xl">
                {dictionary.login.welcome}
              </h1>
              <p className="mt-3 text-base leading-7 text-muted">
                {dictionary.login.intro}
              </p>
            </div>
            <LoginForm locale={locale} dictionary={dictionary.login} />
          </div>
        </section>
      </div>
    </main>
  );
}
