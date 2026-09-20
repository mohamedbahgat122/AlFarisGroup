"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PermissionRevisionSyncProps = {
  initialRevision: string;
  userId: string;
  message: string;
};

const fallbackIntervalMs = 300000;
const revisionCheckDebounceMs = 350;

export function PermissionRevisionSync({
  initialRevision,
  userId,
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
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

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
          if (notificationTimeout) {
            window.clearTimeout(notificationTimeout);
          }
          notificationTimeout = setTimeout(() => {
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

    function scheduleRevisionCheck() {
      if (cancelled || debounceTimeout) {
        return;
      }

      debounceTimeout = setTimeout(() => {
        debounceTimeout = null;
        void checkRevision();
      }, revisionCheckDebounceMs);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleRevisionCheck();
      }
    }

    const supabase = createClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const authorizationSubscriptions = [
      { table: "profiles", filter: `id=eq.${userId}` },
      { table: "organization_access", filter: `user_id=eq.${userId}` },
      {
        table: "organization_user_permissions",
        filter: `user_id=eq.${userId}`,
      },
      { table: "user_global_permissions", filter: `user_id=eq.${userId}` },
    ] as const;

    for (const subscription of authorizationSubscriptions) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        const channel = supabase.channel(
          `dashboard-permission-revision-${userId}-${subscription.table}-${event.toLowerCase()}`,
        );
        let hasSubscribed = false;

        channel.on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table: subscription.table,
            filter: subscription.filter,
          },
          scheduleRevisionCheck,
        );
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (hasSubscribed) {
              scheduleRevisionCheck();
            } else {
              hasSubscribed = true;
            }
          }
        });
        channels.push(channel);
      }
    }

    void checkRevision();
    window.addEventListener("focus", scheduleRevisionCheck);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", scheduleRevisionCheck);
    const interval = window.setInterval(scheduleRevisionCheck, fallbackIntervalMs);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", scheduleRevisionCheck);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", scheduleRevisionCheck);
      window.clearInterval(interval);
      if (debounceTimeout) window.clearTimeout(debounceTimeout);
      if (notificationTimeout) window.clearTimeout(notificationTimeout);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [router, userId]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 inset-e-5 z-80 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900 shadow-xl">
      {message}
    </div>
  );
}
