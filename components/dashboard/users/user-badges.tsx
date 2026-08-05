import type { ReactNode } from "react";

type BadgeTone = "primary" | "muted" | "success" | "warning";

type UserBadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
};

export function UserBadge({
  children,
  tone = "muted",
  title,
}: UserBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex min-h-7 max-w-full items-center rounded-full px-2.5 text-xs font-semibold ${toneClassName(
        tone,
      )}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function toneClassName(tone: BadgeTone) {
  switch (tone) {
    case "primary":
      return "bg-primary-soft text-primary";
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "muted":
    default:
      return "bg-background text-muted";
  }
}
