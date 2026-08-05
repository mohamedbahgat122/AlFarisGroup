import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(11,108,251,0.22)] transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
