"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RealtimeRefreshProps = {
  channelName: string;
  table:
    | "driver_app_requests"
    | "driver_entitlement_transactions"
    | "driver_entitlement_statements"
    | "app_notifications"
    | "driver_warnings"
    | "driver_shifts"
    | "fleet_vehicles"
    | "housing_units"
    | "housing_driver_assignments"
    | "organization_shift_templates"
    | "organization_shift_assignments";
  filter?: string;
  toast: string;
  enabled?: boolean;
  onRefresh?: () => void | Promise<void>;
};

type RealtimeRefreshSubscriber = {
  refresh: () => void;
  onRefresh?: () => void | Promise<void>;
  showToast: () => void;
};

const refreshDebounceMs = 350;
const realtimeRefreshSubscribers = new Map<string, RealtimeRefreshSubscriber>();
const pendingSubscriberIds = new Set<string>();
let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRealtimeRefresh(subscriberId: string) {
  pendingSubscriberIds.add(subscriberId);

  if (pendingRefreshTimer) return;

  pendingRefreshTimer = setTimeout(() => {
    pendingRefreshTimer = null;
    flushRealtimeRefresh();
  }, refreshDebounceMs);
}

function flushRealtimeRefresh() {
  const subscribers = Array.from(pendingSubscriberIds)
    .map((subscriberId) => realtimeRefreshSubscribers.get(subscriberId))
    .filter((subscriber): subscriber is RealtimeRefreshSubscriber => Boolean(subscriber));

  pendingSubscriberIds.clear();
  if (subscribers.length === 0) return;

  subscribers[0].refresh();

  for (const subscriber of subscribers) {
    void subscriber.onRefresh?.();
    subscriber.showToast();
  }
}

function removeRealtimeRefreshSubscriber(subscriberId: string) {
  realtimeRefreshSubscribers.delete(subscriberId);
  pendingSubscriberIds.delete(subscriberId);

  if (realtimeRefreshSubscribers.size === 0 && pendingRefreshTimer) {
    clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = null;
    pendingSubscriberIds.clear();
  }
}

export function RealtimeRefresh({
  channelName,
  table,
  filter,
  toast,
  enabled = true,
  onRefresh,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const subscriberId = useId();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    realtimeRefreshSubscribers.set(subscriberId, {
      refresh: () => router.refresh(),
      onRefresh,
      showToast: () => {
        setVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setVisible(false), 2800);
      },
    });

    return () => {
      removeRealtimeRefreshSubscriber(subscriberId);
    };
  }, [onRefresh, router, subscriberId]);

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
        scheduleRealtimeRefresh(subscriberId);
      },
    );

    channel.subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, filter, subscriberId, table]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 inset-e-5 z-80 rounded-xl border border-primary/20 bg-surface px-4 py-3 text-sm font-bold text-navy shadow-xl">
      {toast}
    </div>
  );
}
