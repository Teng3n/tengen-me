"use client";

import { useEffect, useState } from "react";
import type { PublicServerStatus } from "../lib/server-status";

export function useCurrentServer(fallback: PublicServerStatus, intervalMs = 60_000) {
  const [currentServer, setCurrentServer] = useState(fallback);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/server-status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { servers?: PublicServerStatus[]; currentSlug?: string };
        const update = payload.servers?.find((candidate) => candidate.slug === payload.currentSlug)
          ?? payload.servers?.[0];
        if (active && update) setCurrentServer(update);
      } catch {
        // Keep the last public-safe state if the registry is temporarily unavailable.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return currentServer;
}
