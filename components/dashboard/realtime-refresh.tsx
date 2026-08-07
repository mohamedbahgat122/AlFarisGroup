"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RealtimeRefreshProps = {
  channelName: string;
  table:
    | "driver_app_requests"
    | "app_notifications"
    | "driver_warnings"
    | "organization_shift_templates"
    | "organization_shift_assignments";
  filter?: string;
  toast: string;
  enabled?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function RealtimeRefresh({
  channelName,
  table,
  filter,
  toast,
  enabled = true,
  onRefresh,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      },
      () => {
        router.refresh();
        void onRefresh?.();
        setVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setVisible(false), 2800);
      },
    );

    channel.subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, filter, onRefresh, router, table]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 inset-e-5 z-80 rounded-xl border border-primary/20 bg-surface px-4 py-3 text-sm font-bold text-navy shadow-xl">
      {toast}
    </div>
  );
}
