"use client";

import type { PublicServerStatus } from "../lib/server-status";
import { useCurrentServer } from "./use-current-server";

export function ServerStatusLine({ server, includeIdentity = false }: { server: PublicServerStatus; includeIdentity?: boolean }) {
  const currentServer = useCurrentServer(server);

  const label = currentServer.status === "online"
    ? `Online · ${currentServer.lastUpdatedLabel}`
    : currentServer.status === "offline"
      ? `Offline · ${currentServer.lastUpdatedLabel}`
      : "Checking status";

  return <>
    {includeIdentity ? <div><p>{currentServer.game} server</p><span>{currentServer.region}</span></div> : null}
    <strong className={currentServer.status === "pending" ? "pending-label" : undefined} aria-live="polite">{label}</strong>
  </>;
}
