import type { ReactNode } from "react";

type DashboardLoadingStateProps = {
  message?: string;
  subtext?: string;
  className?: string;
};

type DashboardMutationOverlayProps = {
  active: boolean;
  message?: string;
};

const defaultLoadingMessage = "جاري تحميل البيانات...";
const defaultLoadingSubtext = "يرجى الانتظار";
const defaultMutationMessage = "جاري الحفظ...";

export function DashboardLoadingState({
  message = defaultLoadingMessage,
  subtext = defaultLoadingSubtext,
  className = "",
}: DashboardLoadingStateProps) {
  return (
    <div
      className={`flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-7 ${className}`}
    >
      <LoadingPanel message={message} subtext={subtext} />
    </div>
  );
}

export function DashboardMutationOverlay({
  active,
  message = defaultMutationMessage,
}: DashboardMutationOverlayProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-[85] flex items-center justify-center bg-background/70 px-5 py-10 backdrop-blur-sm">
      <LoadingPanel message={message} />
    </div>
  );
}

function LoadingPanel({
  message,
  subtext,
}: {
  message: string;
  subtext?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-64 flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-7 text-center shadow-[0_18px_55px_rgba(16,35,63,0.12)]"
    >
      <span className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <span className="text-base font-bold text-navy">{message}</span>
      {subtext ? (
        <span className="text-sm font-semibold text-muted">{subtext}</span>
      ) : null}
    </div>
  );
}
