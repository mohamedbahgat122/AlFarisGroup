"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PermissionRevisionSyncProps = {
  initialRevision: string;
  intervalMs?: number;
  message: string;
};

export function PermissionRevisionSync({
  initialRevision,
  intervalMs = 12000,
  message,
}: PermissionRevisionSyncProps) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);
  const checkingRef = useRef(false);
  const refreshingRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    revisionRef.current = initialRevision;
  }, [initialRevision]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    async function checkRevision() {
      if (checkingRef.current) {
        return;
      }

      checkingRef.current = true;

      try {
        const response = await fetch("/api/dashboard/permissions/revision", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { revision?: unknown };

        if (
          typeof payload.revision === "string" &&
          payload.revision !== revisionRef.current &&
          !cancelled &&
          !refreshingRef.current
        ) {
          refreshingRef.current = true;
          revisionRef.current = payload.revision;
          setVisible(true);
          router.refresh();
          if (timeout) {
            window.clearTimeout(timeout);
          }
          timeout = setTimeout(() => {
            if (!cancelled) {
              setVisible(false);
              refreshingRef.current = false;
            }
          }, 3200);
        }
      } catch {
        // A missed poll is harmless; the next one will re-check server truth.
      } finally {
        checkingRef.current = false;
      }
    }

    function handleFocus() {
      void checkRevision();
    }

    void checkRevision();
    window.addEventListener("focus", handleFocus);
    const interval = window.setInterval(() => {
      void checkRevision();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [intervalMs, router]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 inset-e-5 z-80 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900 shadow-xl">
      {message}
    </div>
  );
}
