"use client";

import type { PublicServerStatus } from "../lib/server-status";
import { useCurrentServer } from "./use-current-server";

export function ServerStatusCard({ server, featured = false }: { server: PublicServerStatus; featured?: boolean }) {
  const currentServer = useCurrentServer(server);

  const isOnline = currentServer.status === "online";
  const isPending = currentServer.status === "pending";
  const monitoringUnavailable = currentServer.sourceLabel === "Monitoring unavailable";
  const emptyMessage = isPending
    ? "Player information will appear when the server comes online."
    : isOnline && currentServer.players.current === null
      ? "Live player information isn’t connected yet."
      : isOnline ? "No players are online right now." : "The server is currently unavailable.";

  return (
    <article className={`server-card${featured ? " server-card-featured" : ""}`}>
      <div className="server-game-banner server-game-banner-enshrouded" role="img" aria-label={`${currentServer.game} active server`}>
        <strong className="server-game-title"><small>Active world</small>{currentServer.game}</strong>
      </div>
      <div className="server-card-body">
        <div className="server-card-topline">
          <span className={`server-state server-state-${currentServer.status}`} aria-live="polite">
            <i /> {isOnline ? "Online" : monitoringUnavailable ? "Monitoring unavailable" : isPending ? "Checking status" : "Offline"}
          </span>
        </div>
        <dl className="server-metrics">
          <div><dt>Players</dt><dd>{currentServer.players.current ?? "—"}{currentServer.players.maximum === null ? null : <span> / {currentServer.players.maximum}</span>}</dd></div>
          <div><dt>Region</dt><dd className="metric-text">{currentServer.region}</dd></div>
          <div><dt>Last check</dt><dd className="metric-text">{currentServer.lastUpdatedLabel}</dd></div>
        </dl>
        <div className="player-list">
          <div className="player-list-heading"><span>Who&apos;s online</span><span>{currentServer.playerNames.length} connected</span></div>
          {currentServer.playerNames.length > 0 ? (
            <ul>{currentServer.playerNames.map((player) => <li key={player}><span>{player.slice(0, 1).toUpperCase()}</span>{player}</li>)}</ul>
          ) : <p className="empty-state">{emptyMessage}</p>}
        </div>
      </div>
    </article>
  );
}
