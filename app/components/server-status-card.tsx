import type { PublicServerStatus } from "../lib/server-status";

export function ServerStatusCard({
  server,
  featured = false,
}: {
  server: PublicServerStatus;
  featured?: boolean;
}) {
  const isOnline = server.status === "online";
  const isPending = server.status === "pending";

  return (
    <article className={`server-card${featured ? " server-card-featured" : ""}`}>
      <div className="server-card-topline">
        <span className={`server-state server-state-${server.status}`}>
          <i /> {isOnline ? "Online" : isPending ? "Bridge pending" : "Unavailable"}
        </span>
        <span className="server-source">{server.sourceLabel}</span>
      </div>
      <div className="server-title-row">
        <div className="game-glyph">P</div>
        <div>
          <p>{server.game}</p>
          <h2>{server.name}</h2>
        </div>
      </div>
      <dl className="server-metrics">
        <div><dt>Players</dt><dd>{server.players.current ?? "—"}<span> / {server.players.maximum}</span></dd></div>
        <div><dt>Region</dt><dd className="metric-text">{server.region}</dd></div>
        <div><dt>Last check</dt><dd className="metric-text">{server.lastUpdatedLabel}</dd></div>
      </dl>
      <div className="player-list">
        <div className="player-list-heading"><span>Who&apos;s online</span><span>{server.playerNames.length} connected</span></div>
        {server.playerNames.length > 0 ? (
          <ul>{server.playerNames.map((player) => <li key={player}><span>{player.slice(0, 1).toUpperCase()}</span>{player}</li>)}</ul>
        ) : (
          <p className="empty-state">Player names will appear here after the local status bridge is connected.</p>
        )}
      </div>
    </article>
  );
}
