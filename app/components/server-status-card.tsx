"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicServerStatus } from "../lib/server-status";

export function ServerStatusCard({ server, featured = false }: { server: PublicServerStatus; featured?: boolean }) {
  const [currentServer, setCurrentServer] = useState(server);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/server-status", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { servers?: PublicServerStatus[] };
      const update = payload.servers?.find((candidate) => candidate.slug === server.slug);
      if (update) setCurrentServer(update);
    } catch {
      // Keep the last known public-safe state when the status endpoint is unavailable.
    }
  }, [server.slug]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const isOnline = currentServer.status === "online";
  const isPending = currentServer.status === "pending";
  const emptyMessage = isPending
    ? "Waiting for the first update from the local Palworld bridge."
    : isOnline ? "No players are online right now." : "The server is currently unavailable.";

  return (
    <article className={`server-card${featured ? " server-card-featured" : ""}`}>
      <div className="server-card-topline">
        <span className={`server-state server-state-${currentServer.status}`} aria-live="polite">
          <i /> {isOnline ? "Online" : isPending ? "Bridge pending" : "Unavailable"}
        </span>
        <span className="server-source">{currentServer.sourceLabel}</span>
      </div>
      <div className="server-title-row">
        <div className="game-glyph">P</div>
        <div><p>{currentServer.game}</p><h2>{currentServer.name}</h2></div>
      </div>
      <dl className="server-metrics">
        <div><dt>Players</dt><dd>{currentServer.players.current ?? "—"}<span> / {currentServer.players.maximum}</span></dd></div>
        <div><dt>Region</dt><dd className="metric-text">{currentServer.region}</dd></div>
        <div><dt>Last check</dt><dd className="metric-text">{currentServer.lastUpdatedLabel}</dd></div>
      </dl>
      <div className="player-list">
        <div className="player-list-heading"><span>Who&apos;s online</span><span>{currentServer.playerNames.length} connected</span></div>
        {currentServer.playerNames.length > 0 ? (
          <ul>{currentServer.playerNames.map((player) => <li key={player}><span>{player.slice(0, 1).toUpperCase()}</span>{player}</li>)}</ul>
        ) : <p className="empty-state">{emptyMessage}</p>}
      </div>
    </article>
  );
}
