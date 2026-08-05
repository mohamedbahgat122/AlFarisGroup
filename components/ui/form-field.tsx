import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  errorId?: string;
  error?: string;
  trailingControl?: React.ReactNode;
};

export function FormField({
  id,
  label,
  errorId,
  error,
  trailingControl,
  className = "",
  ...props
}: FormFieldProps) {
  const describedBy = error ? errorId ?? `${id}-error` : errorId;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`min-h-12 w-full rounded-xl border bg-white px-4 text-base text-navy outline-none transition placeholder:text-muted/70 focus:ring-4 ${
            error
              ? "border-danger focus:border-danger focus:ring-danger/10"
              : "border-border focus:border-primary focus:ring-primary/10"
          } ${
            trailingControl ? "pe-12" : ""
          } ${className}`}
          {...props}
        />
        {trailingControl ? (
          <div className="absolute inset-y-0 end-1 flex items-center">
            {trailingControl}
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={describedBy} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : errorId ? (
        <p id={errorId} className="min-h-5 text-sm text-danger" />
      ) : null}
    </div>
  );
}
