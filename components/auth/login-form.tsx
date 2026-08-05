"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Dictionary } from "@/i18n/dictionaries";
import { signInAction } from "@/features/auth/actions";
import { initialLoginActionState } from "@/features/auth/login-state";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { Locale } from "@/types/locale";

type LoginFormProps = {
  locale: Locale;
  dictionary: Dictionary["login"];
};

export function LoginForm({ locale, dictionary }: LoginFormProps) {
  const [state, formAction] = useActionState(
    signInAction,
    initialLoginActionState,
  );
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <form
      className="mt-8 space-y-5"
      noValidate
      action={formAction}
    >
      <input type="hidden" name="locale" value={locale} />
      <FormField
        id="email"
        name="email"
        label={dictionary.email}
        type="email"
        inputMode="email"
        autoComplete="email"
        errorId="email-error"
      />
      <FormField
        id="password"
        name="password"
        label={dictionary.password}
        type={isPasswordVisible ? "text" : "password"}
        autoComplete="current-password"
        errorId="password-error"
        trailingControl={
          <button
            type="button"
            aria-label={
              isPasswordVisible
                ? dictionary.hidePassword
                : dictionary.showPassword
            }
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((current) => !current)}
            className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        }
      />
      {state.message ? (
        <p className="text-sm font-semibold text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton
        label={dictionary.submit}
        pendingLabel={dictionary.submitting}
      />
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="w-full disabled:opacity-70"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m4 4 16 16M9.9 5.6A9.4 9.4 0 0 1 12 5c6.1 0 9.5 7 9.5 7a15.8 15.8 0 0 1-2.9 3.7M6.5 7.7A16.4 16.4 0 0 0 2.5 12s3.4 7 9.5 7c1.4 0 2.6-.3 3.7-.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
