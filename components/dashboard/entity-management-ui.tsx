"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function EntityPageHeader({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  viewOnlyLabel,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  viewOnlyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {eyebrow ? <AccessBadge>{eyebrow}</AccessBadge> : null}
          {viewOnlyLabel ? <AccessBadge>{viewOnlyLabel}</AccessBadge> : null}
        </div>
        <h1 className="text-2xl font-bold tracking-normal text-navy">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      {primaryAction || secondaryAction ? (
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
          {secondaryAction}
          {primaryAction}
        </div>
      ) : null}
    </div>
  );
}

export function EntityContent({ children }: { children: ReactNode }) {
  return <div className="px-5 py-6 sm:px-7">{children}</div>;
}

export function EntityTableContainer({
  children,
  readOnlyNotice,
}: {
  children: ReactNode;
  readOnlyNotice?: string;
}) {
  return (
    <div className="overflow-hidden border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <div className="overflow-x-auto">{children}</div>
      {readOnlyNotice ? (
        <p className="border-t border-border bg-background px-4 py-3 text-sm text-muted">
          {readOnlyNotice}
        </p>
      ) : null}
    </div>
  );
}

export function EntityEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      {icon ? (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary">
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function EntityFormDialog({
  title,
  subtitle,
  closeLabel,
  labelledBy,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  closeLabel: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstControl = dialogRef.current?.querySelector<HTMLElement>(
      "input, select, button, a, textarea",
    );
    firstControl?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={labelledBy} className="text-xl font-bold text-navy">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EntityFormBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div>
        <h3 className="text-base font-bold text-navy">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm font-medium text-muted">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function FormFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="block text-sm font-semibold text-navy">{label}</p>
      <div className="flex min-h-12 items-center rounded-xl border border-border bg-background px-4 text-base font-semibold text-muted">
        {value}
      </div>
    </div>
  );
}

export function SelectField({
  id,
  name,
  label,
  defaultValue,
  value,
  onChange,
  children,
  error,
  required = true,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  error?: string;
  required?: boolean;
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-12 w-full rounded-xl border bg-white px-4 text-base text-navy outline-none transition focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  id,
  name,
  label,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2 md:col-span-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-28 w-full rounded-xl border bg-white px-4 py-3 text-base leading-6 text-navy outline-none transition focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SecureFileField({
  id,
  name,
  label,
  required,
  help,
  selectedFileName,
  currentFile,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  currentLabel,
  selectedLabel,
  noFileSelectedLabel,
  removeSelectedLabel,
  downloadLabel,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  required: boolean;
  help: string;
  selectedFileName: string;
  currentFile?: {
    fileName: string;
    downloadUrl?: string | null;
    onDownload?: () => void;
  } | null;
  accept?: string;
  currentLabel: string;
  selectedLabel: string;
  noFileSelectedLabel: string;
  removeSelectedLabel: string;
  downloadLabel: string;
  error?: string;
  onChange: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = error ? `${id}-error` : undefined;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    onChange(file?.name ?? "");
  }

  function clearSelectedFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    onChange("");
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      {currentFile ? (
        <FileRow
          label={currentLabel}
          fileName={currentFile.fileName}
          downloadLabel={downloadLabel}
          downloadUrl={currentFile.downloadUrl}
          onDownload={currentFile.onDownload}
        />
      ) : null}
      {selectedFileName ? (
        <SelectedFileRow
          label={selectedLabel}
          fileName={selectedFileName}
          removeLabel={removeSelectedLabel}
          onRemove={clearSelectedFile}
        />
      ) : null}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        required={required}
        accept={accept}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={handleFileChange}
        className={`block w-full rounded-xl border bg-white px-4 py-3 text-sm text-navy file:me-4 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary focus:outline-none focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted">
        {selectedFileName || noFileSelectedLabel} · {help}
      </p>
    </div>
  );
}

export function DialogActions({
  cancel,
  submit,
  submitting,
  onCancel,
}: {
  cancel: string;
  submit: string;
  submitting?: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {cancel}
      </button>
      <Button type="submit" disabled={pending}>
        {pending ? (submitting ?? `${submit}...`) : submit}
      </Button>
    </div>
  );
}

export function TableHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-start ${className}`}>{children}</th>;
}

export function RowActionButton({
  label,
  type = "button",
  disabled = false,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  type?: "button" | "submit";
  disabled?: boolean;
  destructive?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-lg border transition disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        destructive
          ? "border-danger/20 text-danger hover:bg-danger/10"
          : "border-border text-muted hover:bg-primary-soft hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function AccessBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted">
      {children}
    </span>
  );
}

function FileRow({
  label,
  fileName,
  downloadLabel,
  downloadUrl,
  onDownload,
}: {
  label: string;
  fileName: string;
  downloadLabel: string;
  downloadUrl?: string | null;
  onDownload?: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold text-navy"
          dir="auto"
          title={fileName}
        >
          {fileName}
        </p>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={fileName}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <DownloadIcon />
            {downloadLabel}
          </a>
        ) : onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <DownloadIcon />
            {downloadLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SelectedFileRow({
  label,
  fileName,
  removeLabel,
  onRemove,
}: {
  label: string;
  fileName: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold text-navy"
          dir="auto"
          title={fileName}
        >
          {fileName}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-danger/35 hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {removeLabel}
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
