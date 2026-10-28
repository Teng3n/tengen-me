"use client";

import type { PublicServerStatus } from "../lib/server-status";
import { useCurrentServer } from "./use-current-server";

export function ProjectServerStatus({ server }: { server: PublicServerStatus }) {
  const currentServer = useCurrentServer(server);

  const label = currentServer.status === "online" ? "Active" : currentServer.status === "offline" ? "Offline" : "Checking";
  return <span className={`project-status project-status-${currentServer.status}`} aria-live="polite"><i />{label}</span>;
}

export function CurrentServerName({ server }: { server: PublicServerStatus }) {
  const currentServer = useCurrentServer(server);
  return <strong className="project-current-server" aria-live="polite">{currentServer.game}</strong>;
}
