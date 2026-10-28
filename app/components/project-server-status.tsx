"use client";

import { useEffect, useState } from "react";
import type { PublicServerStatus } from "../lib/server-status";

export function ProjectServerStatus({ server }: { server: PublicServerStatus }) {
  const [currentServer, setCurrentServer] = useState(server);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/server-status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { servers?: PublicServerStatus[] };
        const update = payload.servers?.find((candidate) => candidate.slug === server.slug);
        if (active && update) setCurrentServer(update);
      } catch {
        // Keep the last public-safe state if the status endpoint is temporarily unavailable.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [server.slug]);

  const label = currentServer.status === "online" ? "Active" : currentServer.status === "offline" ? "Offline" : "Checking";
  return <span className={`project-status project-status-${currentServer.status}`} aria-live="polite"><i />{label}</span>;
}
