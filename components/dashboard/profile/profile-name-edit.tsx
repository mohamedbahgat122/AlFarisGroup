"use client";

import { useState } from "react";
import { updateProfileNameAction } from "@/features/profile/actions";
import { useRouter } from "next/navigation";

type ProfileNameEditProps = {
  initialName: string;
  isSystemOwner: boolean;
  label: string;
  noticeText: string;
};

export function ProfileNameEdit({ initialName, isSystemOwner, label, noticeText }: ProfileNameEditProps) {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    if (name === initialName || !name.trim()) return;
    setIsSaving(true);
    const result = await updateProfileNameAction(name);
    setIsSaving(false);
    if (result.success) {
      router.refresh();
    } else {
      // Revert on error
      setName(initialName);
    }
  };

  if (!isSystemOwner) {
    return (
      <>
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-blue-800">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 shrink-0 text-blue-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm">{noticeText}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-navy">
            {label}
          </label>
          <input
            type="text"
            disabled
            value={initialName}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-500"
          />
        </div>
      </>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-navy">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {name !== initialName && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? "..." : "حفظ"}
          </button>
        )}
      </div>
    </div>
  );
}
