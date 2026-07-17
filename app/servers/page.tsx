import { ServerStatusCard } from "../components/server-status-card";
import { SiteShell } from "../components/site-shell";
import { palworldServer } from "../lib/server-status";

export const metadata = { title: "Servers · tengen.me", description: "Public game-server status and connection information." };

export default function ServersPage() {
  return (
    <SiteShell>
      <main className="inner-page section-shell">
        <header className="page-heading"><p className="eyebrow"><span /> Servers</p><h1>The machines behind the worlds.</h1><p>Public-safe availability and player information, designed to stay useful when a live feed drops out.</p></header>
        <div className="server-page-grid">
          <ServerStatusCard server={palworldServer} />
          <aside className="integration-note">
            <p className="section-kicker">Connection plan</p>
            <h2>Local query. Small payload. No exposed network.</h2>
            <ol>
              <li><span>01</span><div><strong>Query inside the network</strong><p>A small agent checks Palworld from the same LAN.</p></div></li>
              <li><span>02</span><div><strong>Sanitize at the source</strong><p>Only status, counts, approved names, and a timestamp leave home.</p></div></li>
              <li><span>03</span><div><strong>Publish to one contract</strong><p>The widget reads the same shape for Palworld and future servers.</p></div></li>
            </ol>
          </aside>
        </div>
        <section className="data-contract">
          <div><p className="section-kicker">Public data boundary</p><h2>Share the signal, not the control plane.</h2></div>
          <div className="contract-tags"><span>Status</span><span>Player count</span><span>Approved player names</span><span>Last checked</span><span>Public address</span></div>
          <p>Private IPs, admin ports, credentials, raw logs, and remote-control actions never belong in this feed.</p>
        </section>
      </main>
    </SiteShell>
  );
}
