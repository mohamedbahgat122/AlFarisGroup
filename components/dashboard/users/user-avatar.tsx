type UserAvatarProps = {
  fullName: string | null;
  avatarUrl?: string | null;
};

export function UserAvatar({ fullName, avatarUrl }: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary-soft text-sm font-bold text-primary">
        <img
          src={avatarUrl}
          alt={fullName || "User Avatar"}
          className="size-full object-cover"
        />
      </div>
    );
  }

  const initials = getInitials(fullName);

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-sm font-bold text-primary">
      {initials ? <span>{initials}</span> : <UserIcon />}
    </div>
  );
}

function getInitials(fullName: string | null) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "";
  }

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";

  return `${first}${last}`.toUpperCase();
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
