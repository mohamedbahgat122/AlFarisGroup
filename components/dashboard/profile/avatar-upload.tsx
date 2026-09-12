"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateAvatarPathAction } from "@/features/profile/actions";
import type { Dictionary } from "@/i18n/dictionaries";

type AvatarUploadProps = {
  dictionary: Dictionary;
  user: {
    id: string;
    avatarUrl: string | null;
    fullName: string | null;
  };
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className || "size-4"}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || "size-4 animate-spin"}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

export function AvatarUpload({ dictionary, user }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "";

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      // @ts-ignore
      setErrorMsg(dictionary.dashboard.profile?.errors?.fileType || "Invalid file type");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      // @ts-ignore
      setErrorMsg(dictionary.dashboard.profile?.errors?.fileSize || "File too large");
      return;
    }

    setIsUploading(true);

    try {
      const filePath = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const actionResult = await updateAvatarPathAction();
      
      if (!actionResult.success) {
        throw new Error(actionResult.error);
      }

      // @ts-ignore
      setSuccessMsg(dictionary.dashboard.profile?.success || "Success");
    } catch (error: any) {
      console.error("[Avatar Upload Error]", {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        error: error.error,
        details: error
      });
      // @ts-ignore
      setErrorMsg(dictionary.dashboard.profile?.errors?.uploadFailed || "Failed to upload");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative group">
        <div 
          className={`flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary-soft text-4xl font-bold text-primary shadow-sm transition-all ${isUploading ? "opacity-50" : "group-hover:opacity-80"}`}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.fullName || "Avatar"} className="size-full object-cover" />
          ) : initials ? (
            <span>{initials}</span>
          ) : (
            <UserIcon />
          )}
        </div>
        
        <button
          type="button"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="absolute bottom-0 right-0 flex size-10 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          // @ts-ignore
          aria-label={dictionary.dashboard.profile?.uploadPhoto || "Upload"}
        >
          {isUploading ? (
            <SpinnerIcon className="size-4 animate-spin text-white" />
          ) : (
            <CameraIcon className="size-4 text-white" />
          )}
        </button>
      </div>
      
      <div className="text-center">
        {/* @ts-ignore */}
        <p className="text-sm font-medium text-navy">{dictionary.dashboard.profile?.uploadPhoto || "Upload Photo"}</p>
        {/* @ts-ignore */}
        <p className="mt-1 text-xs text-muted">{dictionary.dashboard.profile?.photoRules || "Rules"}</p>
      </div>

      {errorMsg && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}
      {successMsg && (
        <p className="text-sm text-green-600">{successMsg}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
      />
    </div>
  );
}
